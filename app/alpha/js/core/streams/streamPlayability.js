// Labels a source card with what this browser will do with the file: play it,
// convert its audio, need another audio track, play it silent, or not play the
// picture at all. The answer comes from the file's own header, read in the
// browser with range requests (core/player/remux/remuxAudio.js); nothing passes
// through a server of ours, and nothing is labelled from guesses.
//
// Only Chromium and Firefox are checked. Safari lists a file's tracks itself and
// plays different containers, so the same header would mean something else there.

import { describeSource } from "./sourceCapabilities.js";

const CODEC_NAMES = [
  [/^(avc1|avc3)/, "H.264"],
  [/^(hvc1|hev1)/, "HEVC"],
  [/^av01/, "AV1"],
  [/^vp09|^v_vp9/, "VP9"],
  [/^v_vp8|^vp8/, "VP8"],
  [/^mp4a\.40/, "AAC"],
  [/^mp4a\.6b|^mp4a\.69|^mp3/, "MP3"],
  [/^opus/, "Opus"],
  [/^flac|^fLaC/i, "FLAC"],
  [/^ac-3/, "AC-3"],
  [/^ec-3/, "E-AC-3"],
  [/^dts|^a_dts/, "DTS"],
  [/truehd|^mlp/, "TrueHD"],
  [/vorbis/, "Vorbis"]
];

export function friendlyCodecName(codec = "") {
  const value = String(codec || "").toLowerCase();
  for (const [pattern, name] of CODEC_NAMES) if (pattern.test(value)) return name;
  return value.toUpperCase() || "unknown";
}

function channelLabel(channels) {
  return channels === 6 ? " 5.1" : channels === 8 ? " 7.1" : channels === 1 ? " mono" : "";
}

/** "H.264 · AC-3 5.1": the codecs a label is about, for its tooltip. */
export function describeProbedCodecs(probe) {
  const parts = [];
  if (probe?.video?.codec) parts.push(friendlyCodecName(probe.video.codec));
  const audio = probe?.audio?.[0];
  if (audio?.codec) parts.push(`${friendlyCodecName(audio.codec)}${channelLabel(audio.channels)}`);
  return parts.join(" · ");
}

export const PLAYABILITY_LABELS = Object.freeze({
  "plays-here": ["stream_playability_plays_here", "Plays here"],
  "audio-converted": ["stream_playability_audio_converted", "Audio converted"],
  "change-audio": ["stream_playability_change_audio", "Change audio track"],
  "no-sound": ["stream_playability_no_sound", "No sound here"],
  "video-unplayable": ["stream_playability_video_unplayable", "Video won't play here"]
});

/**
 * Turns a header probe into one card hint, mirroring what the player does:
 * the plain file plays its first audio track; when that one can't be decoded,
 * the player converts it (AC-3/E-AC-3) or the viewer has to pick another.
 */
export function classifyStreamProbe(probe) {
  if (!probe || typeof probe !== "object") return null;
  const audio = Array.isArray(probe.audio) ? probe.audio : [];
  let reason;
  if (probe.video && !probe.video.playable) reason = "video-unplayable";
  else if (!audio.length || audio[0].playable) reason = "plays-here";
  else if (probe.switchable && audio[0].convertible) reason = "audio-converted";
  else if (probe.switchable && audio.some((track) => track.playable || track.convertible))
    reason = "change-audio";
  else reason = "no-sound";
  const [key, label] = PLAYABILITY_LABELS[reason];
  return {
    reason,
    label,
    labelKey: key,
    tone: reason === "plays-here" || reason === "audio-converted" ? "positive" : "warning",
    detail: describeProbedCodecs(probe)
  };
}

/** True in browsers whose player this label describes (see the top comment). */
export function canCheckPlayabilityHere(root = globalThis) {
  const media = root.HTMLMediaElement?.prototype;
  if (!media || "audioTracks" in media) return false;
  const MediaSourceCtor = root.ManagedMediaSource || root.MediaSource;
  return typeof MediaSourceCtor?.isTypeSupported === "function" && typeof root.fetch === "function";
}

/** The URL to check, or "" when the source isn't a plain file this can read. */
export function playabilityProbeUrl(stream = {}) {
  const url = String(stream?.url || stream?.raw?.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  if (/\.(m3u8|mpd)(?:$|[?#])/i.test(url)) return "";
  const described = describeSource({ ...stream?.raw, ...stream });
  if (described.requiredHeaderCount) return "";
  if (["hls", "dash", "torrent"].includes(described.transportHint)) return "";
  return url;
}

const MAX_CACHED = 300;
const results = new Map();

/** The finished hint for a stream, or null while unknown or unchecked. */
export function cachedPlayabilityHint(stream) {
  const url = playabilityProbeUrl(stream);
  const entry = url ? results.get(url) : null;
  return entry?.hint || null;
}

export function rememberPlayability(url, hint) {
  results.delete(url);
  results.set(url, { hint: hint || null, at: Date.now() });
  while (results.size > MAX_CACHED) results.delete(results.keys().next().value);
}

export function hasPlayabilityResult(url) {
  return results.has(url);
}

export function clearPlayabilityResults() {
  results.clear();
}

/**
 * Runs probes a few at a time. `probe(url, { signal })` resolves with the
 * header report or throws; either way the URL is answered once per session.
 */
export function createPlayabilityQueue({ probe, concurrency = 2, timeoutMs = 12000, onResult = () => {} } = {}) {
  const pending = [];
  const queued = new Set();
  const running = new Map();
  let closed = false;

  const pump = () => {
    while (!closed && running.size < concurrency && pending.length) {
      const url = pending.shift();
      queued.delete(url);
      if (hasPlayabilityResult(url) || running.has(url)) continue;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      running.set(url, controller);
      Promise.resolve()
        .then(() => probe(url, { signal: controller.signal }))
        .then(
          (report) => classifyStreamProbe(report),
          () => null
        )
        .then((hint) => {
          clearTimeout(timer);
          running.delete(url);
          // A screen that left mid-check doesn't record a timeout as an answer.
          if (closed) return;
          rememberPlayability(url, hint);
          onResult(url, hint);
          pump();
        });
    }
  };

  return {
    /** Queues URLs in order; `first` puts them ahead (the card in focus). */
    add(urls, { first = false } = {}) {
      if (closed) return;
      const fresh = urls.filter((url) => url && !hasPlayabilityResult(url) && !running.has(url));
      for (const url of fresh) {
        if (queued.has(url)) {
          if (!first) continue;
          pending.splice(pending.indexOf(url), 1);
        }
        queued.add(url);
        if (first) pending.unshift(url);
        else pending.push(url);
      }
      pump();
    },
    get size() {
      return pending.length + running.size;
    },
    close() {
      closed = true;
      pending.length = 0;
      queued.clear();
      for (const controller of running.values()) controller.abort();
      running.clear();
    }
  };
}
