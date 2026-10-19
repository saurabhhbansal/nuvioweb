// Bounded, recovery-only loader for the pinned hls.js 1.5.20 loader interface.
//
// Scope and limits come from docs/plans/issues/issue-12.md unit 3. This module
// never touches ordinary playback: hls.js only uses it when a recovery session
// installs it, and every owned request is CORS-only, credential-free and
// redirect-rejecting.
//
// Pinned interface (verified against app/alpha/dist/assets/libs/hls.min.js,
// hls.js 1.5.20): `load(context, config, callbacks)`, `abort()`, `destroy()`,
// `getCacheAge()`, `getResponseHeader(name)`, `stats` with
// {aborted, loaded, retry, total, chunkCount, bwEstimate, loading, parsing,
// buffering}, and callbacks {onSuccess(response, stats, context, networkDetails),
// onError(error, context, networkDetails, stats), onTimeout(stats, context,
// networkDetails), onProgress(stats, context, data, networkDetails)}.

export const RECOVERY_LIMITS = Object.freeze({
  maxConcurrentRequests: 4,
  playlistBytes: 256 * 1024,
  initBytes: 1024 * 1024,
  fragmentBytes: 8 * 1024 * 1024,
  sessionBytes: 64 * 1024 * 1024,
  manifestDeadlineMs: 5000,
  fragmentDeadlineMs: 10000,
  maxDiagnosticText: 256
});

export const RECOVERY_RESOURCE = Object.freeze({
  PLAYLIST: "playlist",
  INIT: "init",
  FRAGMENT: "fragment"
});

export const RECOVERY_ERROR = Object.freeze({
  BUDGET: "recovery-budget-exceeded",
  CONCURRENCY: "recovery-concurrency-exceeded",
  TIMEOUT: "recovery-timeout",
  NETWORK: "recovery-network-error",
  DESTROYED: "recovery-loader-destroyed"
});

const PLAYLIST_EXTENSIONS = [".m3u8", ".mpd"];
const MEDIA_EXTENSIONS = [".ts", ".mp4", ".m4s", ".m4a", ".m4v", ".aac", ".webm", ".mp3"];

function boundedText(value, limit = RECOVERY_LIMITS.maxDiagnosticText) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, limit);
}

function extensionOf(url) {
  const clean = String(url || "")
    .split("?")[0]
    .split("#")[0]
    .toLowerCase();
  const index = clean.lastIndexOf(".");
  return index >= 0 ? clean.slice(index) : "";
}

// Playlists are declared by hls.js context type; fragments carry a frag. An
// init segment is fetched before its media segments and has no duration yet.
export function classifyRecoveryResource(context = {}) {
  const type = boundedText(String(context?.type ?? ""), 32).toLowerCase();
  if (["manifest", "level", "audiotrack", "subtitletrack", "vtt"].includes(type)) {
    return RECOVERY_RESOURCE.PLAYLIST;
  }
  // Init segments are only distinguishable when the caller says so; a URL
  // extension alone cannot tell an init segment from a media segment, and
  // guessing would apply the wrong budget.
  if (context?.initSegment === true || context?.frag?.initSegment === true) {
    return RECOVERY_RESOURCE.INIT;
  }
  if (context?.frag || context?.part) return RECOVERY_RESOURCE.FRAGMENT;
  const extension = extensionOf(context?.url);
  if (PLAYLIST_EXTENSIONS.includes(extension)) return RECOVERY_RESOURCE.PLAYLIST;
  if (MEDIA_EXTENSIONS.includes(extension)) return RECOVERY_RESOURCE.FRAGMENT;
  // Unknown resources get the strictest meaningful budget.
  return RECOVERY_RESOURCE.FRAGMENT;
}

export function resourceLimit(kind, limits = RECOVERY_LIMITS) {
  if (kind === RECOVERY_RESOURCE.PLAYLIST) return limits.playlistBytes;
  if (kind === RECOVERY_RESOURCE.INIT) return limits.initBytes;
  return limits.fragmentBytes;
}

// One recovery session owns every budget. Requests are acquired and released
// explicitly so a leaked request cannot silently raise the concurrency.
export function createRecoverySession({ limits = RECOVERY_LIMITS } = {}) {
  let active = 0;
  let sessionBytes = 0;
  const counters = {
    requests: 0,
    rejected: 0,
    aborted: 0,
    timedOut: 0,
    bytes: 0
  };
  return {
    limits,
    acquire() {
      if (active >= limits.maxConcurrentRequests) {
        counters.rejected += 1;
        return { ok: false, reason: RECOVERY_ERROR.CONCURRENCY };
      }
      active += 1;
      counters.requests += 1;
      return { ok: true, release: () => this.release() };
    },
    release() {
      active = Math.max(0, active - 1);
    },
    charge(kind, bytes) {
      const count = Number(bytes);
      if (!Number.isFinite(count) || count <= 0) return { ok: true };
      const next = sessionBytes + count;
      if (count > resourceLimit(kind, limits) || next > limits.sessionBytes) {
        return { ok: false, reason: RECOVERY_ERROR.BUDGET };
      }
      sessionBytes = next;
      counters.bytes = sessionBytes;
      return { ok: true };
    },
    get activeRequests() {
      return active;
    },
    get sessionBytes() {
      return sessionBytes;
    },
    snapshot() {
      return { ...counters, active, sessionBytes };
    }
  };
}

function emptyStats() {
  return {
    aborted: false,
    loaded: 0,
    retry: 0,
    total: 0,
    chunkCount: 0,
    bwEstimate: 0,
    loading: { start: 0, first: 0, end: 0 },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, end: 0 }
  };
}

function concatChunks(chunks, total) {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// Create a loader class compatible with `config.loader` for the pinned build.
export function createRecoveryLoaderClass({
  baseLoader = globalThis.Hls?.Loader,
  session = createRecoverySession(),
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  setTimeoutFn = (callback, ms) => setTimeout(callback, ms),
  clearTimeoutFn = (handle) => clearTimeout(handle),
  limits = session.limits
} = {}) {
  if (typeof baseLoader !== "function") {
    throw new TypeError("a base hls.js Loader class is required");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("a fetch implementation is required");
  }

  class RecoveryLoader extends baseLoader {
    constructor(config = {}) {
      super(config);
      this.config = config;
      this.stats = emptyStats();
      this.context = null;
      this.callbacks = null;
      this.controller = null;
      this.timer = null;
      this.released = false;
      this.destroyed = false;
      this.responseHeaders = new Map();
      this.city = null;
    }

    getResponseHeader(name) {
      const key = String(name || "").toLowerCase();
      return this.responseHeaders.has(key) ? this.responseHeaders.get(key) : null;
    }

    getCacheAge() {
      const age = this.getResponseHeader("age");
      if (age === null) return null;
      const parsed = parseFloat(age);
      return Number.isFinite(parsed) ? parsed : null;
    }

    abort() {
      this.finish({ aborted: true });
    }

    destroy() {
      this.destroyed = true;
      this.abort();
    }

    finish({ aborted = false } = {}) {
      if (this.timer !== null) {
        clearTimeoutFn(this.timer);
        this.timer = null;
      }
      if (this.controller) {
        try {
          this.controller.abort();
        } catch (_) {
          /* already aborted */
        }
        this.controller = null;
      }
      if (!this.released) {
        this.released = true;
        session.release();
      }
      this.stats.aborted = this.stats.aborted || aborted;
    }

    load(context = {}, config = {}, callbacks = {}) {
      if (this.destroyed) {
        callbacks.onError?.({ code: 0, text: RECOVERY_ERROR.DESTROYED }, context, null, this.stats);
        return;
      }
      const slot = session.acquire();
      if (!slot.ok) {
        callbacks.onError?.({ code: 0, text: slot.reason }, context, null, this.stats);
        return;
      }
      this.context = context;
      this.callbacks = callbacks;
      // Reset per-request state: `released` guards the session slot, so a
      // previous completed request must not make the next one skip its release.
      this.released = false;
      this.responseHeaders = new Map();
      this.stats = emptyStats();
      this.stats.loading.start = now();
      const kind = classifyRecoveryResource(context);
      const limit = resourceLimit(kind, limits);
      const deadline =
        kind === RECOVERY_RESOURCE.PLAYLIST ? limits.manifestDeadlineMs : limits.fragmentDeadlineMs;
      const controller = new AbortController();
      this.controller = controller;
      const token = {};

      this.timer = setTimeoutFn(() => {
        if (this.context !== context || this.controller !== controller) return;
        this.stats.aborted = true;
        this.finish({ aborted: true });
        if (typeof callbacks.onTimeout === "function") {
          callbacks.onTimeout(this.stats, context, null);
        } else {
          callbacks.onError?.({ code: 0, text: RECOVERY_ERROR.TIMEOUT }, context, null, this.stats);
        }
      }, deadline);

      const requestUrl = boundedText(String(context?.url || ""), 2048);
      const fetchOptions = {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        redirect: "error",
        signal: controller.signal
      };
      const headers = context?.headers;
      if (headers && typeof headers === "object" && !Array.isArray(headers)) {
        const safe = {};
        for (const [name, value] of Object.entries(headers).slice(0, 32)) {
          const headerName = boundedText(String(name || ""), 64);
          const headerValue = boundedText(String(value ?? ""), 512);
          if (headerName && headerValue) safe[headerName] = headerValue;
        }
        if (Object.keys(safe).length) fetchOptions.headers = safe;
      }

      Promise.resolve()
        .then(() => fetchImpl(requestUrl, fetchOptions))
        .then(async (response) => {
          if (this.controller !== controller) return;
          for (const header of ["age", "content-length", "content-type"]) {
            const value = response.headers?.get?.(header);
            if (value !== null && value !== undefined) this.responseHeaders.set(header, value);
          }
          this.stats.loading.first = now();
          const chunks = [];
          let received = 0;
          const body = response.body;
          if (body && typeof body.getReader === "function") {
            const reader = body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (this.controller !== controller) return;
              if (done) break;
              if (!value) continue;
              received += value.length;
              const charge = session.charge(kind, value.length);
              if (received > limit || !charge.ok) {
                try {
                  await reader.cancel();
                } catch (_) {
                  /* stream already closed */
                }
                this.stats.loaded = received;
                this.finish();
                callbacks.onError?.(
                  {
                    code: 0,
                    text: boundedText(charge.reason || RECOVERY_ERROR.BUDGET)
                  },
                  context,
                  response,
                  this.stats
                );
                return;
              }
              chunks.push(value);
              this.stats.chunkCount += 1;
              this.stats.loaded = received;
              callbacks.onProgress?.(this.stats, context, value, response);
            }
          } else {
            const buffer = new Uint8Array(await response.arrayBuffer());
            if (this.controller !== controller) return;
            received = buffer.length;
            const charge = session.charge(kind, received);
            if (received > limit || !charge.ok) {
              this.finish();
              callbacks.onError?.(
                { code: 0, text: boundedText(charge.reason || RECOVERY_ERROR.BUDGET) },
                context,
                response,
                this.stats
              );
              return;
            }
            chunks.push(buffer);
            this.stats.chunkCount = 1;
            this.stats.loaded = received;
          }
          if (this.controller !== controller) return;
          const bytes = concatChunks(chunks, received);
          this.stats.loading.end = now();
          this.stats.total = received;
          this.stats.bwEstimate = received > 0 ? (received * 8) / 1000 : 0;
          const responseType = boundedText(
            String(config?.responseType || context?.responseType || ""),
            32
          );
          const data =
            responseType === "json"
              ? JSON.parse(new TextDecoder().decode(bytes))
              : responseType === "text" || responseType === "mpegurl"
                ? new TextDecoder().decode(bytes)
                : bytes.buffer;
          // Release before the callback: hls.js commonly requests the next
          // fragment from inside onSuccess, and a held slot would be rejected.
          this.finish();
          callbacks.onSuccess?.({ url: requestUrl, data }, this.stats, context, response);
        })
        .catch((error) => {
          if (this.controller !== controller) return;
          const name = boundedText(String(error?.name || ""), 64);
          if (name === "AbortError") {
            this.finish({ aborted: true });
            return;
          }
          this.finish();
          callbacks.onError?.(
            {
              code: 0,
              text: boundedText(
                `${RECOVERY_ERROR.NETWORK}: ${String(error?.message || error || "")}`,
                RECOVERY_LIMITS.maxDiagnosticText
              )
            },
            context,
            null,
            this.stats
          );
        });

      void token;
    }
  }

  return RecoveryLoader;
}

// Small helper for callers that only need the policy: is this response over
// budget before consuming it? Returns the remaining allowance per resource.
export function remainingBudget(kind, usedBytes, limits = RECOVERY_LIMITS) {
  const limit = resourceLimit(kind, limits);
  const used = Number(usedBytes);
  return Math.max(0, limit - (Number.isFinite(used) && used > 0 ? used : 0));
}
