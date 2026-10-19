// Pure recovery planning for the browser player (#12 units 3-4).
//
// This module decides *whether and what to offer* after a playback or track
// selection failure. It performs no fetch, no player mutation, no persistence
// and no logging; the caller owns every side effect.
//
// Rules enforced here (docs/plans/issues/issue-12.md §4-§5):
// - A generic media error is never treated as an audio-only failure without
//   attributable evidence.
// - The last confirmed rendition is restored at most once; an alternate is
//   offered at most once per recovery operation.
// - Automatic matching never substitutes another language, commentary or audio
//   description for the failed rendition.
// - A stale generation never yields a recovery action.

export const RECOVERY_ACTIONS = Object.freeze({
  OFFER_TRACK: "offer-track",
  RESTORE_TRACK: "restore-track",
  UNSUPPORTED: "unsupported",
  NONE: "none"
});

export const RECOVERY_REASONS = Object.freeze({
  NONE: "none",
  NO_FAILURE: "no-failure",
  GENERATION_CHANGED: "generation-changed",
  AUDIO_NOT_ATTRIBUTABLE: "audio-not-attributable",
  NO_TRACKS: "no-tracks",
  AMBIGUOUS_FAILED_TRACK: "ambiguous-failed-track",
  NO_ALTERNATE: "no-alternate",
  ALTERNATE_ELIGIBLE: "alternate-eligible",
  ALTERNATE_TRIED: "alternate-tried",
  RESTORE_ELIGIBLE: "restore-eligible",
  RESTORE_TRIED: "restore-tried",
  USER_CHOICE: "user-choice",
  USER_CHOICE_UNAVAILABLE: "user-choice-unavailable",
  UNSUPPORTED_FORMAT: "unsupported-format"
});

export const RECOVERY_FAILURE_KIND = Object.freeze({
  AUDIO: "audio",
  GENERIC: "generic",
  CONTAINER: "container",
  UNKNOWN: "unknown"
});

const AUDIO_TRACK_ROLES = new Set([
  "main",
  "alternate",
  "commentary",
  "audio-description",
  "unknown"
]);
const MAX_TRACKS = 32;
const MAX_KEY = 160;

function text(value, limit = MAX_KEY) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, limit);
}

function plan(action, reason, extra = {}) {
  return { action, trackKey: null, reason, ...extra };
}

function selectable(track) {
  return Boolean(
    track &&
    track.selectability === "available" &&
    track.ambiguous !== true &&
    typeof track.key === "string" &&
    track.key
  );
}

// An automatic substitute must be the same kind of rendition: same language and
// same role. A commentary track is never offered for a main track, and another
// language is never offered for the failed language.
function compatibleAlternate(candidate, failed) {
  if (!selectable(candidate)) return false;
  if (candidate.key === failed.key) return false;
  const failedRole = AUDIO_TRACK_ROLES.has(failed.role) ? failed.role : "unknown";
  const candidateRole = AUDIO_TRACK_ROLES.has(candidate.role) ? candidate.role : "unknown";
  if (candidateRole !== failedRole) return false;
  const failedLanguage = text(failed.language, 32).toLowerCase();
  const candidateLanguage = text(candidate.language, 32).toLowerCase();
  // Unknown languages only match unknown languages: a missing tag is not a
  // licence to substitute a different language.
  return failedLanguage === candidateLanguage;
}

function attemptCount(attempts, name) {
  const value = Number(attempts?.[name]);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function planAudioRecovery({
  generation = 0,
  currentGeneration = null,
  tracks = [],
  failedTrackKey = "",
  lastConfirmedTrackKey = "",
  failure = null,
  attempts = null,
  userChoice = null
} = {}) {
  const trackList = Array.isArray(tracks) ? tracks.slice(0, MAX_TRACKS).filter(Boolean) : [];
  const generationValue = Number(generation);
  const currentValue = currentGeneration === null ? generationValue : Number(currentGeneration);
  if (
    !Number.isFinite(generationValue) ||
    !Number.isFinite(currentValue) ||
    generationValue !== currentValue
  ) {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.GENERATION_CHANGED);
  }
  if (!failure || typeof failure !== "object") {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.NO_FAILURE);
  }

  const failedKey = text(failedTrackKey);
  const failedTracks = failedKey ? trackList.filter((track) => track?.key === failedKey) : [];
  if (failedTracks.length > 1) {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.AMBIGUOUS_FAILED_TRACK);
  }
  const failed = failedTracks[0] || null;

  // An explicit user choice comes first, but it must be an addressable track.
  const requestedKey = text(userChoice);
  if (requestedKey) {
    const matches = trackList.filter((track) => track?.key === requestedKey);
    if (matches.length === 1 && selectable(matches[0]) && matches[0].key !== failedKey) {
      return plan(RECOVERY_ACTIONS.OFFER_TRACK, RECOVERY_REASONS.USER_CHOICE, {
        trackKey: requestedKey
      });
    }
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.USER_CHOICE_UNAVAILABLE, {
      trackKey: requestedKey
    });
  }

  // Without attributable audio evidence this is not an audio problem.
  if (failure.audioAttributable !== true) {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.AUDIO_NOT_ATTRIBUTABLE);
  }
  if (!trackList.length) {
    return plan(RECOVERY_ACTIONS.UNSUPPORTED, RECOVERY_REASONS.NO_TRACKS);
  }
  if (failure.kind === RECOVERY_FAILURE_KIND.CONTAINER) {
    return plan(RECOVERY_ACTIONS.UNSUPPORTED, RECOVERY_REASONS.UNSUPPORTED_FORMAT);
  }
  if (!failed) {
    return plan(RECOVERY_ACTIONS.UNSUPPORTED, RECOVERY_REASONS.NO_ALTERNATE);
  }

  const stage = text(failure.stage, 16).toLowerCase();
  const restoreKey = text(lastConfirmedTrackKey);
  const restoreCandidate =
    restoreKey && restoreKey !== failedKey
      ? trackList.filter((track) => track?.key === restoreKey && selectable(track))[0] || null
      : null;
  const alternateCandidate =
    trackList.filter((track) => compatibleAlternate(track, failed))[0] || null;

  // A failed *selection* restores the previous rendition first, once.
  if (stage === "selection" && restoreCandidate && attemptCount(attempts, "restore") < 1) {
    return plan(RECOVERY_ACTIONS.RESTORE_TRACK, RECOVERY_REASONS.RESTORE_ELIGIBLE, {
      trackKey: restoreCandidate.key
    });
  }
  if (alternateCandidate && attemptCount(attempts, "alternate") < 1) {
    return plan(RECOVERY_ACTIONS.OFFER_TRACK, RECOVERY_REASONS.ALTERNATE_ELIGIBLE, {
      trackKey: alternateCandidate.key
    });
  }
  // No compatible alternate; a still-eligible previous rendition may be restored
  // once as a last resort.
  if (restoreCandidate && attemptCount(attempts, "restore") < 1) {
    return plan(RECOVERY_ACTIONS.RESTORE_TRACK, RECOVERY_REASONS.RESTORE_ELIGIBLE, {
      trackKey: restoreCandidate.key
    });
  }
  const restoreTried = attemptCount(attempts, "restore") >= 1;
  const alternateTried = attemptCount(attempts, "alternate") >= 1;
  if (restoreTried) {
    return plan(RECOVERY_ACTIONS.UNSUPPORTED, RECOVERY_REASONS.RESTORE_TRIED);
  }
  return plan(
    RECOVERY_ACTIONS.UNSUPPORTED,
    alternateTried ? RECOVERY_REASONS.ALTERNATE_TRIED : RECOVERY_REASONS.NO_ALTERNATE
  );
}
