// Entry point for switching audio inside single MP4/MKV/WebM files in
// browsers without HTMLMediaElement.audioTracks (Chromium, Firefox).
// Loaded on demand by PlayerController.

import { RemuxUnavailableError, openHttpSource } from "./byteSource.js";
import { fourcc, readU32 } from "./bytes.js";
import { openMatroska } from "./mkvDemuxer.js";
import { openMp4 } from "./mp4Demuxer.js";
import { canTranscodeInThisBrowser, isTranscodeCandidate } from "./audioTranscoder.js";
import { RemuxSession, canRemuxInThisBrowser, isRemuxTrackPlayable } from "./remuxSession.js";

// A source check reads the file's header only: a few small range reads, and
// for an MP4 with its index at the end, that index. Past this it gives up.
export const PLAYABILITY_PROBE_BYTES = 8 * 1024 * 1024;

export { RemuxSession, RemuxUnavailableError, canRemuxInThisBrowser, canTranscodeInThisBrowser, isRemuxTrackPlayable };

export function sniffContainer(head) {
  if (head?.length >= 4 && readU32(head, 0) === 0x1a45dfa3) return "matroska";
  if (head?.length >= 8 && ["ftyp", "moov", "mdat", "free", "wide", "skip"].includes(fourcc(head, 4))) return "mp4";
  return "";
}

/**
 * Opens a demuxer for `source` and describes what the audio picker can offer.
 * Throws RemuxUnavailableError when the file can't be switched here.
 */
export async function describeRemuxSource(source, { canTranscode = canTranscodeInThisBrowser } = {}) {
  const head = await source.read(0, Math.min(source.size, 64));
  const container = sniffContainer(head);
  if (!container) throw new RemuxUnavailableError("container");
  const demuxer = container === "mp4" ? await openMp4(source) : await openMatroska(source);
  if (container === "matroska") {
    if (!demuxer.seekable) throw new RemuxUnavailableError("no-cues");
    await demuxer.resolveFrameDependentTracks();
  }
  const videoTrack = demuxer.tracks.find((track) => track.kind === "video") || null;
  if (videoTrack && !isRemuxTrackPlayable(videoTrack)) {
    throw new RemuxUnavailableError("video-codec", `Video codec ${videoTrack.codec} can't be remuxed here`);
  }
  const audioTracks = demuxer.tracks.filter((track) => track.kind === "audio");
  if (!audioTracks.length) throw new RemuxUnavailableError("single-audio");
  for (const track of audioTracks) {
    // AC-3/E-AC-3 that MSE rejects is converted to Opus instead of copied.
    track.transcode = !isRemuxTrackPlayable(track) && isTranscodeCandidate(track) && (await canTranscode());
  }
  // A file with one track is still worth remuxing when that track needs converting.
  if (audioTracks.length < 2 && !audioTracks[0].transcode) throw new RemuxUnavailableError("single-audio");
  return {
    demuxer,
    container,
    videoTrack,
    // The plain <video src> path plays the file's first audio track.
    nativeIndex: 0,
    // That track is AC-3/E-AC-3 the browser can't decode: the plain file plays
    // silent, so the player converts it from the start.
    nativeNeedsConversion: audioTracks[0].transcode,
    audioTracks: audioTracks.map((track, index) => ({
      index,
      id: String(track.id),
      label: track.name || "",
      language: track.language || "",
      codec: track.codec,
      channels: track.channels || 0,
      playable: track.transcode || isRemuxTrackPlayable(track),
      converted: track.transcode,
      track
    }))
  };
}

export async function probeRemuxableAudio(url, { headers = {}, fetchImpl } = {}) {
  if (!canRemuxInThisBrowser()) throw new RemuxUnavailableError("no-mse");
  const source = await openHttpSource(url, { headers, fetchImpl });
  return describeRemuxSource(source);
}

// Codecs that fragmented MP4 can't carry but a plain <video src> may still
// play (WebM). Asked of the browser directly, never assumed.
const NATIVE_ONLY_CODECS = { v_vp8: "vp8", a_vorbis: "vorbis" };

function nativeCanPlay(track, container) {
  const codec = NATIVE_ONLY_CODECS[String(track?.codec || "").toLowerCase()];
  const video = globalThis.document?.createElement?.("video");
  if (!codec || container !== "webm" || typeof video?.canPlayType !== "function") return false;
  try {
    return video.canPlayType(`video/webm; codecs="${codec}"`) !== "";
  } catch (_) {
    return false;
  }
}

function audioPlayable(track) {
  if (track.unsupportedReason) return false;
  if (track.sampleEntry) return isRemuxTrackPlayable(track);
  // Matroska AC-3/E-AC-3 build their sample entry from the first frame, which a
  // header check doesn't read; the codec string alone answers the question.
  if (!track.needsFrame) return false;
  const MediaSourceCtor = globalThis.ManagedMediaSource || globalThis.MediaSource;
  try {
    return Boolean(MediaSourceCtor?.isTypeSupported?.(`audio/mp4; codecs="${track.codec}"`));
  } catch (_) {
    return false;
  }
}

function budgetedFetch(fetchImpl, signal, budget) {
  let used = 0;
  return (input, init = {}) => {
    const range = /bytes=(\d+)-(\d+)/.exec(String(init.headers?.Range || ""));
    if (range) {
      used += Number(range[2]) - Number(range[1]) + 1;
      if (used > budget) return Promise.reject(new RemuxUnavailableError("probe-budget"));
    }
    if (signal?.aborted) return Promise.reject(new RemuxUnavailableError("aborted"));
    const signals = [init.signal, signal].filter(Boolean);
    const merged =
      signals.length > 1 && typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : signals[0];
    return fetchImpl(input, { ...init, signal: merged });
  };
}

/**
 * Reads a stream's header (CORS range reads, nothing else) and reports what
 * this browser can do with its tracks. Throws RemuxUnavailableError when the
 * file can't be read here; the caller then shows no label.
 */
export async function probeStreamPlayability(
  url,
  {
    fetchImpl = globalThis.fetch,
    signal,
    byteBudget = PLAYABILITY_PROBE_BYTES,
    canTranscode = canTranscodeInThisBrowser,
    openSource = openHttpSource
  } = {}
) {
  if (!canRemuxInThisBrowser()) throw new RemuxUnavailableError("no-mse");
  const source = await openSource(url, { fetchImpl: budgetedFetch(fetchImpl, signal, byteBudget) });
  return inspectSourcePlayability(source, { canTranscode });
}

export async function inspectSourcePlayability(source, { canTranscode = canTranscodeInThisBrowser } = {}) {
  const head = await source.read(0, Math.min(source.size, 64));
  const container = sniffContainer(head);
  if (!container) throw new RemuxUnavailableError("container");
  const demuxer = container === "mp4" ? await openMp4(source) : await openMatroska(source);
  const kind = demuxer.container === "webm" ? "webm" : container;
  const videoTrack = demuxer.tracks.find((track) => track.kind === "video") || null;
  const audioTracks = demuxer.tracks.filter((track) => track.kind === "audio");
  const videoRemuxable = !videoTrack || isRemuxTrackPlayable(videoTrack);
  const convertible = audioTracks.some(isTranscodeCandidate) && (await canTranscode());
  return {
    container: kind,
    video: videoTrack
      ? { codec: videoTrack.codec, playable: videoRemuxable || nativeCanPlay(videoTrack, kind) }
      : null,
    audio: audioTracks.map((track) => {
      const playable = audioPlayable(track) || nativeCanPlay(track, kind);
      return {
        codec: track.codec,
        channels: track.channels || 0,
        language: track.language || "",
        playable,
        convertible: !playable && convertible && isTranscodeCandidate(track)
      };
    }),
    // Switching or converting audio replays the file through MSE: that needs
    // a video track MSE accepts and, for Matroska, a seek index.
    switchable: videoRemuxable && (container === "mp4" || Boolean(demuxer.seekable))
  };
}
