// Deadline bookkeeping for the recovery loader (#12 unit 3 rebuild).
//
// The held-back loader review found that deadlines could fire after success and
// that cleanup was not guaranteed on every terminal path. This module owns that
// state so the rebuilt loader cannot double-settle a request or leave a timer.
//
// Pure: no fetch, no I/O, no logging. Timers and clocks are injected, so tests
// are deterministic.

export const RECOVERY_DEADLINE_MS = Object.freeze({
  playlist: 5000,
  fragment: 10000
});

export const RECOVERY_DEADLINE_OUTCOMES = Object.freeze({
  SUCCESS: "success",
  ERROR: "error",
  TIMEOUT: "timeout",
  CANCELLED: "cancelled"
});

// Init segments are small and fetched before playback; they share the fragment
// budget rather than inventing a third one.
export function deadlineMsFor(kind) {
  return kind === "playlist" ? RECOVERY_DEADLINE_MS.playlist : RECOVERY_DEADLINE_MS.fragment;
}

export function createDeadline({
  kind = "fragment",
  onTimeout = null,
  now = () => Date.now(),
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (handle) => clearTimeout(handle)
} = {}) {
  const ms = deadlineMsFor(kind);
  const startedAt = now();
  let handle = null;
  let settled = false;
  let disposed = false;
  let outcome = null;
  let generation = 0;

  const clear = () => {
    if (handle !== null) {
      clearTimer(handle);
      handle = null;
    }
  };

  const deadline = {
    ms,
    startedAt,
    kind,
    get settled() {
      return settled;
    },
    get outcome() {
      return outcome;
    },
    get pending() {
      return !settled && !disposed;
    },
    get disposed() {
      return disposed;
    },
    arm() {
      // A disposed deadline is terminal: re-arming would resurrect a request
      // whose owner has already let it go, and a stale callback could then
      // overwrite a newer timer's handle.
      if (settled || disposed || handle !== null) return false;
      const token = (generation += 1);
      handle = setTimer(() => {
        if (token !== generation || settled || disposed) return;
        handle = null;
        settled = true;
        outcome = RECOVERY_DEADLINE_OUTCOMES.TIMEOUT;
        if (typeof onTimeout === "function") {
          try {
            onTimeout({ kind, ms, elapsedMs: Math.max(0, now() - startedAt) });
          } catch (_) {
            // A failing callback must not resurrect the request or throw into
            // the timer queue.
          }
        }
      }, ms);
      if (handle && typeof handle.unref === "function") handle.unref();
      return true;
    },
    // Settle once. Returns true only for the call that won the race, so a late
    // timeout or a duplicate completion cannot act twice.
    settle(result = RECOVERY_DEADLINE_OUTCOMES.SUCCESS) {
      if (settled || disposed) return false;
      if (!Object.values(RECOVERY_DEADLINE_OUTCOMES).includes(result)) {
        return false;
      }
      settled = true;
      outcome = result;
      clear();
      return true;
    },
    cancel() {
      return deadline.settle(RECOVERY_DEADLINE_OUTCOMES.CANCELLED);
    },
    dispose() {
      // Terminal cleanup: no outcome is claimed, but nothing may fire or settle
      // afterwards, and a delivered old callback is ignored by its token.
      disposed = true;
      generation += 1;
      clear();
    }
  };
  return deadline;
}
