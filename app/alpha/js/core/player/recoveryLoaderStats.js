// Loader statistics for the recovery loader (#12 unit 3 rebuild).
//
// The held-back review found the draft used epoch `Date.now()` where hls.js
// compares monotonic timestamps, omitted `buffering.first`, and computed
// `bwEstimate` without dividing by elapsed time. This module owns that
// bookkeeping with an injected monotonic clock.
//
// Shape follows the pinned hls.js 1.5.20 LoaderStats:
// { aborted, loaded, retry, total, chunkCount, bwEstimate,
//   loading: { start, first, end }, parsing: { start, end },
//   buffering: { start, first, end } }
//
// Pure: no fetch, no logging, no mutation of inputs.

function defaultNow() {
  // performance.now() is monotonic; the fallback keeps the module usable in a
  // worker-less test environment without silently mixing clocks.
  const perf = globalThis.performance;
  return perf && typeof perf.now === "function" ? perf.now.bind(perf) : () => 0;
}

export function createLoaderStats({ now = defaultNow() } = {}) {
  const stats = {
    aborted: false,
    loaded: 0,
    retry: 0,
    total: 0,
    chunkCount: 0,
    bwEstimate: 0,
    loading: { start: 0, first: 0, end: 0 },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, first: 0, end: 0 }
  };
  let firstByteAt = 0;
  let endAt = 0;

  return {
    get stats() {
      return stats;
    },
    begin() {
      stats.loading.start = now();
      return stats;
    },
    // The first byte also opens buffering, so `buffering.first` is never left
    // out of a response that actually started arriving.
    firstByte(bytes = 0) {
      const at = now();
      if (!firstByteAt) {
        firstByteAt = at;
        stats.loading.first = at;
        stats.buffering.start = at;
        stats.buffering.first = at;
      }
      return this.chunk(bytes);
    },
    chunk(bytes = 0) {
      // Strictly a positive finite number: a string would mean the caller is
      // guessing at a size, which the byte budget must never do.
      const size = typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
      if (!size) return stats;
      stats.loaded += size;
      stats.chunkCount += 1;
      return this.updateBandwidth();
    },
    updateBandwidth() {
      if (!firstByteAt) return stats;
      const end = endAt || now();
      const elapsedMs = end - firstByteAt;
      // Bits per second from elapsed time, not from a fixed divisor.
      stats.bwEstimate = elapsedMs > 0 ? (stats.loaded * 8 * 1000) / elapsedMs : 0;
      return stats;
    },
    end({ total = stats.loaded } = {}) {
      endAt = now();
      stats.loading.end = endAt;
      stats.buffering.end = endAt;
      const size = Number(total);
      stats.total = Number.isFinite(size) && size >= 0 ? size : stats.loaded;
      return this.updateBandwidth();
    },
    parseStart() {
      stats.parsing.start = now();
      return stats;
    },
    parseEnd() {
      stats.parsing.end = now();
      return stats;
    },
    fail() {
      endAt = now();
      stats.loading.end = endAt;
      return stats;
    },
    abort() {
      stats.aborted = true;
      return this.fail();
    }
  };
}
