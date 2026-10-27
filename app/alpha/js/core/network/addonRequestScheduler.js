// Paces add-on traffic (manifest, catalog, meta, stream, subtitles).
//
// Home and detail screens can ask one add-on host for many things at once.
// Hosts that rate-limit then answer 429/503 and the rows come back empty, so
// this keeps a few requests in flight per host, queues the rest, and retries
// politely when a host says it is busy. Callers pass an AbortSignal so a
// screen that is no longer wanted can drop its queued requests.

const RETRYABLE_STATUSES = new Set([429, 503]);

export const ADDON_REQUEST_DEFAULTS = Object.freeze({
  maxPerHost: 4,
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  // A host asking us to come back later than this is treated as a failure
  // now rather than leaving a screen spinning.
  maxRetryAfterMs: 30000
});

function abortError(signal) {
  const reason = signal?.reason;
  if (reason instanceof Error) {
    return reason;
  }
  const error = new Error("The request was aborted");
  error.name = "AbortError";
  return error;
}

function hostKeyFor(url) {
  try {
    return new URL(String(url), globalThis.location?.href).host;
  } catch {
    return String(url || "");
  }
}

// Retry-After is either delay-seconds or an HTTP date.
export function parseRetryAfterMs(value, now = Date.now()) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  if (/^\d+$/.test(text)) {
    return Number(text) * 1000;
  }
  const date = Date.parse(text);
  if (Number.isNaN(date)) {
    return null;
  }
  return Math.max(0, date - now);
}

function abortableWait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

function discardBody(response) {
  try {
    response?.body?.cancel?.().catch?.(() => {});
  } catch {
    // Nothing to free.
  }
}

export function createAddonRequestScheduler(options = {}) {
  const config = { ...ADDON_REQUEST_DEFAULTS, ...options };
  const fetchImpl = options.fetchImpl || ((url, init) => globalThis.fetch(url, init));
  const wait = options.wait || abortableWait;
  const now = options.now || Date.now;
  const hosts = new Map();

  function stateFor(key) {
    let state = hosts.get(key);
    if (!state) {
      state = { active: 0, queue: [] };
      hosts.set(key, state);
    }
    return state;
  }

  function forgetIfIdle(key, state) {
    if (state.active === 0 && state.queue.length === 0) {
      hosts.delete(key);
    }
  }

  function acquire(key, signal) {
    if (signal?.aborted) {
      return Promise.reject(abortError(signal));
    }
    const state = stateFor(key);
    if (state.active < config.maxPerHost) {
      state.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve, signal, onAbort: null };
      entry.onAbort = () => {
        const index = state.queue.indexOf(entry);
        if (index >= 0) {
          state.queue.splice(index, 1);
        }
        forgetIfIdle(key, state);
        reject(abortError(signal));
      };
      signal?.addEventListener?.("abort", entry.onAbort, { once: true });
      state.queue.push(entry);
    });
  }

  function release(key) {
    const state = hosts.get(key);
    if (!state) {
      return;
    }
    const next = state.queue.shift();
    if (next) {
      // Hand the slot straight to the next waiter.
      next.signal?.removeEventListener?.("abort", next.onAbort);
      next.resolve();
      return;
    }
    state.active = Math.max(0, state.active - 1);
    forgetIfIdle(key, state);
  }

  function retryDelayMs(response, attempt) {
    const retryAfter = parseRetryAfterMs(response?.headers?.get?.("Retry-After"), now());
    if (retryAfter !== null) {
      return retryAfter > config.maxRetryAfterMs ? null : retryAfter;
    }
    return Math.min(config.baseDelayMs * 2 ** attempt, config.maxDelayMs);
  }

  async function scheduledFetch(url, init = {}) {
    const key = hostKeyFor(url);
    const signal = init?.signal || null;
    for (let attempt = 0; ; attempt += 1) {
      await acquire(key, signal);
      let response;
      try {
        response = await fetchImpl(url, init);
      } finally {
        release(key);
      }
      if (!RETRYABLE_STATUSES.has(response?.status) || attempt >= config.maxRetries) {
        return response;
      }
      const delay = retryDelayMs(response, attempt);
      if (delay === null) {
        return response;
      }
      discardBody(response);
      await wait(delay, signal);
    }
  }

  return {
    fetch: scheduledFetch,
    snapshot(url) {
      const state = hosts.get(hostKeyFor(url));
      return { active: state?.active || 0, queued: state?.queue.length || 0 };
    }
  };
}

export const addonRequestScheduler = createAddonRequestScheduler();

export function addonFetch(url, init) {
  return addonRequestScheduler.fetch(url, init);
}
