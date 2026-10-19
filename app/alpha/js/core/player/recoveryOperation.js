// Caller-owned recovery operation state (#12 units 3-4).
//
// The recovery planner (`playbackRecoveryPolicy.js`) is pure and cannot stop a
// caller from re-planning identical inputs; this module is the caller-side
// record that does. It owns one recovery operation per playback generation:
// which tracks were already attempted, how many alternate and restore attempts
// happened, and whether the operation is still open.
//
// The plan's invariant is exactly one alternate and one restore attempt per
// operation, so limits are fixed at one and cannot be configured away.
//
// No network, no player mutation, no persistence, no logging.

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
  TRACK_NOT_ALLOWED: "track-not-allowed",
  NOT_STARTED: "not-started",
  UNKNOWN_ACTION: "unknown-action",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  SOURCE_CHANGED: "source-changed",
  NAVIGATION: "navigation"
});

export const RECOVERY_OPERATION_ACTION = Object.freeze({
  ALTERNATE: "alternate",
  RESTORE: "restore"
});

const MAX_KEY = 160;
const MAX_REASON = 64;
const MAX_ATTEMPTS = 1;
const REASON_VALUES = new Set(Object.values(RECOVERY_OPERATION_REASONS));

function validKey(value) {
  if (typeof value !== "string") return "";
  const clean = value.trim();
  if (!clean || clean.length > MAX_KEY) return "";
  return clean;
}

// A generation is a positive safe integer number. Numeric strings, floats,
// NaN, infinities and values beyond safe-integer precision are all invalid:
// coercion would hide caller bugs and make generations indistinguishable.
function validGeneration(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function normalizeReason(value, fallback) {
  return typeof value === "string" && value && value.length <= MAX_REASON ? value : fallback;
}

function isKnownReason(value) {
  return REASON_VALUES.has(value);
}

export function createRecoveryOperation({ generation = 0 } = {}) {
  const generationValue = generation;
  const valid = validGeneration(generationValue);

  let state = RECOVERY_OPERATION_STATE.OPEN;
  let failedTrackKey = null;
  let alternateAttempts = 0;
  let restoreAttempts = 0;
  let closeReason = RECOVERY_OPERATION_REASONS.NONE;
  const attempted = [];

  const refuse = (why) => ({ ok: false, reason: why });

  // Shared gate: validity, caller generation, open state and key shape.
  const guard = (trackKey, callerGeneration) => {
    if (!valid) return refuse(RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
    if (!validGeneration(callerGeneration) || callerGeneration !== generationValue) {
      return refuse(RECOVERY_OPERATION_REASONS.STALE_GENERATION);
    }
    if (state !== RECOVERY_OPERATION_STATE.OPEN) {
      return refuse(RECOVERY_OPERATION_REASONS.CLOSED);
    }
    if (!validKey(trackKey)) return refuse(RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
    return { ok: true, key: validKey(trackKey) };
  };

  // One eligibility rule for both offering and reporting, so canOffer cannot
  // claim permission for an action that offer would refuse.
  const eligibility = (kind, key) => {
    if (!failedTrackKey) return refuse(RECOVERY_OPERATION_REASONS.NOT_STARTED);
    if (key === failedTrackKey) return refuse(RECOVERY_OPERATION_REASONS.TRACK_NOT_ALLOWED);
    if (attempted.some((entry) => entry.trackKey === key)) {
      return refuse(RECOVERY_OPERATION_REASONS.ALREADY_ATTEMPTED);
    }
    if (kind === RECOVERY_OPERATION_ACTION.ALTERNATE) {
      if (alternateAttempts >= MAX_ATTEMPTS) {
        return refuse(RECOVERY_OPERATION_REASONS.ALTERNATE_LIMIT);
      }
      return { ok: true, reason: RECOVERY_OPERATION_REASONS.NONE };
    }
    if (kind === RECOVERY_OPERATION_ACTION.RESTORE) {
      if (restoreAttempts >= MAX_ATTEMPTS) {
        return refuse(RECOVERY_OPERATION_REASONS.RESTORE_LIMIT);
      }
      return { ok: true, reason: RECOVERY_OPERATION_REASONS.NONE };
    }
    return refuse(RECOVERY_OPERATION_REASONS.UNKNOWN_ACTION);
  };

  const offer = (kind, trackKey, callerGeneration) => {
    const check = guard(trackKey, callerGeneration);
    if (!check.ok) return check;
    const allowed = eligibility(kind, check.key);
    if (!allowed.ok) return allowed;
    attempted.push({ kind, trackKey: check.key });
    if (kind === RECOVERY_OPERATION_ACTION.ALTERNATE) alternateAttempts += 1;
    else restoreAttempts += 1;
    return { ok: true, reason: RECOVERY_OPERATION_REASONS.NONE };
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
        valid &&
        state === RECOVERY_OPERATION_STATE.OPEN &&
        validGeneration(candidateGeneration) &&
        candidateGeneration === generationValue
      );
    },

    begin(trackKey, callerGeneration = generationValue) {
      const check = guard(trackKey, callerGeneration);
      if (!check.ok) return check;
      if (failedTrackKey) return refuse(RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
      failedTrackKey = check.key;
      return { ok: true, reason: RECOVERY_OPERATION_REASONS.NONE };
    },

    offerAlternate(trackKey, callerGeneration = generationValue) {
      return offer(RECOVERY_OPERATION_ACTION.ALTERNATE, trackKey, callerGeneration);
    },

    offerRestore(trackKey, callerGeneration = generationValue) {
      return offer(RECOVERY_OPERATION_ACTION.RESTORE, trackKey, callerGeneration);
    },

    canOffer(kind, trackKey, callerGeneration = generationValue) {
      const check = guard(trackKey, callerGeneration);
      if (!check.ok) return check;
      return eligibility(kind, check.key);
    },

    // Close on completion, cancellation, source change, stop or navigation.
    close(why = RECOVERY_OPERATION_REASONS.CLOSED) {
      if (state === RECOVERY_OPERATION_STATE.CLOSED) return false;
      state = RECOVERY_OPERATION_STATE.CLOSED;
      const candidate = normalizeReason(why, RECOVERY_OPERATION_REASONS.CLOSED);
      closeReason = isKnownReason(candidate) ? candidate : RECOVERY_OPERATION_REASONS.CLOSED;
      return true;
    },

    // Invalidate only when the caller's generation still matches; a stale caller
    // must not close the current operation, and the returned reason is the one
    // that was actually stored.
    invalidate(callerGeneration, why = RECOVERY_OPERATION_REASONS.STALE_GENERATION) {
      if (!valid) return refuse(RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
      if (!validGeneration(callerGeneration) || callerGeneration !== generationValue) {
        return refuse(RECOVERY_OPERATION_REASONS.STALE_GENERATION);
      }
      if (state === RECOVERY_OPERATION_STATE.CLOSED) {
        return refuse(RECOVERY_OPERATION_REASONS.CLOSED);
      }
      this.close(why);
      return { ok: true, reason: closeReason };
    },

    snapshot() {
      return {
        generation: generationValue,
        state,
        closeReason,
        failedTrackKey,
        alternateAttempts,
        restoreAttempts,
        limits: { alternate: MAX_ATTEMPTS, restore: MAX_ATTEMPTS },
        attempted: attempted.map((entry) => ({ ...entry }))
      };
    }
  };
}
