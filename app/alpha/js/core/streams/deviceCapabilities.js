import { probeSourceCapabilities } from "./sourceCapabilities.js";

// Fixed diagnostic samples, NOT declarations about a selected stream or device.
export const READINESS_SAMPLES = Object.freeze([
  { id: "avc", label: "MP4 / AVC sample", mime: "video/mp4", codec: "avc1.42E01E", width: 1280, height: 720, bitrate: 4000000, framerate: 30 },
  { id: "hevc10", label: "MP4 / HEVC Main10 sample", mime: "video/mp4", codec: "hvc1.2.4.L153.B0", width: 3840, height: 2160, bitrate: 20000000, framerate: 24 },
  { id: "mkv", label: "MKV / HEVC Main10 sample", mime: "video/x-matroska", codec: "hvc1.2.4.L153.B0", width: 3840, height: 2160, bitrate: 20000000, framerate: 24 },
  { id: "dv5", label: "MP4 / Dolby Vision profile 5 sample", mime: "video/mp4", codec: "dvhe.05.06", width: 1920, height: 1080, bitrate: 10000000, framerate: 24 }
].map(Object.freeze));

const available = (value) => typeof value === "function";
function prediction(call) {
  try {
    const result = call();
    return typeof result === "boolean" ? (result ? "predicted-supported" : "predicted-unsupported") : "unknown";
  } catch { return "unknown"; }
}
async function bounded(call, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(call),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("deadline")), timeoutMs); })
    ]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}
async function decoderPrediction(decoder, config, timeoutMs) {
  if (!available(decoder?.isConfigSupported)) return "unknown";
  const result = await bounded(() => decoder.isConfigSupported(config), timeoutMs);
  return prediction(() => result?.supported);
}

// UA labels are hints only. They NEVER select a codec result; iOS brands may
// not identify an engine, and Linux WebKit is not evidence for Apple Safari.
export function platformHints(navigator = {}) {
  const ua = String(navigator.userAgent || "");
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return {
    platform: ios ? "iOS/iPadOS hint" : /Android/.test(ua) ? "Android hint" : /Macintosh/.test(ua) ? "macOS hint" : /Windows/.test(ua) ? "Windows hint" : /Linux/.test(ua) ? "Linux hint" : "unknown",
    engine: ios ? "unknown (iOS browser branding is not engine proof)" : /Firefox\//.test(ua) ? "Gecko hint" : /Chrome\//.test(ua) ? "Blink hint" : /AppleWebKit/.test(ua) ? "WebKit hint" : "unknown"
  };
}

export function browserCapabilityEnvironment(root = globalThis) {
  return {
    navigator: root.navigator,
    videoElement: root.document?.createElement("video"),
    MediaSource: root.MediaSource,
    ManagedMediaSource: root.ManagedMediaSource,
    VideoDecoder: root.VideoDecoder,
    AudioDecoder: root.AudioDecoder,
    Notification: root.Notification,
    matchMedia: root.matchMedia?.bind(root),
    secureContext: root.isSecureContext === true
  };
}

export async function detectDeviceCapabilities(environment = browserCapabilityEnvironment(), { timeoutMs = 750 } = {}) {
  const env = environment;
  const nav = env.navigator || {};
  const deadline = Math.min(2000, Math.max(1, Number(timeoutMs) || 750));
  const samples = await Promise.all(READINESS_SAMPLES.map(async (sample) => {
    const contentType = `${sample.mime}; codecs="${sample.codec}"`;
    const config = { codec: sample.codec, codedWidth: sample.width, codedHeight: sample.height };
    const [source, webCodecs] = await Promise.all([
      probeSourceCapabilities({ contentType, video: sample }, { videoElement: env.videoElement, mediaCapabilities: nav.mediaCapabilities, timeoutMs: deadline }),
      decoderPrediction(env.VideoDecoder, config, deadline)
    ]);
    return {
      id: sample.id, label: sample.label,
      configuration: { contentType, width: sample.width, height: sample.height, bitrate: sample.bitrate, framerate: sample.framerate },
      native: source.native, mediaCapabilities: source,
      mse: prediction(() => env.MediaSource?.isTypeSupported(contentType)),
      managedMedia: prediction(() => env.ManagedMediaSource?.isTypeSupported(contentType)),
      webCodecsVideo: webCodecs
    };
  }));
  const audioConfiguration = { codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2 };
  const [audio, persisted] = await Promise.all([
    decoderPrediction(env.AudioDecoder, audioConfiguration, deadline),
    available(nav.storage?.persisted) ? bounded(() => nav.storage.persisted(), deadline) : null
  ]);
  return {
    version: 1, evidence: "browser-prediction", ...platformHints(nav),
    features: {
      nativeVideo: available(env.videoElement?.canPlayType),
      mse: available(env.MediaSource), managedMedia: available(env.ManagedMediaSource),
      videoWebCodecs: available(env.VideoDecoder), audioWebCodecs: available(env.AudioDecoder),
      persistentStorage: available(nav.storage?.persist),
      notifications: env.secureContext && available(env.Notification)
    },
    samples,
    audio: { configuration: audioConfiguration, prediction: audio },
    hdrDisplayQuery: prediction(() => {
      const baseline = env.matchMedia?.("(dynamic-range: standard)");
      const high = env.matchMedia?.("(dynamic-range: high)");
      return baseline?.matches || high?.matches ? high.matches : undefined;
    }),
    physicalHdrOutput: "unknown", observedPlayback: "not-tested",
    persistentStorage: typeof persisted === "boolean" ? (persisted ? "granted" : "not-granted") : "unknown",
    notificationPermission: ["default", "denied", "granted"].includes(env.Notification?.permission) ? env.Notification.permission : "unknown"
  };
}

export function readinessVerdict(report) {
  const baseline = report.samples.find((sample) => sample.id === "avc");
  if (!report.features.nativeVideo) return "Native video API unavailable. Try an installed external player; if that cannot play it, use your own compute. Neither route is verified here.";
  if (["probably", "maybe"].includes(baseline?.native)) return "Your browser predicts it can play the AVC sample. Your selected stream, audio and display still need playback verification.";
  return "Browser playback is uncertain. Try the original stream first, then an installed external player, then your own compute if needed. These routes do not bypass source requirements.";
}

// Call ONLY for the explicit storage-purpose button, never Check or Continue.
export async function requestPersistentSiteData(storage, { timeoutMs = 750 } = {}) {
  if (!available(storage?.persist)) return "unavailable";
  const result = await bounded(() => storage.persist(), Math.min(2000, Math.max(1, Number(timeoutMs) || 750)));
  return result === true ? "granted" : result === false ? "not-granted" : "unknown";
}
