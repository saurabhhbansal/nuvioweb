// Single-flight ownership guard for the recovery loader (#12 unit 3 rebuild).
//
// The held-back review found that overlapping loads leaked ownership: a second
// load could overwrite the first request's state, and a late cleanup could then
// release somebody else's slot. This guard is the primitive the assembled loader
// uses to refuse overlap and to bind cleanup to the request that owns it.
//
// Pure: no fetch, no I/O, no logging.

export const SINGLE_FLIGHT_REASONS = Object.freeze({
  OK: "ok",
  BUSY: "busy"
});

export function createSingleFlight() {
  let current = null;

  return {
    get busy() {
      return current !== null;
    },
    current() {
      return current;
    },
    // A second begin is refused while a request is live; the caller must abort
    // or finish the first one explicitly.
    begin() {
      if (current !== null) {
        return { ok: false, reason: SINGLE_FLIGHT_REASONS.BUSY, token: null };
      }
      // A fresh symbol per acquisition: identity can never repeat, so a very
      // late cleanup can never match a newer request.
      current = Symbol("recovery-request");
      return { ok: true, reason: SINGLE_FLIGHT_REASONS.OK, token: current };
    },
    // Only the owning token can release, and releasing twice is refused, so a
    // late callback from an older request cannot free a newer one.
    end(token) {
      if (current === null) return false;
      if (token !== current) return false;
      current = null;
      return true;
    }
  };
}
