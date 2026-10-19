// Response classification for the recovery loader (#12 unit 3 rebuild).
//
// The held-back review found that HTTP status was never checked, so a 403 could
// reach onSuccess. This module decides, before any body is consumed, whether a
// recovery-owned response may be used, and refuses with a fixed reason that
// carries only the numeric status — never a URL, header or provider text.
//
// Pure: no fetch, no logging, no mutation.

export const RECOVERY_RESPONSE_REASONS = Object.freeze({
  OK: "ok",
  ACCESS_DENIED: "access-denied",
  UNAVAILABLE: "unavailable",
  RETRY_NOT_PERMITTED: "retry-not-permitted",
  REDIRECT_NOT_PERMITTED: "redirect-not-permitted",
  SERVER_ERROR: "server-error",
  INVALID_STATUS: "invalid-status"
});

function validStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

// Recovery never retries by itself, so retryable statuses are refused as such
// rather than silently attempted again.
export function classifyRecoveryResponse(input = {}) {
  try {
    if (!input || typeof input !== "object") {
      return { ok: false, reason: RECOVERY_RESPONSE_REASONS.INVALID_STATUS, status: null };
    }
    const status = validStatus(input.status);
    if (status === null) {
      return { ok: false, reason: RECOVERY_RESPONSE_REASONS.INVALID_STATUS, status: null };
    }
    const redirectFlagged = input.redirected === true;
    if (status >= 300 && status < 400) {
      // A redirect should already have been refused by the request policy; if a
      // response still reports one, it must never be followed or consumed.
      return { ok: false, reason: RECOVERY_RESPONSE_REASONS.REDIRECT_NOT_PERMITTED, status };
    }
    if (redirectFlagged) {
      return { ok: false, reason: RECOVERY_RESPONSE_REASONS.REDIRECT_NOT_PERMITTED, status };
    }
    if (status >= 200 && status < 300) {
      return { ok: true, reason: RECOVERY_RESPONSE_REASONS.OK, status };
    }
    if (status === 401 || status === 403 || status === 407) {
      return { ok: false, reason: RECOVERY_RESPONSE_REASONS.ACCESS_DENIED, status };
    }
    if (status === 404 || status === 410) {
      return { ok: false, reason: RECOVERY_RESPONSE_REASONS.UNAVAILABLE, status };
    }
    if (status === 408 || status === 429) {
      return { ok: false, reason: RECOVERY_RESPONSE_REASONS.RETRY_NOT_PERMITTED, status };
    }
    if (status >= 500) {
      return { ok: false, reason: RECOVERY_RESPONSE_REASONS.SERVER_ERROR, status };
    }
    return { ok: false, reason: RECOVERY_RESPONSE_REASONS.INVALID_STATUS, status };
  } catch (_) {
    return { ok: false, reason: RECOVERY_RESPONSE_REASONS.INVALID_STATUS, status: null };
  }
}

// A body may only be consumed after a positive classification, which keeps an
// error page out of the demuxer and out of the byte budget.
export function mayConsumeRecoveryBody(classification) {
  // A throwing getter or revoked proxy must read as "not allowed", never throw.
  try {
    return Boolean(classification && classification.ok === true);
  } catch (_) {
    return false;
  }
}
