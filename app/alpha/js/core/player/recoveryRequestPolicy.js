// Request policy for the recovery loader (#12 unit 3 rebuild).
//
// The held-back loader review found that caller-supplied headers were forwarded
// verbatim, so `Authorization` or a Nuvio session header could ride along even
// though `credentials: "omit"` was set. This module is the single place that
// decides what a recovery-owned request may contain.
//
// Policy: recovery-owned requests are anonymous. No caller headers are ever
// forwarded, no credentials are sent, redirects are refused and the mode is CORS.
// A source that needs custom authorization is therefore refused *early* and
// honestly instead of failing later.
//
// Pure: no fetch, no logging, no mutation. Every input is treated as hostile:
// accessor-backed or proxied arguments must fail closed, not throw.

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

function headersPresent(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value !== "object") return true;
  // Headers instances and map-likes expose entries()/keys().
  if (typeof value.keys === "function") {
    try {
      const iterator = value.keys();
      const first = iterator.next();
      return !first || first.done === false;
    } catch (_) {
      return true;
    }
  }
  // Own names include non-enumerable keys; for..in covers inherited enumerable
  // keys. Either is a header this path must not carry.
  if (Object.getOwnPropertyNames(value).length > 0) return true;
  if (Object.getOwnPropertySymbols(value).length > 0) return true;
  for (const key in value) {
    if (key) return true;
  }
  return false;
}

export function validateRecoveryRequest(input = {}) {
  try {
    if (!input || typeof input !== "object") {
      return { ok: false, reason: RECOVERY_REQUEST_REASONS.INVALID_REQUEST, headers: null };
    }
    const urlField = Object.getOwnPropertyDescriptor(input, "url");
    const headerField = Object.getOwnPropertyDescriptor(input, "headers");
    if (!urlField || !("value" in urlField) ||
        (headerField && !("value" in headerField)) ||
        (!headerField && "headers" in input)) {
      return { ok: false, reason: RECOVERY_REQUEST_REASONS.INVALID_REQUEST, headers: null };
    }
    const url = urlField.value;
    const headers = headerField?.value;
    if (typeof url !== "string" || !url.trim() || url.length > 8192) {
      return { ok: false, reason: RECOVERY_REQUEST_REASONS.INVALID_REQUEST, headers: null };
    }
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      return { ok: false, reason: RECOVERY_REQUEST_REASONS.INVALID_REQUEST, headers: null };
    }
    if (headersPresent(headers)) {
      return {
        ok: false,
        reason: RECOVERY_REQUEST_REASONS.CALLER_HEADERS_NOT_PERMITTED,
        headers: null
      };
    }
    return { ok: true, reason: RECOVERY_REQUEST_REASONS.OK, headers: null, url: parsed.href };
  } catch (_) {
    return { ok: false, reason: RECOVERY_REQUEST_REASONS.INVALID_REQUEST, headers: null };
  }
}

// Fixed fetch options with a null prototype, so pollution of Object.prototype
// cannot inject an outgoing header, and no `headers` key is ever produced.
export function buildRecoveryFetchOptions(input = {}) {
  try {
    if (!input || typeof input !== "object") {
      return { ok: false, reason: RECOVERY_REQUEST_REASONS.INVALID_REQUEST, options: null };
    }
    const signal = input.signal;
    if (!signal || typeof signal !== "object") {
      return { ok: false, reason: RECOVERY_REQUEST_REASONS.INVALID_REQUEST, options: null };
    }
    const options = Object.create(null);
    options.method = "GET";
    options.mode = RECOVERY_REQUEST_POLICY.mode;
    options.credentials = RECOVERY_REQUEST_POLICY.credentials;
    options.redirect = RECOVERY_REQUEST_POLICY.redirect;
    options.signal = signal;
    return { ok: true, reason: RECOVERY_REQUEST_REASONS.OK, options };
  } catch (_) {
    return { ok: false, reason: RECOVERY_REQUEST_REASONS.INVALID_REQUEST, options: null };
  }
}
