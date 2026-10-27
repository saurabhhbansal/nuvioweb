// Turns demuxed samples of one track into fMP4 media segments.
//
// MP4 sources already carry decode times, durations and composition offsets.
// Matroska stores presentation times only, so video decode times are rebuilt
// per GOP: the sorted presentation times become the decode times. B-frames
// then decode before they are shown, and `presentationShift` (applied as the
// SourceBuffer's timestampOffset) keeps every composition offset >= 0.

import { createInitSegment, createMediaSegment } from "./fmp4.js";

const AUDIO_FRAGMENT_SECONDS = 1;
const VIDEO_FRAGMENT_SECONDS = 1;
const MAX_GOP_FRAMES = 600;

export function trackMimeType(track) {
  return `${track.kind === "video" ? "video" : "audio"}/mp4; codecs="${track.codec}"`;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

export function createTrackWriter(track, { container }) {
  const fromMatroska = container !== "mp4";
  const audioRate = Math.round(track.kind === "audio" && track.codec === "opus" ? 48000 : track.sampleRate || 48000);
  const timescale = fromMatroska && track.kind === "audio" ? audioRate : track.timescale;
  const init = createInitSegment({
    kind: track.kind,
    timescale,
    sampleEntry: track.sampleEntry,
    width: track.width,
    height: track.height,
    language: /^[a-z]{3}$/.test(track.language || "") ? track.language : "und"
  });

  let sequence = 1;
  let ready = [];
  let readyDuration = 0;
  let skipThroughDts = null;
  // Matroska video: frames of the GOP being collected.
  let gop = [];
  let shiftUnits = fromMatroska ? null : track.kind === "video" ? track.editShift || 0 : 0;
  // Matroska audio: one sample held back until the next one gives its duration.
  let heldAudio = null;
  let lastAudioDuration = 0;
  const recentDurations = [];

  const toAudioUnits = (pts) => Math.round((pts / track.timescale) * audioRate);

  const emit = (force = false) => {
    const segments = [];
    const limit = (track.kind === "video" ? VIDEO_FRAGMENT_SECONDS : AUDIO_FRAGMENT_SECONDS) * timescale;
    if (!ready.length || (!force && readyDuration < limit)) return segments;
    const samples = ready.filter((sample) => skipThroughDts === null || sample.dts > skipThroughDts);
    ready = [];
    readyDuration = 0;
    if (!samples.length) return segments;
    segments.push({
      bytes: createMediaSegment({ sequenceNumber: sequence++, baseMediaDecodeTime: samples[0].dts, samples }),
      firstDts: samples[0].dts,
      lastDts: samples[samples.length - 1].dts,
      timescale
    });
    return segments;
  };

  const queue = (sample) => {
    ready.push(sample);
    readyDuration += sample.duration;
  };

  const finishGop = (nextKeyPts = null) => {
    if (!gop.length) return;
    const sortedPts = gop.map((frame) => frame.pts).sort((a, b) => a - b);
    const deltas = [];
    for (let index = 1; index < sortedPts.length; index += 1) deltas.push(sortedPts[index] - sortedPts[index - 1]);
    let need = 0;
    gop.forEach((frame, index) => {
      need = Math.max(need, sortedPts[index] - frame.pts);
    });
    if (shiftUnits === null) shiftUnits = need;
    const fallback = median(deltas) || median(recentDurations) || Math.round((track.frameSeconds || 0.04) * track.timescale) || 1;
    gop.forEach((frame, index) => {
      const dts = sortedPts[index];
      const nextDts = index + 1 < sortedPts.length ? sortedPts[index + 1] : nextKeyPts;
      const duration = nextDts !== null && nextDts > dts ? nextDts - dts : fallback;
      recentDurations.push(duration);
      if (recentDurations.length > 32) recentDurations.shift();
      queue({
        data: frame.data,
        dts,
        duration,
        compositionOffset: Math.max(0, frame.pts - dts + shiftUnits),
        sync: frame.sync
      });
    });
    gop = [];
  };

  return {
    mime: trackMimeType(track),
    init,
    timescale,
    track,
    /** Seconds to subtract from presentation (SourceBuffer.timestampOffset = -shift). */
    get presentationShift() {
      return (shiftUnits || 0) / timescale;
    },
    get shiftKnown() {
      return shiftUnits !== null;
    },
    reset({ skipThroughDts: skip = null } = {}) {
      ready = [];
      readyDuration = 0;
      gop = [];
      heldAudio = null;
      skipThroughDts = skip;
    },
    push(samples) {
      const segments = [];
      for (const sample of samples) {
        if (!fromMatroska) {
          // Video fragments start at keyframes.
          if (track.kind === "video" && sample.sync) segments.push(...emit());
          queue(sample);
          if (track.kind !== "video") segments.push(...emit());
          continue;
        }
        if (track.kind === "video") {
          if (sample.sync && gop.length) {
            finishGop(sample.pts);
            segments.push(...emit());
          }
          gop.push(sample);
          if (gop.length >= MAX_GOP_FRAMES) finishGop(null);
          continue;
        }
        const dts = toAudioUnits(sample.pts);
        if (heldAudio) {
          const duration = dts > heldAudio.dts ? dts - heldAudio.dts : lastAudioDuration || Math.round((track.frameSeconds || 0.02) * audioRate);
          lastAudioDuration = duration;
          queue({ ...heldAudio, duration });
          segments.push(...emit());
        }
        heldAudio = { data: sample.data, dts: Math.max(dts, heldAudio ? heldAudio.dts + 1 : dts), sync: true, compositionOffset: 0 };
      }
      return segments;
    },
    flush() {
      if (gop.length) finishGop(null);
      if (heldAudio) {
        queue({ ...heldAudio, duration: lastAudioDuration || Math.round((track.frameSeconds || 0.02) * audioRate) });
        heldAudio = null;
      }
      return emit(true);
    }
  };
}
