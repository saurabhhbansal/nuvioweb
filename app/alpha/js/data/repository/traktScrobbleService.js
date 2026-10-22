import { TraktAuthService, requestJson } from "./traktAuthService.js";
import { WatchProgressSource } from "../local/traktSettingsStore.js";
import { ownsWatchProgress } from "./trackingWriteScope.js";
import {
  dropTrackerWrite,
  enqueueTrackerWrite,
  flushTrackerOutbox,
  isRetryableTrackerFailure,
  registerTrackerSender
} from "./trackerOutbox.js";
import { ProfileManager } from "../../core/profile/profileManager.js";

const START_DEBOUNCE_MS = 15000;
const MAX_CONSECUTIVE_FAILURES = 3;
const WATCHED_THRESHOLD_PERCENT = 80;

let startDebounceTimer = null;
let consecutiveFailures = 0;
let lastAction = null;

function clearStartTimer() {
  if (startDebounceTimer) {
    clearTimeout(startDebounceTimer);
    startDebounceTimer = null;
  }
}

function buildMoviePayload(context) {
  const movie = { title: context.title };
  if (context.year) {
    movie.year = context.year;
  }
  const ids = {};
  if (context.imdbId) {
    ids.imdb = context.imdbId;
  }
  if (context.tmdbId) {
    ids.tmdb = context.tmdbId;
  }
  if (context.traktId) {
    ids.trakt = context.traktId;
  }
  if (Object.keys(ids).length) {
    movie.ids = ids;
  }
  return { movie, progress: context.progressPercent };
}

function buildEpisodePayload(context) {
  const show = { title: context.title };
  if (context.year) {
    show.year = context.year;
  }
  const showIds = {};
  if (context.imdbId) {
    showIds.imdb = context.imdbId;
  }
  if (context.tmdbId) {
    showIds.tmdb = context.tmdbId;
  }
  if (context.traktId) {
    showIds.trakt = context.traktId;
  }
  if (Object.keys(showIds).length) {
    show.ids = showIds;
  }
  const episode = {
    season: context.seasonNumber,
    number: context.episodeNumber
  };
  if (context.episodeTitle) {
    episode.title = context.episodeTitle;
  }
  return { show, episode, progress: context.progressPercent };
}

function buildScrobblePayload(context) {
  return context.contentType === "series"
    ? buildEpisodePayload(context)
    : buildMoviePayload(context);
}

async function markAsWatchedLocally(context) {
  try {
    const { watchedItemsRepository } = await import("./watchedItemsRepository.js");
    const item = {
      contentId: context.contentId,
      watchedAt: Date.now()
    };
    if (context.contentType === "series") {
      item.season = context.seasonNumber;
      item.episode = context.episodeNumber;
    }
    await watchedItemsRepository.mark(item, { skipTrackingWrite: true });
  } catch (error) {
    console.warn("[TraktScrobble] mark-as-watched failed", error);
  }
}

// Sends one scrobble. False when there is no signed-in Trakt account; throws
// with the HTTP status when Trakt does not accept it.
async function postScrobble(action, context) {
  const accessToken = await TraktAuthService.getValidAccessToken();
  if (!accessToken) return false;
  const { response } = await requestJson(`/scrobble/${action}`, {
    method: "POST",
    body: buildScrobblePayload(context),
    authorization: `Bearer ${accessToken}`
  });
  if (!response.ok) {
    const error = new Error(`Trakt scrobble ${action} failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return true;
}

function positionKey(context = {}) {
  return `${context.contentId || ""}:${context.seasonNumber ?? ""}:${context.episodeNumber ?? ""}`;
}

// A position saved while Trakt was out of reach. Sent as a pause, which is how
// Trakt records "stopped here"; it arrives stamped with the time it is sent.
registerTrackerSender("trakt", "position", async (context) => {
  if (!(await postScrobble("pause", context))) throw new Error("Trakt is not connected");
});

async function sendScrobbleRequest(action, context, { queueOnFailure = false } = {}) {
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return;
  }

  if (!context?.imdbId && !context?.tmdbId && !context?.traktId) {
    return;
  }

  try {
    if (!(await postScrobble(action, context))) return;
    consecutiveFailures = 0;
    lastAction = action;
    // Trakt is reachable again, so anything saved while it was not can go.
    const profileId = String(ProfileManager.getActiveProfileId() || "1");
    // What was just sent is newer than any position saved for this title.
    dropTrackerWrite({ provider: "trakt", kind: "position", key: positionKey(context), profileId });
    void flushTrackerOutbox({ profileId });

    if (action === "stop" && context.progressPercent >= WATCHED_THRESHOLD_PERCENT) {
      await markAsWatchedLocally(context);
    }
  } catch (error) {
    // Only a refusal counts toward giving up. No network is not a refusal:
    // counting it switched scrobbling off for the rest of the session, so
    // nothing was sent even after the network came back.
    if (isRetryableTrackerFailure(error)) {
      if (queueOnFailure) {
        enqueueTrackerWrite({
          provider: "trakt",
          kind: "position",
          key: positionKey(context),
          payload: context,
          profileId: String(ProfileManager.getActiveProfileId() || "1")
        });
      }
    } else {
      consecutiveFailures++;
    }
    console.warn(`[TraktScrobble] ${action} failed`, {
      status: error?.status || null,
      error: error?.message,
      failures: consecutiveFailures
    });
  }
}

export const TraktScrobbleService = {
  isEnabled() {
    return ownsWatchProgress(WatchProgressSource.TRAKT) && TraktAuthService.isAuthenticated();
  },

  start(context) {
    clearStartTimer();
    startDebounceTimer = setTimeout(() => {
      startDebounceTimer = null;
      void sendScrobbleRequest("start", context);
    }, START_DEBOUNCE_MS);
  },

  pause(context) {
    clearStartTimer();
    if (lastAction === "start" || lastAction === null) {
      void sendScrobbleRequest("pause", context);
    }
  },

  stop(context) {
    clearStartTimer();
    // A finish is not queued here: its history write is, with the real time.
    void sendScrobbleRequest("stop", context, {
      queueOnFailure: Number(context?.progressPercent || 0) < WATCHED_THRESHOLD_PERCENT
    });
    lastAction = null;
  },

  // See SimklScrobbleService.reportPosition: a pause that stands on its own,
  // for the band a stop cannot carry without claiming the title is finished.
  reportPosition(context) {
    clearStartTimer();
    void sendScrobbleRequest("pause", context, { queueOnFailure: true });
    lastAction = null;
  },

  cancel() {
    clearStartTimer();
    lastAction = null;
  }
};
