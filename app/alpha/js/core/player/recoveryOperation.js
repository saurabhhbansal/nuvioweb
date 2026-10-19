// Caller-owned recovery operation state (#12 units 3-4).
//
// The recovery planner (`playbackRecoveryPolicy.js`) is pure and cannot stop a
// caller from re-planning identical inputs; this module is the caller-side
// record that does. It owns one recovery operation per playback generation:
// which tracks were already attempted, how many alternate and restore attempts
// happened, and whether the operation is still open.
//
// No network, no player mutation, no persistence, no logging. The caller executes
// actions; this module only decides whether an action is still allowed.

export const RECOVERY_OPERATION_STATE = Object.freeze({
  OPEN: "open",
  CLOSED: "closed"
});

export const RECOVERY_OPERATION_REASONS = Object.freeze({
  NONE: "none",
  INVALID_REQUEST: "invalid-request",
  STALE_GENERATION: "stale-generation",
  CLOSED: "operation-closed",
  ALTERNATE_LIMIT: "alternate-limit",
  RESTORE_LIMIT: "restore-limit",
  ALREADY_ATTEMPTED: "already-attempted",
  TRACK_NOT_ALLOWED: "track-not-allowed"
});

const MAX_KEY = 160;
const MAX_ATTEMPTS = 1000;

function validKey(value) {
  if (typeof value !== "string") return "";
  const clean = value.trim();
  if (!clean || clean.length > MAX_KEY) return "";
  return clean;
}

function validLimit(value, fallback) {
  if (value === undefined) return fallback;
  return Number.isInteger(value) && value >= 0 && value <= MAX_ATTEMPTS ? value : null;
}

// One operation per generation. `begin` records the track that failed; every
// later offer must be a different, not-yet-attempted track.
export function createRecoveryOperation({ generation = 0, maxAlternate = 1, maxRestore = 1 } = {}) {
  // A generation is a number, not a numeric string: coercion hides caller bugs.
  const generationValue = typeof generation === "number" ? generation : Number.NaN;
  const alternateLimit = validLimit(maxAlternate, 1);
  const restoreLimit = validLimit(maxRestore, 1);
  const valid =
    Number.isInteger(generationValue) &&
    generationValue > 0 &&
    alternateLimit !== null &&
    restoreLimit !== null;

  let state = RECOVERY_OPERATION_STATE.OPEN;
  let failedTrackKey = null;
  let alternateAttempts = 0;
  let restoreAttempts = 0;
  let closeReason = RECOVERY_OPERATION_REASONS.NONE;
  const attempted = [];

  const refuse = (why) => ({ ok: false, reason: why });

  const guard = (key) => {
    if (!valid) return refuse(RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
    if (state !== RECOVERY_OPERATION_STATE.OPEN) {
      return refuse(RECOVERY_OPERATION_REASONS.CLOSED);
    }
    if (!validKey(key)) return refuse(RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
    return { ok: true };
  };

  const record = (kind, key) => {
    attempted.push({ kind, trackKey: key });
    if (kind === "alternate") alternateAttempts += 1;
    else restoreAttempts += 1;
  };

  return {
    get generation() {
      return generationValue;
    },
    get state() {
      return state;
    },

    isCurrent(candidateGeneration) {
      return (
        state === RECOVERY_OPERATION_STATE.OPEN && Number(candidateGeneration) === generationValue
      );
    },

    begin(trackKey) {
      const check = guard(trackKey);
      if (!check.ok) return check;
      if (failedTrackKey) return refuse(RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
      failedTrackKey = validKey(trackKey);
      return { ok: true, reason: RECOVERY_OPERATION_REASONS.NONE };
    },

    offerAlternate(trackKey) {
      const check = guard(trackKey);
      if (!check.ok) return check;
      const key = validKey(trackKey);
      if (!failedTrackKey || key === failedTrackKey) {
        return refuse(RECOVERY_OPERATION_REASONS.TRACK_NOT_ALLOWED);
      }
      if (attempted.some((entry) => entry.trackKey === key)) {
        return refuse(RECOVERY_OPERATION_REASONS.ALREADY_ATTEMPTED);
      }
      if (alternateAttempts >= alternateLimit) {
        return refuse(RECOVERY_OPERATION_REASONS.ALTERNATE_LIMIT);
      }
      record("alternate", key);
      return { ok: true, reason: RECOVERY_OPERATION_REASONS.NONE };
    },

    offerRestore(trackKey) {
      const check = guard(trackKey);
      if (!check.ok) return check;
      const key = validKey(trackKey);
      // Restoring the rendition that just failed is not a recovery.
      if (key === failedTrackKey) {
        return refuse(RECOVERY_OPERATION_REASONS.TRACK_NOT_ALLOWED);
      }
      if (attempted.some((entry) => entry.trackKey === key)) {
        return refuse(RECOVERY_OPERATION_REASONS.ALREADY_ATTEMPTED);
      }
      if (restoreAttempts >= restoreLimit) {
        return refuse(RECOVERY_OPERATION_REASONS.RESTORE_LIMIT);
      }
      record("restore", key);
      return { ok: true, reason: RECOVERY_OPERATION_REASONS.NONE };
    },

    canOffer(trackKey) {
      const check = guard(trackKey);
      if (!check.ok) return check;
      const key = validKey(trackKey);
      if (attempted.some((entry) => entry.trackKey === key)) {
        return refuse(RECOVERY_OPERATION_REASONS.ALREADY_ATTEMPTED);
      }
      return { ok: true, reason: RECOVERY_OPERATION_REASONS.NONE };
    },

    // Close on completion, cancellation, source change, stop or navigation.
    close(why = RECOVERY_OPERATION_REASONS.CLOSED) {
      if (state === RECOVERY_OPERATION_STATE.CLOSED) return false;
      state = RECOVERY_OPERATION_STATE.CLOSED;
      closeReason =
        typeof why === "string" && why && why.length <= 64
          ? why
          : RECOVERY_OPERATION_REASONS.CLOSED;
      return true;
    },

    // Invalidate only when the caller's generation still matches; a stale caller
    // must not close the current operation.
    invalidate(
      candidateGeneration = generationValue,
      why = RECOVERY_OPERATION_REASONS.STALE_GENERATION
    ) {
      if (Number(candidateGeneration) !== generationValue) {
        return refuse(RECOVERY_OPERATION_REASONS.STALE_GENERATION);
      }
      return { ok: this.close(why), reason: why };
    },

    snapshot() {
      return {
        generation: generationValue,
        state,
        closeReason,
        failedTrackKey,
        alternateAttempts,
        restoreAttempts,
        limits: { alternate: alternateLimit, restore: restoreLimit },
        attempted: attempted.map((entry) => ({ ...entry }))
      };
    }
  };
}
