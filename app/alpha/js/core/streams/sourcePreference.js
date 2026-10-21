import { describeSource, hasSourceCodecConflict, normalizeSourceDescriptor, probeNativeSource } from "./sourceCapabilities.js";
import { browserCapabilityEnvironment } from "./deviceCapabilities.js";
import { assessBrowserExternalHandoff } from "../../ui/components/browserExternalPlayer.js";

// Weak keys only: no URL/credential key, storage, telemetry or device fingerprint.
// Flattened rows retain raw across the screen's shallow in-memory Back snapshots.
const failedSources = new WeakSet();
const correctionKey = (stream) => stream?.raw && typeof stream.raw === "object" ? stream.raw : stream;
export function toggleSourcePlaybackFailure(stream) {
  const key = correctionKey(stream);
  if (!key || typeof key !== "object") return;
  if (failedSources.has(key)) failedSources.delete(key);
  else failedSources.add(key);
}

const result = (route, rank, reason, explanation, corrected = false) => ({ route, rank, reason, explanation, corrected });
const VIDEO_CODEC = /^(?:avc[13]\.[a-f0-9]+|(?:hvc1|hev1)\.[abc]?\d+\.[a-f0-9]+\.l\d+(?:\.[a-f0-9]+)*|(?:dvhe|dvh1)\.\d{2}\.\d{2}|vp8|vp8\.0|vp09\.[\d.]+|av01\.[a-z0-9.]+)$/i;
const AUDIO_CODEC = /^(?:mp4a\.40\.\d+|opus|vorbis|ac-3|ec-3|flac)$/i;

/** Display advice only; never fetches, selects, substitutes or launches a source. */
export function assessSourceForDevice(stream = {}, { environment = browserCapabilityEnvironment(), now = Date.now() } = {}) {
  const raw = describeSource({ ...stream?.raw, ...stream });
  const descriptor = stream?.sourceDescriptor ? normalizeSourceDescriptor(stream.sourceDescriptor) : raw;
  const handoff = assessBrowserExternalHandoff({ mediaUrl: stream?.url || stream?.raw?.url, source: stream });
  if (handoff.code === "headers-required" || descriptor.requiredHeaderCount || raw.requiredHeaderCount) {
    return result("proxy", 3, "headers-required", "Needs your own proxy because it requires headers; in-page and URL-only players cannot supply them");
  }
  if ([descriptor.expiresAt, raw.expiresAt].some((expiry) => expiry && Date.parse(expiry) <= now)) {
    return result("blocked", 4, "expired", "Blocked — provider-declared link expired; refresh sources");
  }
  if (!handoff.allowed) {
    return result("blocked", 4, handoff.code, handoff.code === "not-web-ready"
      ? "Blocked — provider marks delivery not web-ready; request requirements unverified"
      : "Blocked — no transferable HTTP(S) link; resolve or choose another source");
  }
  const external = (reason, detail) => result("external", 1, reason, `Needs another player — ${detail}; installed-player support unverified`);
  if (descriptor.container === "matroska" || raw.container === "matroska") {
    return external("mkv", "MKV demux is unavailable in this browser player");
  }
  const mimeCodecs = /;\s*codecs="([^"]*)"/i.exec(descriptor.contentType || "")?.[1].split(",").map((codec) => codec.trim()) || [];
  const audio = descriptor.audioTracks.map((track) => track.codec);
  if ([...audio, ...raw.audioTracks.map((track) => track.codec), ...mimeCodecs].some((codec) => /^(?:truehd|true-hd|mlp|a_truehd)$/i.test(codec || ""))) {
    return external("truehd", "TrueHD audio cannot be decoded in-page");
  }
  const key = correctionKey(stream);
  if (key && typeof key === "object" && failedSources.has(key)) {
    return result("unknown", 2, "reported-failure", "Unknown here — you reported playback failed; try another source or player", true);
  }
  const unknown = (reason, detail) => result("unknown", 2, reason, `Unknown here — ${detail}`);
  if (stream?.sourceDescriptor && (
    (raw.contentType && raw.contentType !== descriptor.contentType) ||
    (raw.video.codec && raw.video.codec !== descriptor.video.codec) ||
    (raw.video.hdr && raw.video.hdr !== descriptor.video.hdr) ||
    (raw.audioTracks.length && JSON.stringify(raw.audioTracks) !== JSON.stringify(descriptor.audioTracks))
  )) return unknown("descriptor-conflict", "raw and projected media declarations disagree");
  if (hasSourceCodecConflict(descriptor)) return unknown("codec-conflict", "provider codec declarations disagree");
  if (descriptor.transportHint !== "direct" || raw.transportHint !== "direct") {
    return unknown("adaptive", "delivery/manifest codecs need playback verification");
  }
  if (!["mp4", "webm"].includes(descriptor.container)) return unknown("container", "container support unverified");
  const videoCodec = descriptor.video.codec || mimeCodecs.find((codec) => VIDEO_CODEC.test(codec));
  if (!videoCodec || !VIDEO_CODEC.test(videoCodec)) return unknown("video-codec", "exact video codec/profile missing or unverified");
  const dv = /^(?:dvhe|dvh1)\.(\d{2})\.\d{2}$/i.exec(videoCodec);
  if (dv && dv[1] === "07") return external("dv-profile", "Dolby Vision profile 7 layer handling is unavailable in-page");
  if (dv && dv[1] !== "05") return unknown("dv-profile", `Dolby Vision profile ${Number(dv[1])} is outside the checked browser subset`);
  if (descriptor.video.hdr && /dolby|^dv/i.test(descriptor.video.hdr) && !dv) {
    return unknown("dv-profile", "exact Dolby Vision profile missing");
  }
  // A codec alias such as HEVC cannot stand in for an RFC 6381 profile string.
  // Bare container support cannot establish audio support or absence of audio.
  if (audio.some((codec) => !codec || !AUDIO_CODEC.test(codec))) return unknown("audio-codec", "exact audio codec missing or unverified");
  const declaredAudio = audio.length ? audio : mimeCodecs.filter((codec) => AUDIO_CODEC.test(codec));
  if (!declaredAudio.length) return unknown("audio-codec", "audio codec metadata missing");
  const complete = [...new Set([videoCodec, ...declaredAudio])];
  if (mimeCodecs.some((codec) => !complete.includes(codec))) return unknown("codec-conflict", "additional MIME codecs are unverified");
  const contentType = `${descriptor.contentType.split(";")[0]}; codecs="${complete.join(",")}"`;
  const prediction = probeNativeSource({ ...descriptor, contentType }, environment?.videoElement);
  if (prediction === "not-reported") return external("native-unsupported", `${dv ? "Dolby Vision profile 5" : /^(hvc1|hev1)/i.test(videoCodec) ? "this HEVC profile" : "this video/audio configuration"} not supported by this browser prediction`);
  if (!["probably", "maybe"].includes(prediction)) return unknown("prediction", "browser capability unavailable or inconclusive");
  return result("browser", 0, "native-predicted", "Plays here (browser prediction) — declared video/audio supported; playback and HDR output unverified");
}

// Stable tiers on top of existing add-on order; identical objects/IDs/URLs survive.
export function orderSourcesByNativePrediction(streams = [], options = {}) {
  const environment = options.environment || { videoElement: options.videoElement || browserCapabilityEnvironment().videoElement };
  const native = environment.videoElement;
  const predictions = new Map();
  const memoEnvironment = { ...environment, videoElement: typeof native?.canPlayType === "function" ? {
    canPlayType(type) {
      if (!predictions.has(type)) predictions.set(type, native.canPlayType(type));
      return predictions.get(type);
    }
  } : native };
  return (Array.isArray(streams) ? streams : []).map((stream, index) => ({ stream, index,
    rank: assessSourceForDevice(stream, { ...options, environment: memoEnvironment }).rank
  })).sort((left, right) => left.rank - right.rank || left.index - right.index).map(({ stream }) => stream);
}
