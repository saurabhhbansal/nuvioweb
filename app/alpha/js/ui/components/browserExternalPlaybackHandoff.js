import { getSidecarCapabilities } from "../../core/platform/sidecarCapabilities.js";

// Local development and a configured bridge share this return protocol.
const STORAGE_KEY = "nuvioExternalPlaybackHandoff";
const TOKEN_BYTES = 16;
// The handoff is written when the external player is launched and read when the
// app comes back, so its life has to cover the playback itself. Ten minutes was
// shorter than the thing being watched: a film ran past it, the handoff was
// deleted as stale on return, and the report waiting on the relay was never
// asked for -- which is why a short watch saved its progress and a long one
// silently did not. Six hours outlasts anything worth sitting through.
const HANDOFF_TTL_MS = 6 * 60 * 60 * 1000;
// A report is written by a callback page in a separate browser context. Give
// that page a small, bounded window to finish before asking the user instead.
const FOREGROUND_RETRY_DELAYS_MS = [0, 500, 1000, 2000];
// A launch that bounces straight back (the app was not installed, a download
// bar took focus, the viewer changed their mind) has nothing to report. Asking
// then would spend the one prompt this handoff gets on a question with no
// answer, and the real return later would find it already used up.
const MANUAL_PROMPT_MIN_AWAY_MS = 20 * 1000;

function getStorage(runtime) {
  return runtime?.localStorage;
}

function writeHandoff(handoff, runtime = globalThis) {
  try {
    getStorage(runtime)?.setItem?.(STORAGE_KEY, JSON.stringify(handoff));
    return true;
  } catch (_) {
    return false;
  }
}

// Where the player's callback goes: the relay Worker when this site has one,
// otherwise the app's own https origin (a self-hosted bridge).
function getReturnOrigin(runtime) {
  const relayOrigin = getSidecarCapabilities(runtime).externalReturnOrigin;
  if (relayOrigin) return relayOrigin;
  try {
    const url = new URL(String(runtime?.location?.href || ""));
    return url.protocol === "https:" ? url.origin : "";
  } catch (_) {
    return "";
  }
}

// A manual handoff never leaves the page, so any web origin will do for it;
// only the relay callback needs https.
function getPageOrigin(runtime) {
  try {
    const url = new URL(String(runtime?.location?.href || ""));
    return ["https:", "http:"].includes(url.protocol) ? url.origin : "";
  } catch (_) {
    return "";
  }
}

function isWebOrigin(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash;
  } catch (_) {
    return false;
  }
}

export function isValidExternalPlaybackToken(token) {
  return /^[a-f0-9]{32}$/i.test(String(token || ""));
}

function isHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash;
  } catch (_) {
    return false;
  }
}

function sanitizeProgressContext(context) {
  if (!context?.itemId) return null;
  return {
    itemId: String(context.itemId),
    itemType: String(context.itemType || "movie"),
    videoId: context.videoId == null ? null : String(context.videoId),
    season: Number.isFinite(context.season) ? Number(context.season) : null,
    episode: Number.isFinite(context.episode) ? Number(context.episode) : null,
    title: context.title == null ? null : String(context.title),
    poster: context.poster == null ? null : String(context.poster),
    background: context.background == null ? null : String(context.background),
    episodeTitle: context.episodeTitle == null ? null : String(context.episodeTitle),
    streamIdentity: context.streamIdentity == null ? null : String(context.streamIdentity)
  };
}

export function createOutplayerReturnToken(runtime = globalThis) {
  const bytes = new Uint8Array(TOKEN_BYTES);
  if (typeof runtime?.crypto?.getRandomValues !== "function") return "";
  runtime.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function createOutplayerReturnCallbacks({ token, returnOrigin, returnMethod = "" } = {}) {
  const callbacks = createExternalPlaybackCallbacks({
    token,
    returnOrigin,
    returnMethod,
    provider: "outplayer",
    // Outplayer has proven this callback envelope on physical devices. The
    // source outcome carries the explicit-finish semantic; no position or
    // duration is synthesized into the URL.
    outcomes: { success: "stopped", cancel: "stopped" }
  });
  if (!callbacks?.success) return callbacks;
  const success = new URL(callbacks.success);
  success.searchParams.set("sourceOutcome", "finished");
  return { ...callbacks, success: success.href };
}

// returnMethod rides along to the relay rather than staying a client secret:
// the relay decides whether to send a notification and whether its own page
// closes itself, and it has nothing else to go on. A relay that predates this
// ignores the parameter and behaves as it does today for anyone unsubscribed.
export function createExternalPlaybackCallbacks({
  token,
  returnOrigin,
  provider,
  returnMethod = "",
  outcomes = {}
} = {}) {
  if (!isValidExternalPlaybackToken(token) || !isHttpsOrigin(returnOrigin))
    return null;
  const reportUrl = new URL(`/api/external-return/report/${token}`, returnOrigin);
  const callback = (outcome) => {
    const url = new URL(reportUrl);
    url.searchParams.set("outcome", outcome);
    if (provider) url.searchParams.set("provider", provider);
    if (returnMethod === "automation") url.searchParams.set("return", "automation");
    return url.href;
  };
  return Object.fromEntries(
    Object.entries(outcomes).map(([name, outcome]) => [name, callback(outcome)])
  );
}

export function beginExternalPlaybackHandoff({
  runtime = globalThis,
  playerMode,
  progressContext,
  profileId,
  startingPositionMs = 0,
  knownDurationMs = 0,
  automatic = false,
  progressMode = automatic ? "automatic" : "manual",
  callbackCapable = automatic,
  manualPromptEligible = !(progressMode === "automatic" && callbackCapable),
  navigationLaunch = false
} = {}) {
  const token = createOutplayerReturnToken(runtime);
  const relayOrigin = getReturnOrigin(runtime);
  const context = sanitizeProgressContext(progressContext);
  const relayEnabled = Boolean(relayOrigin) && getSidecarCapabilities(runtime).externalReturn;
  const automaticEnabled = Boolean(automatic && relayEnabled);
  const returnOrigin = automaticEnabled ? relayOrigin : getPageOrigin(runtime);
  if (!token || !returnOrigin || !context || !String(playerMode || "").trim()) return null;
  const launchedAt = Date.now();
  const handoff = {
    token,
    returnOrigin,
    playerMode: String(playerMode),
    automatic: automaticEnabled,
    profileId: String(profileId || ""),
    progressContext: context,
    launchedAt,
    expiresAt: launchedAt + HANDOFF_TTL_MS,
    startingPositionMs: Math.max(0, Math.round(Number(startingPositionMs) || 0)),
    knownDurationMs: Math.max(0, Math.round(Number(knownDurationMs) || 0)),
    progressMode: automaticEnabled && progressMode === "automatic" ? "automatic" : "manual",
    callbackCapable: Boolean(callbackCapable && relayEnabled),
    manualPromptEligible: Boolean(manualPromptEligible || !relayEnabled),
    navigationLaunch: Boolean(navigationLaunch),
    state: automaticEnabled ? "awaiting-auto-report" : "manual-required",
    returnObservedAt: null,
    manualPromptedAt: null
  };
  return writeHandoff(handoff, runtime) ? handoff : null;
}

export function clearExternalPlaybackHandoff({ runtime = globalThis } = {}) {
  try {
    getStorage(runtime)?.removeItem?.(STORAGE_KEY);
  } catch (_) {
    /* Storage is optional. */
  }
}

export function readPendingExternalPlaybackHandoff({
  runtime = globalThis,
  profileId = null
} = {}) {
  try {
    const handoff = JSON.parse(getStorage(runtime)?.getItem?.(STORAGE_KEY) || "null");
    if (
      !handoff ||
      !isValidExternalPlaybackToken(handoff.token) ||
      !(handoff.automatic ? isHttpsOrigin(handoff.returnOrigin) : isWebOrigin(handoff.returnOrigin)) ||
      handoff.returnOrigin !== (handoff.automatic ? getReturnOrigin(runtime) : getPageOrigin(runtime)) ||
      !sanitizeProgressContext(handoff.progressContext) ||
      !Number.isFinite(Number(handoff.expiresAt)) ||
      Date.now() > Number(handoff.expiresAt) ||
      Number(handoff.expiresAt) > Date.now() + HANDOFF_TTL_MS ||
      (profileId != null && String(handoff.profileId || "") !== String(profileId || ""))
    ) {
      clearExternalPlaybackHandoff({ runtime });
      return null;
    }
    if (handoff.automatic && !getSidecarCapabilities(runtime).externalReturn) {
      const manual = { ...handoff, returnOrigin: getPageOrigin(runtime), automatic: false, callbackCapable: false,
        progressMode: "manual", manualPromptEligible: true, state: "manual-required" };
      writeHandoff(manual, runtime);
      return manual;
    }
    return handoff;
  } catch (_) {
    clearExternalPlaybackHandoff({ runtime });
    return null;
  }
}

function updatePendingHandoff(handoff, patch, runtime = globalThis) {
  const next = { ...handoff, ...patch };
  return writeHandoff(next, runtime) ? next : handoff;
}

function normalizeReport(report) {
  if (!report?.found || !["finished", "stopped"].includes(report.outcome)) return null;
  const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
  return {
    outcome: report.outcome,
    provider: String(report.provider || ""),
    sourceOutcome: ["finished", "stopped", "success", "cancel", "error"].includes(
      report.sourceOutcome
    )
      ? report.sourceOutcome
      : report.outcome,
    positionSeconds: finite(report.position),
    durationSeconds: finite(report.duration),
    progressFraction: finite(report.progress),
    parameterNames: Array.isArray(report.parameterNames) ? report.parameterNames.map(String) : []
  };
}

export async function collectExternalPlaybackReport({
  runtime = globalThis,
  fetchImpl = runtime.fetch,
  profileId = null
} = {}) {
  const handoff = readPendingExternalPlaybackHandoff({ runtime, profileId });
  if (!getSidecarCapabilities(runtime).externalReturn || !handoff || !handoff.automatic || typeof fetchImpl !== "function")
    return { found: false, handoff };
  const url = `${handoff.returnOrigin}/api/external-return/collect/${handoff.token}`;
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      // The app has just woken and everything else is asking for the network at
      // the same moment. This one request is the reason it woke.
      priority: "high"
    });
    if (!response.ok) return { found: false, handoff };
    const report = normalizeReport(await response.json());
    if (!report) return { found: false, handoff };
    return { found: true, handoff, ...report };
  } catch (_) {
    return { found: false, handoff };
  }
}

// A returning external playback is invisible from the outside: the seconds
// between coming back and the card moving could be the wake-up, the collection,
// a retry, or the write, and there is no way to tell them apart on a phone.
// Each step is stamped against the moment the app came back and reported as one
// line, which Settings > About > Debug Console can show.
export function installExternalPlaybackReturnCoordinator({
  runtime = globalThis,
  fetchImpl = runtime.fetch,
  getProfileId = () => null,
  onAutomaticReport = async () => false,
  onManualFallback = () => {},
  onManualFallbackResolved = () => {},
  minimumAwayMs = MANUAL_PROMPT_MIN_AWAY_MS
} = {}) {
  let wasBackgrounded = runtime.document?.visibilityState === "hidden";
  let collecting = false;
  const promptManually = (handoff) => {
    if (!handoff?.manualPromptEligible) return;
    if (!handoff || (handoff.state === "manual-required" && handoff.manualPromptedAt)) return;
    const pending = updatePendingHandoff(
      handoff,
      {
        state: "manual-required",
        manualPromptedAt: Date.now()
      },
      runtime
    );
    onManualFallback(pending);
  };
  const runAfterForeground = ({ confirmedReturn = true } = {}) => {
    const handoff = readPendingExternalPlaybackHandoff({ runtime, profileId: getProfileId() });
    if (!handoff || collecting) return;
    if (!handoff.automatic) {
      // A manual launch has no callback protocol; only prompt after the app
      // actually returns from the external player, never at normal startup.
      // The handoff is kept when the return comes too soon, so the next one
      // still asks.
      const awayMs = Date.now() - Number(handoff.launchedAt || 0);
      if (confirmedReturn && (handoff.navigationLaunch || awayMs >= minimumAwayMs)) {
        promptManually(handoff);
      }
      return;
    }
    // Only a cycle that is mid-apply blocks another. "manual-required" used to
    // block too, which meant that once the prompt had appeared -- because the
    // report had not arrived within the retry window -- every later return was
    // refused for the ten minutes the handoff lives, even though the report was
    // by then sitting in the relay. The progress simply stayed lost until the
    // page was reloaded. The prompt has its own guard against appearing twice.
    if (handoff.state === "applying-report") return;
    updatePendingHandoff(
      handoff,
      {
        state: "awaiting-auto-report",
        returnObservedAt: confirmedReturn ? Date.now() : handoff.returnObservedAt || null
      },
      runtime
    );
    collecting = true;
    const finishCollecting = () => {
      collecting = false;
    };
    const run = async (index) => {
      try {
        const result = await collectExternalPlaybackReport({
          runtime,
          fetchImpl,
          profileId: getProfileId()
        });
        if (result.found) {
          const applying = updatePendingHandoff(
            result.handoff,
            { state: "applying-report" },
            runtime
          );
          const applied = await onAutomaticReport({ ...result, handoff: applying });
          if (applied) {
            // A report that arrives after the prompt went up answers the very
            // question it is asking, so the prompt must go rather than let the
            // viewer overwrite the real position with a guess.
            onManualFallbackResolved();
            // Keep the identity-bearing handoff until its application has
            // succeeded. The relay record is one-time, so consuming first
            // would leave an explicit completion unable to recover safely.
            clearExternalPlaybackHandoff({ runtime });
          } else {
            // The relay report is one-time. Automatic is deliberately not a
            // synonym for manual fallback: preserve the chosen mode and leave
            // existing progress unchanged if application cannot proceed.
            if (applying.manualPromptEligible) promptManually(applying);
          }
          finishCollecting();
          return;
        }
        if (index + 1 < FOREGROUND_RETRY_DELAYS_MS.length) {
          attempt(index + 1);
          return;
        }
        const pending = readPendingExternalPlaybackHandoff({ runtime, profileId: getProfileId() });
        // A bounded retry window has elapsed after a real return/startup. It
        // is now safe to offer the manual path exactly once.
        if (pending?.manualPromptEligible) promptManually(pending);
        finishCollecting();
      } finally {
        // Completion is owned by the terminal report/no-report branches so a
        // slow report application remains protected from duplicate events.
      }
    };
    // The first ask goes out in this same task, not through a timer. Coming
    // back also wakes the rest of the app, and a queued first attempt waited
    // behind all of it -- measured at 1.6s on a device, before a request had
    // even left. The retries stay on their timers; only the first one is
    // racing anything.
    const attempt = (index) =>
      index === 0
        ? void run(0)
        : runtime.setTimeout?.(() => void run(index), FOREGROUND_RETRY_DELAYS_MS[index]);
    attempt(0);
  };
  const onForeground = () => {
    if (wasBackgrounded) {
      wasBackgrounded = false;
      runAfterForeground({ confirmedReturn: true });
    }
  };
  runtime.document?.addEventListener?.("visibilitychange", () => {
    if (runtime.document.visibilityState === "hidden") wasBackgrounded = true;
    else if (runtime.document.visibilityState === "visible") onForeground();
  });
  runtime.addEventListener?.("pagehide", () => {
    wasBackgrounded = true;
  });
  runtime.addEventListener?.("pageshow", onForeground);
  runtime.addEventListener?.("blur", () => {
    wasBackgrounded = true;
  });
  runtime.addEventListener?.("focus", onForeground);
  // A callback can open Safari and the user can later cold-launch the PWA.
  // In that case there is no prior visibility transition in this JS context.
  if (runtime.document?.visibilityState !== "hidden") {
    const pending = readPendingExternalPlaybackHandoff({ runtime, profileId: getProfileId() });
    // A handoff that navigated this page away takes the app's own reload as the
    // return: the launch destroyed the JS context that would have seen the
    // visibility change, so waiting for one means never prompting at all.
    if (pending?.automatic || pending?.navigationLaunch) {
      runAfterForeground({ confirmedReturn: true });
    }
  }
  return { collect: runAfterForeground };
}
