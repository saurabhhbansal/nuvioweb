// Random-access byte sources for the demuxers: an HTTP source that reads
// with Range requests (needs CORS on the stream host) and an in-memory one
// for tests. Nothing here goes through a proxy.

export class RemuxUnavailableError extends Error {
  constructor(reason, message = reason) {
    super(message);
    this.name = "RemuxUnavailableError";
    this.reason = reason;
  }
}

const PROBE_BYTES = 64 * 1024;
const CACHE_ENTRIES = 6;

function parseTotalSize(contentRange) {
  const match = /\/(\d+)\s*$/.exec(String(contentRange || ""));
  return match ? Number(match[1]) : NaN;
}

/**
 * Opens `url` for ranged reads. Throws RemuxUnavailableError with reason
 * "cors" (fetch refused, usually missing Access-Control-Allow-Origin),
 * "http" (bad status), "no-range" (server ignored Range) or "no-size".
 */
export async function openHttpSource(url, { fetchImpl = globalThis.fetch, headers = {} } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new RemuxUnavailableError("no-fetch");
  }
  const request = (start, end, signal, method = "GET") =>
    fetchImpl(url, {
      method,
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal,
      headers: method === "HEAD" ? { ...headers } : { ...headers, Range: `bytes=${start}-${end}` }
    });

  const controller = new AbortController();
  let response;
  try {
    response = await request(0, PROBE_BYTES - 1, controller.signal);
  } catch (error) {
    throw new RemuxUnavailableError("cors", String(error?.message || error));
  }
  if (response.status === 200) {
    controller.abort();
    throw new RemuxUnavailableError("no-range");
  }
  if (response.status !== 206) {
    throw new RemuxUnavailableError("http", `HTTP ${response.status}`);
  }
  let size = parseTotalSize(response.headers.get("content-range"));
  const head = new Uint8Array(await response.arrayBuffer());
  if (!Number.isFinite(size)) {
    try {
      const headResponse = await request(0, 0, undefined, "HEAD");
      size = Number(headResponse.headers.get("content-length"));
    } catch (_) {
      size = NaN;
    }
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new RemuxUnavailableError("no-size");
  }

  const cache = [{ start: 0, bytes: head }];
  const remember = (start, bytes) => {
    cache.unshift({ start, bytes });
    cache.length = Math.min(cache.length, CACHE_ENTRIES);
  };

  return {
    url,
    size,
    /** Reads [start, end) and resolves with exactly those bytes (clamped to the file). */
    async read(start, end, { signal } = {}) {
      const from = Math.max(0, Math.floor(start));
      const to = Math.min(size, Math.floor(end));
      if (to <= from) {
        return new Uint8Array(0);
      }
      for (const entry of cache) {
        if (from >= entry.start && to <= entry.start + entry.bytes.length) {
          return entry.bytes.subarray(from - entry.start, to - entry.start);
        }
      }
      const result = await request(from, to - 1, signal);
      if (result.status !== 206 && !(result.status === 200 && from === 0 && to === size)) {
        throw new Error(`Range read failed with HTTP ${result.status}`);
      }
      const bytes = new Uint8Array(await result.arrayBuffer());
      const exact = bytes.length > to - from ? bytes.subarray(0, to - from) : bytes;
      if (to - from <= 256 * 1024) {
        remember(from, exact);
      }
      return exact;
    }
  };
}

export function createMemorySource(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return {
    url: "memory:",
    size: data.length,
    reads: 0,
    async read(start, end) {
      this.reads += 1;
      return data.subarray(Math.max(0, start), Math.min(data.length, end));
    }
  };
}
