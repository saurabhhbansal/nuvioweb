// Byte-range header construction for the recovery loader (#12 unit 3 rebuild).
//
// The held-back review found that hls.js range contexts were ignored, so a
// ranged request fetched the whole resource. This module builds the Range value
// from validated offsets only: no caller string is ever concatenated into a
// header, which also removes a header-injection path.
//
// The emitted value uses HTTP's **inclusive** byte endpoints: `bytes=0-0`
// requests one byte. Offsets are passed through unchanged, so a caller whose
// source uses an exclusive end (pinned hls.js subtracts one itself) must convert
// before calling. This module never reinterprets the convention silently.
//
// Pure: no fetch, no logging, no mutation.

export const RECOVERY_RANGE_REASONS = Object.freeze({
  OK: "ok",
  NO_RANGE: "no-range",
  INVALID_RANGE: "invalid-range"
});

const MAX_OFFSET = Number.MAX_SAFE_INTEGER;

function offset(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
  return value > MAX_OFFSET ? null : value;
}

// Returns `{ ok: true, value: null }` when there is no range to send, so the
// caller can omit the header entirely rather than sending an empty one.
export function buildRecoveryRangeHeader(input) {
  try {
    if (!input || typeof input !== "object") {
      return { ok: false, reason: RECOVERY_RANGE_REASONS.INVALID_RANGE, value: null };
    }
    const rawStart = input.rangeStart;
    const rawEnd = input.rangeEnd;
    const hasStart = rawStart !== undefined && rawStart !== null;
    const hasEnd = rawEnd !== undefined && rawEnd !== null;
    if (!hasStart && !hasEnd) {
      return { ok: true, reason: RECOVERY_RANGE_REASONS.NO_RANGE, value: null };
    }
    const start = offset(rawStart);
    const end = offset(rawEnd);
    if (start === null || end === null) {
      return { ok: false, reason: RECOVERY_RANGE_REASONS.INVALID_RANGE, value: null };
    }
    if (start > end) {
      return { ok: false, reason: RECOVERY_RANGE_REASONS.INVALID_RANGE, value: null };
    }
    // Both operands are validated integers, so the result is a fixed
    // "bytes=<digits>-<digits>" string with no injected content.
    return { ok: true, reason: RECOVERY_RANGE_REASONS.OK, value: `bytes=${start}-${end}` };
  } catch (_) {
    return { ok: false, reason: RECOVERY_RANGE_REASONS.INVALID_RANGE, value: null };
  }
}
