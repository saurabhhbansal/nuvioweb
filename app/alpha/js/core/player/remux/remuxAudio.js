// Entry point for switching audio inside single MP4/MKV/WebM files in
// browsers without HTMLMediaElement.audioTracks (Chromium, Firefox).
// Loaded on demand by PlayerController.

import { RemuxUnavailableError, openHttpSource } from "./byteSource.js";
import { fourcc, readU32 } from "./bytes.js";
import { openMatroska } from "./mkvDemuxer.js";
import { openMp4 } from "./mp4Demuxer.js";
import { RemuxSession, canRemuxInThisBrowser, isRemuxTrackPlayable } from "./remuxSession.js";

export { RemuxSession, RemuxUnavailableError, canRemuxInThisBrowser, isRemuxTrackPlayable };

export function sniffContainer(head) {
  if (head?.length >= 4 && readU32(head, 0) === 0x1a45dfa3) return "matroska";
  if (head?.length >= 8 && ["ftyp", "moov", "mdat", "free", "wide", "skip"].includes(fourcc(head, 4))) return "mp4";
  return "";
}

/**
 * Opens a demuxer for `source` and describes what the audio picker can offer.
 * Throws RemuxUnavailableError when the file can't be switched here.
 */
export async function describeRemuxSource(source) {
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
  if (audioTracks.length < 2) throw new RemuxUnavailableError("single-audio");
  return {
    demuxer,
    container,
    videoTrack,
    // The plain <video src> path plays the file's first audio track.
    nativeIndex: 0,
    audioTracks: audioTracks.map((track, index) => ({
      index,
      id: String(track.id),
      label: track.name || "",
      language: track.language || "",
      codec: track.codec,
      channels: track.channels || 0,
      playable: isRemuxTrackPlayable(track),
      track
    }))
  };
}

export async function probeRemuxableAudio(url, { headers = {}, fetchImpl } = {}) {
  if (!canRemuxInThisBrowser()) throw new RemuxUnavailableError("no-mse");
  const source = await openHttpSource(url, { headers, fetchImpl });
  return describeRemuxSource(source);
}
