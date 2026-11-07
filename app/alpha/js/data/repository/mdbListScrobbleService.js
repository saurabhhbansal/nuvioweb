// Playback reports to MDBList while it owns Watch Progress. Same session rules
// as SimklScrobbleService: start after 15 s of playing, pause and stop as they
// happen, a stop past 80% is a finish, and a report that can't get through is
// saved and sent later (trackerOutbox.js). Payload shape from upstream NuvioWeb
// (GPL-3.0); requests go straight to MDBList (mdbListApi.js).

import { MdbListTracking, mdbListApiJson } from "./mdbListApi.js";
import { WatchProgressSource } from "../local/traktSettingsStore.js";
import { ownsWatchProgress } from "./trackingWriteScope.js";
import {
  dropTrackerWrite,
  enqueueTrackerWrite,
  flushTrackerOutbox,
  isRetryableTrackerFailure,
  registerTrackerSender,
  trackerHistoryKey
} from "./trackerOutbox.js";
import { ProfileManager } from "../../core/profile/profileManager.js";

const START_DEBOUNCE_MS = 15000;
const WATCHED_THRESHOLD_PERCENT = 80;
const MAX_CONSECUTIVE_FAILURES = 3;
let startTimer = null;
let failures = 0;
let lastAction = null;

function clearStartTimer() {
  if (startTimer) clearTimeout(startTimer);
  startTimer = null;
}

function idsFor(context = {}) {
  const ids = {};
  const raw = String(context.contentId || "").trim();
  const imdb = String(context.imdbId || (/^tt\d+$/i.test(raw) ? raw : "")).trim();
  if (/^tt\d+$/i.test(imdb)) ids.imdb = imdb;
  const tmdb = Number(context.tmdbId ?? (raw.match(/^tmdb:(\d+)$/i)?.[1] || 0));
  if (tmdb > 0) ids.tmdb = tmdb;
  const trakt = Number(context.traktId ?? (raw.match(/^trakt:(\d+)$/i)?.[1] || 0));
  if (trakt > 0) ids.trakt = trakt;
  return ids;
}

export function buildMdbListScrobblePayload(context = {}) {
  const ids = idsFor(context);
  if (!Object.keys(ids).length) return null;
  const progress = Math.max(0, Math.min(100, Math.round(Number(context.progressPercent || 0) * 100) / 100));
  if (context.contentType !== "series") return { movie: { ids }, progress };
  const season = Number(context.seasonNumber);
  const episode = Number(context.episodeNumber);
  if (!Number.isFinite(season) || season < 0 || !Number.isFinite(episode) || episode < 1) return null;
  return { show: { ids, season, episode }, progress };
}

function positionKey(context = {}) {
  return `${context.contentId || ""}:${context.seasonNumber ?? ""}:${context.episodeNumber ?? ""}`;
}

async function post(action, context) {
  const payload = buildMdbListScrobblePayload(context);
  if (!payload) return false;
  await mdbListApiJson(`/scrobble/${action}`, { method: "POST", body: payload });
  return true;
}

// A position saved while MDBList was out of reach, sent as a pause.
registerTrackerSender("mdblist", "position", async (context) => {
  if (!MdbListTracking.isAuthenticated()) throw new Error("MDBList is not connected");
  await post("pause", context);
});

function savedContext(context = {}) {
  const keep = ["contentId", "videoId", "contentType", "imdbId", "tmdbId", "traktId", "title", "year",
    "seasonNumber", "episodeNumber", "episodeTitle", "positionMs", "durationMs", "progressPercent"];
  return Object.fromEntries(keep.filter((key) => context[key] != null).map((key) => [key, context[key]]));
}

function queueFailedScrobble(action, context, profileId) {
  if (action === "stop" && Number(context?.progressPercent || 0) >= WATCHED_THRESHOLD_PERCENT) {
    const item = {
      contentId: context.contentId,
      contentType: context.contentType === "series" ? "series" : "movie",
      season: context.contentType === "series" ? context.seasonNumber ?? null : null,
      episode: context.contentType === "series" ? context.episodeNumber ?? null : null,
      title: context.title || undefined,
      year: context.year || undefined,
      imdbId: context.imdbId || undefined,
      tmdbId: context.tmdbId || undefined,
      traktId: context.traktId || undefined,
      videoId: context.videoId || undefined,
      watchedAt: Date.now()
    };
    enqueueTrackerWrite({ provider: "mdblist", kind: "history", key: trackerHistoryKey(item), payload: item, profileId });
    return;
  }
  enqueueTrackerWrite({ provider: "mdblist", kind: "position", key: positionKey(context), payload: savedContext(context), profileId });
}

async function send(action, context, { queueOnFailure = false } = {}) {
  if (!MdbListTracking.isAuthenticated() || failures >= MAX_CONSECUTIVE_FAILURES) return;
  if (context.contentType === "series" && !Number(context.episodeNumber || 0)) return;
  const profileId = String(ProfileManager.getActiveProfileId() || "1");
  try {
    if (!(await post(action, context))) return;
    failures = 0;
    lastAction = action === "stop" ? null : action;
    dropTrackerWrite({ provider: "mdblist", kind: "position", key: positionKey(context), profileId });
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
    if (isRetryableTrackerFailure(error)) {
      if (queueOnFailure) queueFailedScrobble(action, context, profileId);
    } else {
      failures += 1;
    }
    console.warn(`[MdbListScrobble] ${action} failed`, error);
  }
}

export const MdbListScrobbleService = {
  isEnabled() {
    return ownsWatchProgress(WatchProgressSource.MDBLIST) && MdbListTracking.isAuthenticated();
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

  reportPosition(context) {
    clearStartTimer();
    void send("pause", context, { queueOnFailure: true });
    lastAction = null;
  },

  stop(context) {
    clearStartTimer();
    void send("stop", context, { queueOnFailure: true });
    lastAction = null;
  },

  cancel() {
    clearStartTimer();
    failures = 0;
    lastAction = null;
  }
};
