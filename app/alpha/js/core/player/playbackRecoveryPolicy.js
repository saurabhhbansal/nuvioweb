// Pure recovery planning for the browser player (#12 units 3-4).
//
// This module decides *whether and what to offer automatically* after an audio
// failure. It performs no fetch, no player mutation, no persistence and no
// logging; the caller owns every side effect, including operation identity and
// replay protection (a pure function cannot prevent a caller from re-planning
// the same inputs).
//
// Explicit user selection is NOT planned here. A user choosing a track is a
// plain selection handled by the selection contract (resolveAudioSelectionRequest
// in browserAudioTracks.js); it may cross language and role and is not an
// automatic recovery attempt.
//
// Rules enforced here (docs/archive/plans/issues/issue-12.md §4-§5):
// - A generic media error is never treated as an audio-only failure without
//   attributable evidence.
// - A stale generation or a stale track snapshot yields no action.
// - The last confirmed rendition is restored at most once; an alternate is
//   offered at most once per recovery operation.
// - Automatic matching never substitutes another language, commentary or audio
//   description. Restoring the previous *user-selected* rendition after a failed
//   selection is the one documented exception.
// - Ambiguous identities and malformed state fail closed instead of guessing.

export const RECOVERY_ACTIONS = Object.freeze({
  OFFER_TRACK: "offer-track",
  RESTORE_TRACK: "restore-track",
  UNSUPPORTED: "unsupported",
  NONE: "none"
});

export const RECOVERY_REASONS = Object.freeze({
  NONE: "none",
  NO_FAILURE: "no-failure",
  INVALID_STATE: "invalid-state",
  INVALID_KEY: "invalid-key",
  GENERATION_CHANGED: "generation-changed",
  AUDIO_NOT_ATTRIBUTABLE: "audio-not-attributable",
  NO_TRACKS: "no-tracks",
  AMBIGUOUS_FAILED_TRACK: "ambiguous-failed-track",
  AMBIGUOUS_CANDIDATE: "ambiguous-candidate",
  NO_ALTERNATE: "no-alternate",
  ALTERNATE_ELIGIBLE: "alternate-eligible",
  ALTERNATE_TRIED: "alternate-tried",
  RESTORE_ELIGIBLE: "restore-eligible",
  RESTORE_TRIED: "restore-tried",
  UNSUPPORTED_FORMAT: "unsupported-format"
});

export const RECOVERY_FAILURE_KIND = Object.freeze({
  AUDIO: "audio",
  GENERIC: "generic",
  CONTAINER: "container",
  UNKNOWN: "unknown"
});

const ROLES = new Set(["main", "alternate", "commentary", "audio-description", "unknown"]);
const MAX_TRACKS = 32;
const MAX_KEY = 160;
const MAX_ATTEMPTS = 1000;
const TRACK_FIELDS = ["key", "selectability", "ambiguous", "role", "language", "generation"];

function plan(action, reason, extra = {}) {
  return { action, trackKey: null, reason, ...extra };
}

// Read an own, plain data property without invoking getters or inheriting
// values from the prototype chain.
function ownDataProperty(object, name) {
  if (!object || typeof object !== "object") return { ok: false, value: undefined };
  const descriptor = Object.getOwnPropertyDescriptor(object, name);
  if (!descriptor) return { ok: false, value: undefined };
  if (!("value" in descriptor)) return { ok: false, accessor: true };
  return { ok: true, value: descriptor.value };
}

function plainInteger(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

function validKey(value) {
  if (typeof value !== "string") return "";
  const clean = value.trim();
  if (!clean || clean.length > MAX_KEY) return "";
  return clean;
}

// Validate and copy only the fields the planner relies on. A track whose used
// fields are accessors, or whose key is invalid, is dropped rather than trusted.
function sanitizeTracks(tracks) {
  if (!Array.isArray(tracks)) return { ok: false, tracks: [] };
  if (tracks.length > MAX_TRACKS) return { ok: false, tracks: [] };
  const sanitized = [];
  for (const track of tracks) {
    if (!track || typeof track !== "object") return { ok: false, tracks: [] };
    const entry = {};
    for (const field of TRACK_FIELDS) {
      const read = ownDataProperty(track, field);
      if (read.accessor) return { ok: false, tracks: [] };
      entry[field] = read.ok ? read.value : undefined;
    }
    entry.key = validKey(entry.key);
    if (!entry.key) return { ok: false, tracks: [] };
    if (
      entry.generation !== undefined &&
      !plainInteger(entry.generation, Number.MAX_SAFE_INTEGER)
    ) {
      return { ok: false, tracks: [] };
    }
    sanitized.push(entry);
  }
  return { ok: true, tracks: sanitized };
}

function selectable(track) {
  return Boolean(track && track.selectability === "available" && track.ambiguous !== true);
}

// An automatic substitute must be the same kind of rendition: same role, same
// language. An unspecified language only matches another unspecified language.
function compatible(candidate, failed) {
  if (!selectable(candidate)) return false;
  if (candidate.key === failed.key) return false;
  const failedRole = ROLES.has(failed.role) ? failed.role : "unknown";
  const candidateRole = ROLES.has(candidate.role) ? candidate.role : "unknown";
  if (candidateRole !== failedRole) return false;
  const failedLanguage =
    typeof failed.language === "string" ? failed.language.trim().toLowerCase() : "";
  const candidateLanguage =
    typeof candidate.language === "string" ? candidate.language.trim().toLowerCase() : "";
  return failedLanguage === candidateLanguage;
}

function readAttempts(attempts) {
  if (attempts === null || attempts === undefined) return { ok: true, alternate: 0, restore: 0 };
  if (typeof attempts !== "object") return { ok: false };
  const counts = {};
  for (const name of ["alternate", "restore"]) {
    const read = ownDataProperty(attempts, name);
    // An absent counter means "not tried yet"; a present but malformed counter
    // is invalid state and must not be coerced to zero.
    if (!read.ok) {
      counts[name] = 0;
      continue;
    }
    if (!plainInteger(read.value, MAX_ATTEMPTS)) return { ok: false };
    counts[name] = read.value;
  }
  return { ok: true, ...counts };
}

function readFailure(failure) {
  if (!failure || typeof failure !== "object") return { ok: false };
  const attributable = ownDataProperty(failure, "audioAttributable");
  if (!attributable.ok || typeof attributable.value !== "boolean") return { ok: false };
  const kind = ownDataProperty(failure, "kind");
  const stage = ownDataProperty(failure, "stage");
  return {
    ok: true,
    audioAttributable: attributable.value,
    kind: kind.ok && typeof kind.value === "string" ? kind.value : RECOVERY_FAILURE_KIND.UNKNOWN,
    stage: stage.ok && typeof stage.value === "string" ? stage.value.trim().toLowerCase() : ""
  };
}

export function planAudioRecovery({
  generation = 0,
  currentGeneration = null,
  tracks = [],
  failedTrackKey = "",
  lastConfirmedTrackKey = "",
  failure = null,
  attempts = null
} = {}) {
  const generationValue = Number(generation);
  const currentValue = currentGeneration === null ? generationValue : Number(currentGeneration);
  if (
    !Number.isInteger(generationValue) ||
    generationValue <= 0 ||
    !Number.isInteger(currentValue) ||
    generationValue !== currentValue
  ) {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.GENERATION_CHANGED);
  }
  if (!failure || typeof failure !== "object") {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.NO_FAILURE);
  }
  const failureState = readFailure(failure);
  if (!failureState.ok) {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.INVALID_STATE);
  }
  const attemptState = readAttempts(attempts);
  if (!attemptState.ok) {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.INVALID_STATE);
  }
  const failedKey = validKey(failedTrackKey);
  const restoreKey = validKey(lastConfirmedTrackKey);
  if (!failedKey || (lastConfirmedTrackKey !== "" && !restoreKey)) {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.INVALID_KEY);
  }
  // Without attributable audio evidence this is not an audio problem.
  if (failureState.audioAttributable !== true) {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.AUDIO_NOT_ATTRIBUTABLE);
  }
  if (failureState.kind === RECOVERY_FAILURE_KIND.CONTAINER) {
    return plan(RECOVERY_ACTIONS.UNSUPPORTED, RECOVERY_REASONS.UNSUPPORTED_FORMAT);
  }
  const sanitized = sanitizeTracks(tracks);
  if (!sanitized.ok) {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.INVALID_STATE);
  }
  const list = sanitized.tracks;
  if (!list.length) {
    return plan(RECOVERY_ACTIONS.UNSUPPORTED, RECOVERY_REASONS.NO_TRACKS);
  }
  // Every actionable identity must be unique and current, including the failed
  // track: an ambiguous or stale identity is never guessed at.
  const matches = list.filter((track) => track.key === failedKey);
  if (matches.length !== 1) {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.AMBIGUOUS_FAILED_TRACK);
  }
  const failed = matches[0];
  if (failed.ambiguous === true) {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.AMBIGUOUS_FAILED_TRACK);
  }
  if (failed.generation !== undefined && failed.generation !== generationValue) {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.GENERATION_CHANGED);
  }
  const currentTrack = (track) =>
    track.generation === undefined || track.generation === generationValue;
  const uniqueByKey = (key) => list.filter((track) => track.key === key);

  const restoreMatches = restoreKey ? uniqueByKey(restoreKey) : [];
  if (restoreMatches.length > 1) {
    return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.AMBIGUOUS_CANDIDATE);
  }
  const restoreCandidate =
    restoreMatches.length === 1 &&
    selectable(restoreMatches[0]) &&
    currentTrack(restoreMatches[0]) &&
    restoreMatches[0].key !== failedKey
      ? restoreMatches[0]
      : null;

  const alternateCandidates = list.filter(
    (track) => compatible(track, failed) && currentTrack(track)
  );
  // A duplicated key could make "the alternate" ambiguous; require exactly one.
  const alternateKeys = new Set(alternateCandidates.map((track) => track.key));
  for (const key of alternateKeys) {
    if (uniqueByKey(key).length > 1) {
      return plan(RECOVERY_ACTIONS.NONE, RECOVERY_REASONS.AMBIGUOUS_CANDIDATE);
    }
  }
  const alternateCandidate = alternateCandidates[0] || null;
  const stage = failureState.stage;

  // A failed *selection* restores the previous user-selected rendition first,
  // once. This is the documented exception to role/language matching: it puts
  // back what the user was already listening to, it is capped, and it never
  // crosses to a different track than the recorded previous one.
  if (stage === "selection" && restoreCandidate && attemptState.restore < 1) {
    return plan(RECOVERY_ACTIONS.RESTORE_TRACK, RECOVERY_REASONS.RESTORE_ELIGIBLE, {
      trackKey: restoreCandidate.key
    });
  }
  if (alternateCandidate && attemptState.alternate < 1) {
    return plan(RECOVERY_ACTIONS.OFFER_TRACK, RECOVERY_REASONS.ALTERNATE_ELIGIBLE, {
      trackKey: alternateCandidate.key
    });
  }
  // After a playback failure the restore must also be a compatible rendition: an
  // automatic fallback may not switch language or role.
  if (restoreCandidate && attemptState.restore < 1 && compatible(restoreCandidate, failed)) {
    return plan(RECOVERY_ACTIONS.RESTORE_TRACK, RECOVERY_REASONS.RESTORE_ELIGIBLE, {
      trackKey: restoreCandidate.key
    });
  }
  if (attemptState.restore >= 1) {
    return plan(RECOVERY_ACTIONS.UNSUPPORTED, RECOVERY_REASONS.RESTORE_TRIED);
  }
  return plan(
    RECOVERY_ACTIONS.UNSUPPORTED,
    attemptState.alternate >= 1 ? RECOVERY_REASONS.ALTERNATE_TRIED : RECOVERY_REASONS.NO_ALTERNATE
  );
}
