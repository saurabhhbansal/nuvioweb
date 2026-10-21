// Isolated #12 prototype. No player imports this factory: installing it in Hls
// still needs a finite-VOD/media gate, SDK retry policy and real-provider proof.
// Contract inspected against hls.js 1.5.20 types/loader.ts and fetch-loader.ts.
import {
  RECOVERY_LIMITS,
  RECOVERY_RESOURCE,
  classifyRecoveryResource,
  createRecoverySession,
  resourceLimit
} from "./recoveryHlsLoader.js";
import { buildRecoveryFetchOptions, validateRecoveryRequest } from "./recoveryRequestPolicy.js";

export const BOUNDED_RECOVERY_ERROR = Object.freeze({
  INVALID: "recovery-invalid-request",
  PROFILE: "recovery-unsupported-profile",
  NETWORK: "recovery-network-error",
  HTTP: "recovery-http-error",
  BODY: "recovery-stream-required",
  BUDGET: "recovery-budget-exceeded",
  CONCURRENCY: "recovery-concurrency-exceeded",
  EXHAUSTED: "recovery-session-exhausted"
});

function newStats() {
  return {
    aborted: false, loaded: 0, retry: 0, total: 0, chunkCount: 0, bwEstimate: 0,
    loading: { start: 0, first: 0, end: 0 },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, first: 0, end: 0 }
  };
}

function discard(reader) {
  // Do not await cancellation: a broken stream must not delay settlement or let
  // a timeout win a second time. Rejections contain no public diagnostic data.
  try { Promise.resolve(reader?.cancel()).catch(() => {}); } catch (_) { /* no-op */ }
}

function join(chunks, size) {
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

// session, signal and fetchImpl are trusted host dependencies, not provider data.
// fetchImpl injection exists for transport-contract tests; production uses fetch.
export function createRecoveryHlsLoader({
  session = createRecoverySession(), signal, fetchImpl = globalThis.fetch
} = {}) {
  // Limits may be tightened in tests, but never relaxed, mutated or omitted.
  const limits = Object.freeze({ ...session.limits });
  for (const [name, maximum] of Object.entries(RECOVERY_LIMITS)) {
    if (!Number.isSafeInteger(limits[name]) || limits[name] <= 0 || limits[name] > maximum) {
      throw new Error("recovery-invalid-limits");
    }
  }
  return class BoundedRecoveryLoader {
    constructor() {
      this.context = null;
      this.stats = newStats(); // hls.js retains this exact reference before load
      this.used = false;
      this.destroyed = false;
      this.pending = null;
      this.responseHeaders = null;
    }

    load(context, config, callbacks) {
      if (this.used || this.destroyed) throw new Error("recovery-loader-single-use");
      this.used = true;
      this.context = context;
      this.stats.loading.start = performance.now();
      const controller = new AbortController();
      const attempt = {
        context, callbacks, controller, reader: null, timer: null, release: null,
        done: false, chunks: [], buffered: 0, progressive: false, onSessionAbort: null
      };
      this.pending = attempt;
      const fail = (text, code = 0) => this.finish(attempt, "error", { text, code });
      try {
        const validation = validateRecoveryRequest(context);
        if (!validation.ok) { fail(BOUNDED_RECOVERY_ERROR.INVALID); return; }
        attempt.url = validation.url; // Never re-read a mutable caller destination.
        // A zero/zero range is hls.js's normal full-resource sentinel. Real
        // byte ranges and encrypted/key/part profiles are explicitly unsupported.
        if ((context.rangeStart != null && context.rangeStart !== 0) ||
            (context.rangeEnd != null && context.rangeEnd !== 0) ||
            context.keyInfo || context.frag?.decryptdata || context.part ||
            !["text", "arraybuffer", undefined, ""].includes(context.responseType)) {
          fail(BOUNDED_RECOVERY_ERROR.PROFILE); return;
        }
        if (signal?.aborted) { this.finish(attempt, "abort"); return; }
        const acquisition = session.acquire();
        if (!acquisition.ok) { fail(acquisition.reason); return; }
        attempt.release = acquisition.release;
        const kind = classifyRecoveryResource(context);
        attempt.kind = kind;
        attempt.limit = resourceLimit(kind, limits);
        const deadline = kind === RECOVERY_RESOURCE.PLAYLIST
          ? limits.manifestDeadlineMs : limits.fragmentDeadlineMs;
        // hls.js policies may make a deadline tighter, never longer.
        const requested = [config?.timeout, config?.loadPolicy?.maxLoadTimeMs]
          .filter((value) => Number.isFinite(value) && value > 0);
        const timeout = Math.min(deadline, ...requested);
        attempt.timer = setTimeout(() => this.finish(attempt, "timeout"), timeout);
        attempt.onSessionAbort = () => this.finish(attempt, "abort");
        signal?.addEventListener("abort", attempt.onSessionAbort, { once: true });
        if (signal?.aborted) { this.finish(attempt, "abort"); return; }
        // Match FetchLoader's partial-data contract: progressive ArrayBuffer
        // chunks go to onProgress and onSuccess receives an empty ArrayBuffer.
        const highWaterMark = config?.highWaterMark;
        attempt.progressive = context.responseType === "arraybuffer" &&
          typeof callbacks.onProgress === "function" && Number.isFinite(highWaterMark);
        attempt.highWaterMark = Math.max(1, Math.min(attempt.limit, highWaterMark || 1));
        const { options } = buildRecoveryFetchOptions({ signal: controller.signal });
        void this.run(attempt, options).catch(() => fail(BOUNDED_RECOVERY_ERROR.NETWORK));
      } catch (_) {
        fail(BOUNDED_RECOVERY_ERROR.INVALID);
      }
    }

    async run(attempt, options) {
      const { context } = attempt;
      const response = await fetchImpl(attempt.url, options);
      if (attempt.done) { discard(response?.body); return; }
      // Credentials, redirects and status are checked before consuming any body.
      if (response.redirected || response.type === "opaque" || response.type === "opaqueredirect") {
        discard(response.body);
        this.finish(attempt, "error", { code: 0, text: BOUNDED_RECOVERY_ERROR.PROFILE });
        return;
      }
      if (response.status !== 200) {
        discard(response.body);
        this.finish(attempt, "error", {
          code: Number.isInteger(response.status) ? response.status : 0,
          text: BOUNDED_RECOVERY_ERROR.HTTP
        });
        return;
      }
      this.responseHeaders = response.headers;
      this.stats.loading.first = Math.max(performance.now(), this.stats.loading.start);
      const lengthHeader = response.headers.get("content-length");
      const declared = lengthHeader !== null && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : 0;
      if (declared > attempt.limit || declared > limits.sessionBytes - session.sessionBytes) {
        // Declared bytes are not observed transfer; do not fabricate accounting.
        discard(response.body);
        this.finish(attempt, "error", { code: 0, text: BOUNDED_RECOVERY_ERROR.BUDGET });
        return;
      }
      if (!response.body || typeof response.body.getReader !== "function") {
        this.finish(attempt, "error", { code: 0, text: BOUNDED_RECOVERY_ERROR.BODY });
        return; // Never use an unbounded text()/arrayBuffer() fallback.
      }
      attempt.reader = response.body.getReader();
      this.stats.total = declared;
      while (!attempt.done) {
        const { value, done } = await attempt.reader.read();
        if (attempt.done) return;
        if (done) break;
        if (!(value instanceof Uint8Array)) throw new Error("recovery-invalid-chunk");
        this.stats.loaded += value.byteLength;
        const charged = session.charge(attempt.kind, value.byteLength);
        if (!charged.ok || this.stats.loaded > attempt.limit) {
          // Per-request accumulation can overflow even with individually small
          // chunks. Latch the shared budget as well; all observed bytes remain.
          if (charged.ok) session.exhaust();
          this.finish(attempt, "error", { code: 0, text: BOUNDED_RECOVERY_ERROR.BUDGET });
          return;
        }
        attempt.chunks.push(value);
        attempt.buffered += value.byteLength;
        if (attempt.progressive && attempt.buffered >= attempt.highWaterMark) {
          this.progress(attempt);
        }
      }
      if (attempt.done) return;
      this.stats.total = this.stats.loaded;
      let data;
      if (attempt.progressive) {
        if (attempt.buffered) this.progress(attempt);
        data = new ArrayBuffer(0);
      } else {
        const bytes = join(attempt.chunks, attempt.buffered);
        data = context.responseType === "arraybuffer" ? bytes : new TextDecoder().decode(bytes);
        // Non-progressive callbacks get data once, immediately before success.
        if (typeof attempt.callbacks.onProgress === "function") {
          this.stats.chunkCount += 1;
          attempt.callbacks.onProgress(this.stats, context, data, null);
        }
      }
      if (attempt.done) return; // onProgress is allowed to abort/destroy.
      this.finish(attempt, "success", { data, code: 200, url: response.url || context.url });
    }

    progress(attempt) {
      const data = join(attempt.chunks, attempt.buffered);
      attempt.chunks = [];
      attempt.buffered = 0;
      this.stats.chunkCount += 1;
      attempt.callbacks.onProgress(this.stats, attempt.context, data, null);
    }

    finish(attempt, kind, result) {
      if (attempt.done) return;
      attempt.done = true; // terminal before abort/cancel or any user callback
      clearTimeout(attempt.timer);
      attempt.timer = null;
      signal?.removeEventListener("abort", attempt.onSessionAbort);
      if (kind !== "success") {
        attempt.controller.abort();
        discard(attempt.reader);
      } else {
        attempt.reader?.releaseLock?.();
      }
      attempt.reader = null;
      attempt.release?.();
      attempt.release = null;
      attempt.chunks = [];
      attempt.buffered = 0;
      this.stats.loading.end = Math.max(performance.now(), this.stats.loading.first, this.stats.loading.start);
      const seconds = (this.stats.loading.end - this.stats.loading.start) / 1000;
      this.stats.bwEstimate = seconds > 0 ? this.stats.loaded * 8 / seconds : 0;
      if (kind === "abort" || kind === "destroy" || kind === "timeout") this.stats.aborted = true;
      const callbacks = attempt.callbacks;
      attempt.callbacks = null;
      if (kind === "success") callbacks.onSuccess(result, this.stats, attempt.context, null);
      else if (kind === "error") callbacks.onError(result, attempt.context, null, this.stats);
      else if (kind === "timeout") callbacks.onTimeout(this.stats, attempt.context, null);
      else if (kind === "abort") callbacks.onAbort?.(this.stats, attempt.context, null);
      // destroy is intentionally silent, like the pinned SDK's FetchLoader.
    }

    abort() { if (this.pending) this.finish(this.pending, "abort"); }
    destroy() {
      this.destroyed = true;
      if (this.pending) this.finish(this.pending, "destroy");
      this.context = null;
      this.responseHeaders = null;
      this.pending = null;
    }
    getResponseHeader(name) { return this.responseHeaders?.get(name) ?? null; }
    getCacheAge() {
      const value = this.getResponseHeader("age");
      return value !== null && /^\d+$/.test(value) && Number.isFinite(Number(value)) ? Number(value) : null;
    }
  };
}
