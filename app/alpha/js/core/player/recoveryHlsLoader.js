// Recovery budgets for the local audio/container recovery prototype (#12 unit 3).
//
// Pure policy layer: limits, resource classification, concurrency and observed
// byte accounting. No network access and not wired into playback. The isolated
// loader rebuild lives in boundedRecoveryLoader.js; its original held-back
// findings remain in docs/agent-runs/2026-10-19-recovery-loader-review.md.

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
  EXHAUSTED: "recovery-session-exhausted",
  TIMEOUT: "recovery-timeout"
});

const PLAYLIST_TYPES = new Set(["manifest", "level", "audiotrack", "subtitletrack", "vtt"]);
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

// Playlists are declared by hls.js through the context type. Init segments are
// only distinguishable when the caller marks them: pinned hls.js uses
// `frag.sn === "initSegment"` and an object-valued `frag.initSegment`, so those
// two shapes are honoured and nothing is inferred from a URL extension.
export function classifyRecoveryResource(context = {}) {
  const type = boundedText(String(context?.type ?? ""), 32).toLowerCase();
  if (PLAYLIST_TYPES.has(type)) return RECOVERY_RESOURCE.PLAYLIST;
  const frag = context?.frag || null;
  if (
    frag &&
    (frag.sn === "initSegment" || (frag.initSegment && typeof frag.initSegment === "object"))
  ) {
    return RECOVERY_RESOURCE.INIT;
  }
  if (context?.initSegment === true) return RECOVERY_RESOURCE.INIT;
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

export function remainingBudget(kind, usedBytes, limits = RECOVERY_LIMITS) {
  const used = Number(usedBytes);
  return Math.max(0, resourceLimit(kind, limits) - (Number.isFinite(used) && used > 0 ? used : 0));
}

// One recovery session owns every budget. Every observed byte is accounted for,
// including bytes that arrive in a rejected chunk, and an exhausted session
// latches so later requests cannot re-open it. Release handles are bound to a
// successful acquisition, so destroying an unused or rejected loader cannot
// release somebody else's slot.
export function createRecoverySession({ limits = RECOVERY_LIMITS } = {}) {
  limits = Object.freeze({ ...limits });
  for (const [name, maximum] of Object.entries(RECOVERY_LIMITS)) {
    if (!Number.isSafeInteger(limits[name]) || limits[name] <= 0 || limits[name] > maximum) {
      throw new Error("recovery-invalid-limits");
    }
  }
  let active = 0;
  let sessionBytes = 0;
  let exhausted = false;
  const counters = { requests: 0, rejected: 0, releases: 0 };

  const session = {
    limits,
    acquire() {
      if (exhausted) {
        counters.rejected += 1;
        return { ok: false, reason: RECOVERY_ERROR.EXHAUSTED };
      }
      if (active >= limits.maxConcurrentRequests) {
        counters.rejected += 1;
        return { ok: false, reason: RECOVERY_ERROR.CONCURRENCY };
      }
      active += 1;
      counters.requests += 1;
      let released = false;
      return {
        ok: true,
        release() {
          if (released) return false;
          released = true;
          counters.releases += 1;
          active = Math.max(0, active - 1);
          return true;
        }
      };
    },
    // Account for every byte actually received, including a chunk that pushes
    // the request over its own limit: unaccounted bytes are how a session
    // silently exceeds its cap.
    charge(kind, bytes) {
      const count = Number(bytes);
      if (!Number.isFinite(count) || count <= 0) return { ok: true };
      sessionBytes += count;
      if (exhausted || count > resourceLimit(kind, limits) || sessionBytes > limits.sessionBytes) {
        exhausted = true;
        counters.rejected += 1;
        return { ok: false, reason: RECOVERY_ERROR.BUDGET };
      }
      return { ok: true };
    },
    // A stream may overflow its resource cap cumulatively across small chunks.
    exhaust() {
      exhausted = true;
    },
    get activeRequests() {
      return active;
    },
    get sessionBytes() {
      return sessionBytes;
    },
    get isExhausted() {
      return exhausted;
    },
    snapshot() {
      return { ...counters, active, sessionBytes, exhausted };
    }
  };
  return session;
}
