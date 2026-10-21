import { createExternalPlaybackCallbacks, createOutplayerReturnCallbacks } from "./browserExternalPlaybackHandoff.js";
import { getSidecarCapabilities } from "../../core/platform/sidecarCapabilities.js";
import {
  beginExternalPlaybackHandoff,
  clearExternalPlaybackHandoff
} from "./browserExternalPlaybackHandoff.js";
import { ProfileManager } from "../../core/profile/profileManager.js";

const EXTERNAL_PLAYER_IDS = Object.freeze({
  DISABLED: "disabled",
  LENNA: "lenna",
  INFUSE: "infuse",
  VLC: "vlc",
  OUTPLAYER: "outplayer"
});

const IOS_APP_STORE_URLS = Object.freeze({
  lenna: "https://apps.apple.com/app/lenna-video-library-player/id6502967807",
  outplayer: "https://apps.apple.com/app/outplayer/id1449923287",
  infuse: "https://apps.apple.com/app/infuse-video-player/id1136220934",
  vlc: "https://apps.apple.com/app/vlc-media-player/id650377962"
});

const ANDROID_VLC_STORE_URL = "https://play.google.com/store/apps/details?id=org.videolan.vlc";

// Keep the policy beside the URL builders: a callback can mean a real progress
// report, a return observation, or merely a best-effort manual fallback.
const EXTERNAL_PLAYER_CAPABILITIES = Object.freeze({
  [EXTERNAL_PLAYER_IDS.OUTPLAYER]: Object.freeze({ automaticProgress: true, resume: true, callbackMode: "progress", verified: true }),
  [EXTERNAL_PLAYER_IDS.INFUSE]: Object.freeze({ automaticProgress: true, resume: true, callbackMode: "progress", verified: true }),
  [EXTERNAL_PLAYER_IDS.LENNA]: Object.freeze({ automaticProgress: true, resume: true, callbackMode: "progress", verified: true, manualFallbackOnInvalid: true }),
  [EXTERNAL_PLAYER_IDS.VLC]: Object.freeze({ automaticProgress: false, resume: false, callbackMode: "return-only", verified: false })
});

export function getBrowserExternalPlayerCapabilities(player) {
  return EXTERNAL_PLAYER_CAPABILITIES[normalizeBrowserExternalPlayer(player)] || Object.freeze({ automaticProgress: false, resume: false, callbackMode: "none", verified: false });
}

function runtimeUserAgent(runtime = globalThis) {
  return String(runtime?.navigator?.userAgent || "");
}

export function getBrowserExternalPlayerPlatform(runtime = globalThis) {
  const userAgent = runtimeUserAgent(runtime);
  const platform = String(runtime?.navigator?.platform || "");
  const maxTouchPoints = Number(runtime?.navigator?.maxTouchPoints || 0);
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)) {
    return "ios";
  }
  return "other";
}

export function normalizeBrowserExternalPlayer(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.values(EXTERNAL_PLAYER_IDS).includes(normalized)
    ? normalized
    : EXTERNAL_PLAYER_IDS.DISABLED;
}

export function getBrowserExternalPlayerOptions(runtime = globalThis) {
  const platform = getBrowserExternalPlayerPlatform(runtime);
  if (platform === "ios") {
    // Keep inherited Lenna/Outplayer builders for compatibility, but do not
    // advertise contracts we could not establish from player-owned documentation.
    return [EXTERNAL_PLAYER_IDS.DISABLED, EXTERNAL_PLAYER_IDS.INFUSE, EXTERNAL_PLAYER_IDS.VLC];
  }
  if (platform === "android") {
    return [EXTERNAL_PLAYER_IDS.DISABLED, EXTERNAL_PLAYER_IDS.VLC];
  }
  return [EXTERNAL_PLAYER_IDS.DISABLED];
}

export function isTransferableExternalMediaUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      !parsed.username && !parsed.password && !Array.from(String(value)).some((character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127);
  } catch (_) {
    return false;
  }
}

export function buildInfuseLaunchUrl({ mediaUrl, title = "", subtitleUrl = "", resumePositionSeconds = 0, externalReturnToken, externalReturnOrigin, externalReturnMethod = "" } = {}) {
  if (!isTransferableExternalMediaUrl(mediaUrl)) return "";
  const query = new URLSearchParams({ url: String(mediaUrl), position: String(Math.max(0, Math.floor(Number(resumePositionSeconds) || 0))) });
  if (String(title).trim()) query.set("filename", String(title).trim());
  if (isTransferableExternalMediaUrl(subtitleUrl)) query.set("sub", String(subtitleUrl));
  const callbacks = createExternalPlaybackCallbacks({
    token: externalReturnToken, returnOrigin: externalReturnOrigin, returnMethod: externalReturnMethod, provider: "infuse", outcomes: { success: "stopped", error: "stopped" }
  });
  if (callbacks?.success) {
    const success = new URL(callbacks.success);
    success.searchParams.set("sourceOutcome", "success");
    query.set("x-success", success.href);
  }
  if (callbacks?.error) {
    const error = new URL(callbacks.error);
    error.searchParams.set("sourceOutcome", "error");
    query.set("x-error", error.href);
  }
  return `infuse://x-callback-url/play?${query.toString()}`;
}

export function buildLennaLaunchUrl({ mediaUrl, subtitleUrl = "", resumePositionSeconds = 0, externalReturnToken, externalReturnOrigin, externalReturnMethod = "" } = {}) {
  if (!isTransferableExternalMediaUrl(mediaUrl)) return "";
  const query = new URLSearchParams({ url: String(mediaUrl) });
  if (isTransferableExternalMediaUrl(subtitleUrl)) query.set("sub", String(subtitleUrl));
  // Lenna associates sub/position with the nearest preceding url. Keep this
  // order explicit and use its documented integer-second resume input.
  query.set("position", String(Math.max(0, Math.floor(Number(resumePositionSeconds) || 0))));
  const callbacks = createExternalPlaybackCallbacks({
    token: externalReturnToken, returnOrigin: externalReturnOrigin, returnMethod: externalReturnMethod, provider: "lenna", outcomes: { success: "stopped", error: "stopped" }
  });
  if (callbacks?.success) {
    const success = new URL(callbacks.success);
    success.searchParams.set("sourceOutcome", "success");
    query.set("x-success", success.href);
  }
  if (callbacks?.error) {
    const error = new URL(callbacks.error);
    error.searchParams.set("sourceOutcome", "error");
    query.set("x-error", error.href);
  }
  return `lenna://x-callback-url/play?${query.toString()}`;
}

export function buildIosVlcLaunchUrl({ mediaUrl } = {}) {
  if (!isTransferableExternalMediaUrl(mediaUrl)) return "";
  const query = new URLSearchParams({ url: String(mediaUrl) });
  // Unlike Infuse, VLC's published callback API does not document sub/position.
  return `vlc-x-callback://x-callback-url/stream?${query.toString()}`;
}

function buildIosVlcReturnLaunchUrl({ mediaUrl, subtitleUrl = "", externalReturnToken, externalReturnOrigin, externalReturnMethod = "" } = {}) {
  const href = buildIosVlcLaunchUrl({ mediaUrl, subtitleUrl });
  if (!href) return "";
  const callbacks = createExternalPlaybackCallbacks({
    token: externalReturnToken, returnOrigin: externalReturnOrigin, returnMethod: externalReturnMethod, provider: "vlc", outcomes: { success: "stopped" }
  });
  if (!callbacks?.success) return href;
  const query = new URL(href).searchParams;
  const success = new URL(callbacks.success);
  success.searchParams.set("sourceOutcome", "success");
  query.set("x-success", success.href);
  return `vlc-x-callback://x-callback-url/stream?${query.toString()}`;
}

export function buildAndroidVlcLaunchUrl({ mediaUrl } = {}) {
  if (!isTransferableExternalMediaUrl(mediaUrl) || String(mediaUrl).includes("#")) return "";
  const parsed = new URL(String(mediaUrl));
  // Chrome's documented intent syntax keeps the source URL as ACTION_VIEW data
  // while restricting resolution to VLC's official Android package.
  // Preserve authority (including port), encoded paths and signed query bytes.
  // Reject raw fragments: encoding them would change the HTTP request, while
  // embedding them would make the Intent delimiter contract ambiguous.
  const data = String(mediaUrl).slice(parsed.protocol.length);
  return `intent:${data}#Intent;scheme=${parsed.protocol.slice(0, -1)};package=org.videolan.vlc;action=android.intent.action.VIEW;type=video/*;S.browser_fallback_url=${encodeURIComponent(ANDROID_VLC_STORE_URL)};end`;
}

// Outplayer's scheme carries no duration, so the shared launch options bring one
// this builder has no field for. The handoff record keeps it instead -- players
// that report a position without a duration are measured against that.
export function buildOutplayerLaunchUrl({ mediaUrl, externalReturnToken, externalReturnOrigin, externalReturnMethod = "", resumePositionSeconds = 0 } = {}) {
  if (!isTransferableExternalMediaUrl(mediaUrl)) return "";
  const callbacks = createOutplayerReturnCallbacks({ token: externalReturnToken, returnOrigin: externalReturnOrigin, returnMethod: externalReturnMethod });
  const query = new URLSearchParams({ url: String(mediaUrl) });
  if (callbacks?.success && callbacks?.cancel) {
    query.set("x-success", callbacks.success);
    query.set("x-cancel", callbacks.cancel);
  }
  const safeResumePosition = Number(resumePositionSeconds);
  if (Number.isFinite(safeResumePosition) && safeResumePosition > 0) {
    query.set("position", String(Math.max(0, safeResumePosition)));
  }
  return `outplayer://x-callback-url/play?${query.toString()}`;
}

// All shipped hand-off routes are URL-only. Treat every declared request map as
// required, including unknown names/empty values; never silently strip a map.
export function assessBrowserExternalHandoff({ mediaUrl, source, subtitle, subtitleUrl = "", requestHeaders } = {}) {
  const descriptors = [source, source?.raw, subtitle, subtitle?.raw];
  const maps = [requestHeaders, ...descriptors.flatMap((entry) => [
    entry?.headers, entry?.requestHeaders, entry?.proxyHeaders?.request,
    entry?.behaviorHints?.proxyHeaders?.request
  ])];
  const declared = descriptors.some((entry) => Number(entry?.requiredHeaderCount || entry?.sourceDescriptor?.requiredHeaderCount) > 0) ||
    maps.some((map) => map != null && (typeof map !== "object" || Object.keys(map).length > 0));
  if (declared) return { allowed: false, reason: "This source or subtitle requires request headers. These URL-only hand-offs cannot deliver them. Choose another source or ask the provider for a self-authorizing URL." };
  if (descriptors.some((entry) => entry?.behaviorHints?.notWebReady === true || entry?.behaviorHints?.notWebReady === "true")) {
    return { allowed: false, reason: "The provider marks this source as not web-ready. Its request requirements are unverified; choose another source for URL-only hand-off." };
  }
  if (!isTransferableExternalMediaUrl(mediaUrl) || (subtitleUrl && !isTransferableExternalMediaUrl(subtitleUrl))) {
    return { allowed: false, reason: "Only HTTP(S) stream and subtitle links without embedded login credentials can leave this browser. Choose another source." };
  }
  return { allowed: true, reason: "URL only: browser cookies and request headers are not transferred." };
}

export function buildBrowserExternalPlayerLaunch({ player, platform, mediaUrl, title, subtitleUrl, source, subtitle, requestHeaders, externalReturnToken, externalReturnOrigin, externalReturnMethod = "", resumePositionSeconds = 0, knownDurationMs = 0 } = {}) {
  const selectedPlayer = normalizeBrowserExternalPlayer(player);
  if (!assessBrowserExternalHandoff({ mediaUrl, source, subtitle, subtitleUrl, requestHeaders }).allowed || selectedPlayer === EXTERNAL_PLAYER_IDS.DISABLED) {
    return null;
  }
  if (platform === "ios" && selectedPlayer === EXTERNAL_PLAYER_IDS.LENNA) {
    return { href: buildLennaLaunchUrl({ mediaUrl, subtitleUrl, resumePositionSeconds, externalReturnToken, externalReturnOrigin, externalReturnMethod }), storeUrl: IOS_APP_STORE_URLS.lenna };
  }
  if (platform === "ios" && selectedPlayer === EXTERNAL_PLAYER_IDS.INFUSE) {
    return { href: buildInfuseLaunchUrl({ mediaUrl, title, subtitleUrl, resumePositionSeconds, externalReturnToken, externalReturnOrigin, externalReturnMethod }), storeUrl: IOS_APP_STORE_URLS.infuse };
  }
  if (platform === "ios" && selectedPlayer === EXTERNAL_PLAYER_IDS.VLC) {
    return { href: buildIosVlcReturnLaunchUrl({ mediaUrl, subtitleUrl, externalReturnToken, externalReturnOrigin, externalReturnMethod }), storeUrl: IOS_APP_STORE_URLS.vlc };
  }
  if (platform === "ios" && selectedPlayer === EXTERNAL_PLAYER_IDS.OUTPLAYER) {
    const href = buildOutplayerLaunchUrl({ mediaUrl, externalReturnToken, externalReturnOrigin, externalReturnMethod, resumePositionSeconds, knownDurationMs });
    return href ? { href, storeUrl: IOS_APP_STORE_URLS.outplayer } : null;
  }
  if (platform === "android" && selectedPlayer === EXTERNAL_PLAYER_IDS.VLC) {
    const href = buildAndroidVlcLaunchUrl({ mediaUrl });
    return href ? { href, storeUrl: ANDROID_VLC_STORE_URL } : null;
  }
  return null;
}

export function resolveBrowserStreamPlaybackRoute(options = {}) {
  const launch = buildBrowserExternalPlayerLaunch(options);
  return launch ? { target: "external", launch } : { target: "nuvio", launch: null };
}

export function getManualBrowserExternalPlayerOptions(runtime = globalThis) {
  return getBrowserExternalPlayerOptions(runtime).filter((id) => id !== EXTERNAL_PLAYER_IDS.DISABLED);
}

export function prepareBrowserExternalPlaybackLaunch({
  player,
  platform = getBrowserExternalPlayerPlatform(),
  mediaUrl,
  title = "",
  subtitleUrl = "",
  source = null,
  subtitle = null,
  requestHeaders = null,
  resumePositionSeconds = 0,
  knownDurationMs = 0,
  progressContext = null,
  progressMode = "automatic",
  returnMethod = "",
  profileId = null,
  runtime = globalThis
} = {}) {
  if (!assessBrowserExternalHandoff({ mediaUrl, source, subtitle, subtitleUrl, requestHeaders }).allowed) return null;
  if (platform === "android" && String(mediaUrl).includes("#")) return null;
  const normalizedPlayer = normalizeBrowserExternalPlayer(player);
  const capabilities = getBrowserExternalPlayerCapabilities(normalizedPlayer);
  const observationCallback = capabilities.callbackMode === "return-only";
  const relayEnabled = getSidecarCapabilities(runtime).externalReturn;
  const automatic = relayEnabled && progressMode !== "manual" && (capabilities.automaticProgress || observationCallback);
  const handoff = beginExternalPlaybackHandoff({
    runtime,
    playerMode: normalizedPlayer,
    automatic,
    progressMode: automatic ? "automatic" : "manual",
    callbackCapable: relayEnabled && capabilities.automaticProgress,
    manualPromptEligible: !relayEnabled || observationCallback || capabilities.manualFallbackOnInvalid || progressMode === "manual",
    progressContext,
    profileId: profileId ?? ProfileManager.getActiveProfileId(),
    startingPositionMs: Math.max(0, Number(resumePositionSeconds) || 0) * 1000,
    knownDurationMs
  });
  const launch = buildBrowserExternalPlayerLaunch({
    player: normalizedPlayer,
    platform,
    mediaUrl,
    title,
    subtitleUrl,
    externalReturnToken: handoff?.automatic ? handoff.token : null,
    externalReturnOrigin: handoff?.automatic ? handoff.returnOrigin : null,
    externalReturnMethod: handoff?.automatic ? returnMethod : "",
    resumePositionSeconds,
    knownDurationMs: handoff?.automatic ? handoff.knownDurationMs : 0
  });
  if (!launch?.href) {
    if (handoff) clearExternalPlaybackHandoff({ runtime });
    return null;
  }
  return { launch, handoff, automatic, callbackCapable: relayEnabled && capabilities.automaticProgress };
}


export function getBrowserExternalPlayerStoreUrl({ player, platform } = {}) {
  const selectedPlayer = normalizeBrowserExternalPlayer(player);
  if (platform === "ios") return IOS_APP_STORE_URLS[selectedPlayer] || "";
  if (platform === "android" && selectedPlayer === EXTERNAL_PLAYER_IDS.VLC) return ANDROID_VLC_STORE_URL;
  return "";
}

// iOS custom schemes are deliberately fire-and-forget: Safari owns the
// unavailable-app experience, so Nuvio never stacks a speculative popup.
export function launchBrowserExternalPlayer({
  runtime = globalThis,
  href = ""
} = {}) {
  if (!href || typeof runtime?.location?.assign !== "function") return false;
  try {
    runtime.location.assign(href);
    return true; // Navigation requested, not evidence of installation or playback.
  } catch (_) {
    return false;
  }
}

export function buildBrowserExternalPlaylist(context = {}) {
  if (!assessBrowserExternalHandoff(context).allowed) return "";
  // No EXTVLCOPT directives, titles, credentials or user-controlled filenames.
  return `#EXTM3U\n${context.mediaUrl}\n`;
}

export function downloadBrowserExternalPlaylist({ runtime = globalThis, ...context } = {}) {
  const playlist = buildBrowserExternalPlaylist(context);
  if (!playlist || !runtime?.document?.body || !runtime?.URL?.createObjectURL) return false;
  let href;
  let anchor;
  try {
    href = runtime.URL.createObjectURL(new runtime.Blob([playlist], { type: "audio/x-mpegurl" }));
    anchor = runtime.document.createElement("a");
    anchor.href = href;
    anchor.download = "nuvio-stream.m3u";
    runtime.document.body.appendChild(anchor);
    anchor.click();
    return true; // File delivery requested, not evidence a native player opened it.
  } catch (_) {
    return false;
  } finally {
    anchor?.remove();
    if (href) runtime.setTimeout(() => runtime.URL.revokeObjectURL(href), 1000);
  }
}

export async function copyBrowserExternalStreamLink({ runtime = globalThis, ...context } = {}) {
  if (!assessBrowserExternalHandoff(context).allowed) return false;
  const mediaUrl = context.mediaUrl;
  try {
    if (typeof runtime?.navigator?.clipboard?.writeText !== "function") throw new Error("Clipboard unavailable");
    await runtime.navigator.clipboard.writeText(String(mediaUrl));
    return true;
  } catch (_) {
    const document = runtime?.document;
    if (!document?.body || typeof document.createElement !== "function") return false;
    const input = document.createElement("textarea");
    input.value = String(mediaUrl);
    input.setAttribute("readonly", "");
    input.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
    document.body.appendChild(input);
    input.select();
    let copied = false;
    try { copied = document.execCommand?.("copy") === true; } catch (_) { copied = false; }
    input.remove();
    return copied;
  }
}

export { EXTERNAL_PLAYER_IDS };
