// Request policy for the recovery loader (#12 unit 3 rebuild).
//
// The held-back loader review found that caller-supplied headers were forwarded
// verbatim, so `Authorization` or a Nuvio session header could ride along even
// though `credentials: "omit"` was set. This module is the single place that
// decides what a recovery-owned request may contain, so the rebuild cannot get
// it wrong by accident.
//
// Policy: recovery-owned requests are anonymous and same-origin-safe. No caller
// headers are ever forwarded, no credentials are sent, redirects are refused and
// the mode is CORS. Pure: no fetch, no logging, no mutation.

export const RECOVERY_REQUEST_POLICY = Object.freeze({
  mode: "cors",
  credentials: "omit",
  redirect: "error",
  allowedHeaders: Object.freeze([])
});

export const RECOVERY_REQUEST_REASONS = Object.freeze({
  OK: "ok",
  CALLER_HEADERS_NOT_PERMITTED: "caller-headers-not-permitted",
  INVALID_REQUEST: "invalid-request"
});

function hasAnyHeader(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return false;
  try {
    return Object.keys(headers).length > 0;
  } catch (_) {
    return true;
  }
}

// Validate a proposed request. Any caller header is refused: a recovery session
// that needs authorization is out of scope and must not be attempted silently.
export function validateRecoveryRequest({ url = "", headers = null } = {}) {
  if (typeof url !== "string" || !url.trim()) {
    return { ok: false, reason: RECOVERY_REQUEST_REASONS.INVALID_REQUEST, headers: {} };
  }
  if (hasAnyHeader(headers)) {
    return {
      ok: false,
      reason: RECOVERY_REQUEST_REASONS.CALLER_HEADERS_NOT_PERMITTED,
      headers: {}
    };
  }
  return { ok: true, reason: RECOVERY_REQUEST_REASONS.OK, headers: {} };
}

// The only fetch options a recovery request may use. `signal` is required so a
// caller cannot start an unabortable request through this path.
export function buildRecoveryFetchOptions({ signal = null } = {}) {
  if (!signal || typeof signal !== "object") {
    return { ok: false, reason: RECOVERY_REQUEST_REASONS.INVALID_REQUEST, options: null };
  }
  return {
    ok: true,
    reason: RECOVERY_REQUEST_REASONS.OK,
    options: {
      method: "GET",
      mode: RECOVERY_REQUEST_POLICY.mode,
      credentials: RECOVERY_REQUEST_POLICY.credentials,
      redirect: RECOVERY_REQUEST_POLICY.redirect,
      signal
    }
  };
}
