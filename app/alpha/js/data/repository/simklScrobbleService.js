import { SimklAuthService } from "./simklAuthService.js";
import { simklRequest } from "./simklAuthService.js";
import { SimklSyncService } from "./simklSyncService.js";
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
const WATCHED_THRESHOLD_PERCENT = 80;
let startTimer = null;
let failures = 0;
let lastAction = null;

function clearStartTimer() {
  if (startTimer) clearTimeout(startTimer);
  startTimer = null;
}

function normalizeProgress(value) {
  return Math.round(Math.max(0, Math.min(100, Number(value || 0))) * 100) / 100;
}

function buildPayload(context = {}) {
  const snapshot = SimklSyncService.getSnapshot();
  const entry = SimklSyncService.findEntry(snapshot, {
    contentId: context.contentId,
    imdbId: context.imdbId,
    tmdbId: context.tmdbId
  });
  let ids = SimklSyncService.externalIds(context, entry);
  let season = context.seasonNumber == null ? null : Number(context.seasonNumber);
  let episode = context.episodeNumber == null ? null : Number(context.episodeNumber);
  const animeVideoMatch = String(context.videoId || "").match(
    /^(mal|anidb|anilist|kitsu):(\d+):(\d+)/i
  );
  const isAnime = entry?.mediaType === "anime" || Boolean(animeVideoMatch);
  if (animeVideoMatch) {
    ids = { [animeVideoMatch[1].toLowerCase()]: Number(animeVideoMatch[2]) };
    season = null;
    episode = Number(animeVideoMatch[3]);
  } else if (isAnime && season != null && season > 0) {
    for (const key of ["simkl", "mal", "anidb", "anilist", "kitsu"]) delete ids[key];
  }
  const media = {
    title: context.title || undefined,
    year: context.year == null ? undefined : Number(context.year),
    ids
  };
  const payload = { progress: normalizeProgress(context.progressPercent) };
  if (context.contentType !== "series") {
    payload.movie = media;
  } else {
    if (isAnime && season == null) payload.anime = media;
    else payload.show = media;
    payload.episode = {
      ...(season == null ? {} : { season }),
      number: episode,
      ...(context.episodeTitle ? { title: context.episodeTitle } : {})
    };
  }
  return payload;
}

function positionKey(context = {}) {
  return `${context.contentId || ""}:${context.seasonNumber ?? ""}:${context.episodeNumber ?? ""}`;
}

// A position saved while Simkl was out of reach, sent as a pause.
registerTrackerSender("simkl", "position", async (context) => {
  if (!SimklAuthService.isAuthenticated()) throw new Error("Simkl is not connected");
  await simklRequest("/scrobble/pause", { method: "POST", body: buildPayload(context), retry: false });
});

async function send(action, context, { queueOnFailure = false } = {}) {
  if (!SimklAuthService.isAuthenticated() || failures >= 3) return;
  if (context.contentType === "series" && !Number(context.episodeNumber || 0)) return;
  try {
    await simklRequest(`/scrobble/${action}`, {
      method: "POST",
      body: buildPayload(context),
      retry: false
    });
    failures = 0;
    lastAction = action === "stop" ? null : action;
    const profileId = String(ProfileManager.getActiveProfileId() || "1");
    // What was just sent is newer than any position saved for this title.
    dropTrackerWrite({ provider: "simkl", kind: "position", key: positionKey(context), profileId });
    void flushTrackerOutbox({ profileId });
    if (action === "stop" && Number(context.progressPercent || 0) >= WATCHED_THRESHOLD_PERCENT) {
      const { watchedItemsRepository } = await import("./watchedItemsRepository.js");
      await watchedItemsRepository.mark(
        {
          contentId: context.contentId,
          contentType: context.contentType,
          title: context.title,
          season: context.contentType === "series" ? context.seasonNumber : null,
          episode: context.contentType === "series" ? context.episodeNumber : null,
          watchedAt: Date.now()
        },
        { skipTrackingWrite: true }
      );
    }
  } catch (error) {
    // Only a refusal counts toward giving up; see TraktScrobbleService.
    if (isRetryableTrackerFailure(error)) {
      if (queueOnFailure) {
        enqueueTrackerWrite({
          provider: "simkl",
          kind: "position",
          key: positionKey(context),
          payload: context,
          profileId: String(ProfileManager.getActiveProfileId() || "1")
        });
      }
    } else {
      failures += 1;
    }
    console.warn(`[SimklScrobble] ${action} failed`, error);
  }
}

export const SimklScrobbleService = {
  isEnabled() {
    return ownsWatchProgress(WatchProgressSource.SIMKL) && SimklAuthService.isAuthenticated();
  },

  start(context) {
    clearStartTimer();
    startTimer = setTimeout(() => {
      startTimer = null;
      void send("start", context);
    }, START_DEBOUNCE_MS);
  },

  pause(context) {
    clearStartTimer();
    if (lastAction === "start") void send("pause", context);
  },

  // A terminal position past the watched threshold, where a stop would finish
  // the title instead of recording where the viewer got to. Unlike pause() this
  // needs no scrobble session behind it: the report it carries is the whole
  // story, and there may never have been a session at all.
  reportPosition(context) {
    clearStartTimer();
    void send("pause", context, { queueOnFailure: true });
    lastAction = null;
  },

  stop(context) {
    clearStartTimer();
    // A finish is not queued here: its history write is, with the real time.
    void send("stop", context, {
      queueOnFailure: Number(context?.progressPercent || 0) < WATCHED_THRESHOLD_PERCENT
    });
    lastAction = null;
  },

  cancel() {
    clearStartTimer();
    failures = 0;
    lastAction = null;
  }
};
