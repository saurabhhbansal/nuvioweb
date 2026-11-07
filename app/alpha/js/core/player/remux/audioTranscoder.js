// Plays AC-3 and E-AC-3 audio tracks in browsers whose Media Source Extensions
// reject them (Chromium and Firefox, usually). Each frame is decoded with
// FFmpeg's AC-3/E-AC-3 decoder (WASM, loaded on demand), mixed down to stereo
// and encoded to Opus with WebCodecs' AudioEncoder. The Opus packets become
// fMP4 segments for the audio SourceBuffer, with the same interface as
// trackWriter.js except that push() and flush() return promises.
//
// Only audio is converted; video is still copied untouched.

import { dOpsFromOpusHead, parseAc3Frame, parseEac3Frame } from "./codecs.js";
import { audioSampleEntry, createInitSegment, createMediaSegment } from "./fmp4.js";

export const TRANSCODE_SAMPLE_RATE = 48000;
const OPUS_CONFIG = Object.freeze({
  codec: "opus",
  sampleRate: TRANSCODE_SAMPLE_RATE,
  numberOfChannels: 2,
  bitrate: 160000
});
const OUTPUT_MIME = 'audio/mp4; codecs="opus"';
const FRAGMENT_UNITS = TRANSCODE_SAMPLE_RATE; // about 1 s of audio per segment
const OPUS_FRAME_UNITS = 960; // 20 ms
const SOURCE_CODECS = new Set(["ac-3", "ec-3"]);
// Tracks the demuxers flag for these reasons can't be read at all.
const BLOCKING_REASONS = new Set(["encrypted", "compressed", "no-samples"]);
const CENTER = Math.SQRT1_2;

/** True when `track` is an AC-3/E-AC-3 audio track this module could convert. */
export function isTranscodeCandidate(track) {
  return Boolean(
    track &&
    track.kind === "audio" &&
    SOURCE_CODECS.has(track.codec) &&
    !BLOCKING_REASONS.has(track.unsupportedReason)
  );
}

let supportPromise = null;

/**
 * Resolves true when this browser can encode stereo Opus with WebCodecs and
 * play Opus in fMP4 through Media Source Extensions.
 */
export function canTranscodeInThisBrowser(env = globalThis) {
  const probe = async () => {
    const Encoder = env.AudioEncoder;
    if (typeof Encoder?.isConfigSupported !== "function" || typeof env.AudioData !== "function")
      return false;
    const MediaSourceCtor = env.ManagedMediaSource || env.MediaSource;
    if (
      typeof MediaSourceCtor?.isTypeSupported !== "function" ||
      !MediaSourceCtor.isTypeSupported(OUTPUT_MIME)
    )
      return false;
    const result = await Encoder.isConfigSupported({ ...OPUS_CONFIG });
    return Boolean(result?.supported);
  };
  if (env !== globalThis) return probe().catch(() => false);
  supportPromise ||= probe().catch(() => false);
  return supportPromise;
}

/**
 * Keeps the frames of independent substream 0 from an E-AC-3 access unit.
 * Dependent substreams only add channels (7.1) and other independent
 * substreams are separate programs; the stereo mix needs neither.
 * Plain AC-3 frames pass through untouched.
 */
export function independentFrames(data) {
  if (!data || data.length < 6 || data[0] !== 0x0b || data[1] !== 0x77) return data;
  if (data[5] >> 3 <= 10) return data; // bsid <= 10: classic AC-3
  const keep = [];
  let kept = 0;
  let position = 0;
  while (position + 4 <= data.length) {
    if (data[position] !== 0x0b || data[position + 1] !== 0x77) break;
    const strmtyp = data[position + 2] >> 6;
    const substreamId = (data[position + 2] >> 3) & 7;
    const size = ((((data[position + 2] & 7) << 8) | data[position + 3]) + 1) * 2;
    if (position + size > data.length) break;
    if (strmtyp !== 1 && substreamId === 0) {
      keep.push(data.subarray(position, position + size));
      kept += size;
    }
    position += size;
  }
  if (!keep.length || position < data.length) return data;
  if (keep.length === 1) return keep[0];
  const out = new Uint8Array(kept);
  let offset = 0;
  for (const part of keep) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// Channel order out of FFmpeg's decoder for each AC-3 audio coding mode:
// ascending AV_CH_* bits, with the LFE (bit 3) after the front channels.
const ACMOD_FRONT = [
  ["L", "R"], // 1+1 dual mono, decoded as a pair
  ["C"],
  ["L", "R"],
  ["L", "R", "C"],
  ["L", "R"],
  ["L", "R", "C"],
  ["L", "R"],
  ["L", "R", "C"]
];
const ACMOD_SURROUND = [[], [], [], [], ["S"], ["S"], ["SL", "SR"], ["SL", "SR"]];

/** Channel roles of a frame's decoded output, from its header. */
export function channelRoles(frame) {
  const info = parseAc3Frame(frame) || parseEac3Frame(frame);
  if (!info) return null;
  return [
    ...ACMOD_FRONT[info.acmod],
    ...(info.lfeon ? ["LFE"] : []),
    ...ACMOD_SURROUND[info.acmod]
  ];
}

function rolesForCount(count) {
  return (
    {
      1: ["C"],
      2: ["L", "R"],
      3: ["L", "R", "C"],
      4: ["L", "R", "SL", "SR"],
      5: ["L", "R", "C", "SL", "SR"],
      6: ["L", "R", "C", "LFE", "SL", "SR"]
    }[count] || ["L", "R", "C", "LFE", "SL", "SR"]
  );
}

// [left gain, right gain] per role, as in the Web Audio speaker downmix to
// stereo: centre and surrounds at -3 dB, LFE dropped.
const GAINS = {
  L: [1, 0],
  R: [0, 1],
  C: [CENTER, CENTER],
  S: [0.5, 0.5],
  SL: [CENTER, 0],
  SR: [0, CENTER],
  LFE: [0, 0]
};

/**
 * Mixes decoded channels down to stereo.
 * @param {Float32Array[]} channelData
 * @param {string[]|null} roles From channelRoles(); guessed from the count when missing or mismatched.
 * @returns {[Float32Array, Float32Array]}
 */
export function downmixToStereo(channelData, roles = null) {
  const count = channelData.length;
  const frames = channelData[0]?.length || 0;
  if (count === 2) return [channelData[0], channelData[1]];
  if (count === 1 || (roles?.length === 1 && roles[0] === "C"))
    return [channelData[0], channelData[0]];
  const use = roles?.length === count ? roles : rolesForCount(count);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let channel = 0; channel < count; channel += 1) {
    const [gainLeft, gainRight] = GAINS[use[channel]] || [0, 0];
    const input = channelData[channel];
    if (gainLeft)
      for (let index = 0; index < frames; index += 1) left[index] += input[index] * gainLeft;
    if (gainRight)
      for (let index = 0; index < frames; index += 1) right[index] += input[index] * gainRight;
  }
  for (let index = 0; index < frames; index += 1) {
    left[index] = Math.max(-1, Math.min(1, left[index]));
    right[index] = Math.max(-1, Math.min(1, right[index]));
  }
  return [left, right];
}

/** Linear resampling to 48 kHz for the rare 44.1/32 kHz streams. */
export function resampleTo48k(channel, sampleRate) {
  if (!sampleRate || sampleRate === TRANSCODE_SAMPLE_RATE) return channel;
  const length = Math.round((channel.length * TRANSCODE_SAMPLE_RATE) / sampleRate);
  const out = new Float32Array(length);
  const step = sampleRate / TRANSCODE_SAMPLE_RATE;
  for (let index = 0; index < length; index += 1) {
    const position = index * step;
    const base = Math.floor(position);
    const next = Math.min(base + 1, channel.length - 1);
    const fraction = position - base;
    out[index] = channel[base] * (1 - fraction) + channel[next] * fraction;
  }
  return out;
}

/** Presentation time of a demuxed sample, in seconds. */
function sampleSeconds(sample, track, fromMatroska) {
  const units = fromMatroska ? sample.pts : sample.dts + (sample.compositionOffset || 0);
  return Number(units || 0) / (track.timescale || 1);
}

function defaultLoadDecoder() {
  return import("@audio/decode-eac3");
}

function nextDequeue(encoder) {
  return new Promise((resolve) => {
    let timer = null;
    const done = () => {
      clearTimeout(timer);
      encoder.removeEventListener?.("dequeue", done);
      resolve();
    };
    encoder.addEventListener?.("dequeue", done);
    // Older engines have no dequeue event.
    timer = setTimeout(done, 20);
  });
}

/**
 * @param {object} track Demuxed AC-3/E-AC-3 track.
 * @param {{ container: string }} demuxer
 * @param {object} [options] Test seams.
 */
export async function createTranscodingWriter(
  track,
  { container },
  {
    loadDecoder = defaultLoadDecoder,
    AudioEncoderCtor = globalThis.AudioEncoder,
    AudioDataCtor = globalThis.AudioData
  } = {}
) {
  if (typeof AudioEncoderCtor !== "function" || typeof AudioDataCtor !== "function") {
    throw new Error("WebCodecs audio encoding unavailable");
  }
  const fromMatroska = container !== "mp4";
  const decoderModule = await loadDecoder();
  let decoder = await decoderModule.decoder();
  let freshDecoderNeeded = false;
  let failure = null;
  let epoch = 0;
  let ready = [];
  let readyDuration = 0;
  let sequence = 1;
  let anchorMicros = null;
  let sentFrames = 0;
  let lastEnd = 0;
  let closed = false;

  const handleChunk = (chunkEpoch) => (chunk) => {
    if (chunkEpoch !== epoch || closed) return;
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    let dts = Math.round((chunk.timestamp * TRANSCODE_SAMPLE_RATE) / 1e6);
    const duration =
      Math.max(1, Math.round(((chunk.duration || 20000) * TRANSCODE_SAMPLE_RATE) / 1e6)) ||
      OPUS_FRAME_UNITS;
    // Keep decode times strictly increasing and close small rounding gaps.
    if (ready.length || lastEnd) {
      if (dts < lastEnd || dts - lastEnd <= 2) dts = lastEnd;
    }
    if (dts < 0) return;
    lastEnd = dts + duration;
    ready.push({ data, dts, duration, compositionOffset: 0, sync: true });
    readyDuration += duration;
  };

  let encoder = null;
  const openEncoder = () => {
    const chunkEpoch = epoch;
    encoder = new AudioEncoderCtor({
      output: handleChunk(chunkEpoch),
      error: (error) => {
        if (chunkEpoch === epoch) failure = error || new Error("Audio encoder failed");
      }
    });
    encoder.configure({ ...OPUS_CONFIG });
  };
  openEncoder();

  const emit = (force = false) => {
    if (!ready.length || (!force && readyDuration < FRAGMENT_UNITS)) return [];
    const samples = ready;
    ready = [];
    readyDuration = 0;
    return [
      {
        bytes: createMediaSegment({
          sequenceNumber: sequence++,
          baseMediaDecodeTime: samples[0].dts,
          samples
        }),
        firstDts: samples[0].dts,
        lastDts: samples[samples.length - 1].dts,
        timescale: TRANSCODE_SAMPLE_RATE
      }
    ];
  };

  const encodeSample = (sample) => {
    const frames = track.codec === "ec-3" ? independentFrames(sample.data) : sample.data;
    const decoded = decoder.decode(frames);
    if (!decoded.channelData.length || !decoded.channelData[0].length) return;
    const time = sampleSeconds(sample, track, fromMatroska);
    if (anchorMicros === null) {
      anchorMicros = Math.max(0, Math.round(time * 1e6));
      sentFrames = 0;
    }
    const [left, right] = downmixToStereo(decoded.channelData, channelRoles(frames)).map(
      (channel) => resampleTo48k(channel, decoded.sampleRate)
    );
    const numberOfFrames = left.length;
    const planar = new Float32Array(numberOfFrames * 2);
    planar.set(left, 0);
    planar.set(right, numberOfFrames);
    const audioData = new AudioDataCtor({
      format: "f32-planar",
      sampleRate: TRANSCODE_SAMPLE_RATE,
      numberOfFrames,
      numberOfChannels: 2,
      timestamp: anchorMicros + Math.round((sentFrames * 1e6) / TRANSCODE_SAMPLE_RATE),
      data: planar
    });
    sentFrames += numberOfFrames;
    try {
      encoder.encode(audioData);
    } finally {
      audioData.close?.();
    }
  };

  const freshDecoder = async (myEpoch) => {
    if (!freshDecoderNeeded) return true;
    freshDecoderNeeded = false;
    const next = await decoderModule.decoder();
    if (myEpoch !== epoch || closed) {
      next.free();
      return false;
    }
    decoder.free();
    decoder = next;
    return true;
  };

  const sampleEntry = audioSampleEntry("Opus", 2, TRANSCODE_SAMPLE_RATE, dOpsFromOpusHead(null, 2));
  return {
    mime: OUTPUT_MIME,
    init: createInitSegment({
      kind: "audio",
      timescale: TRANSCODE_SAMPLE_RATE,
      sampleEntry,
      language: /^[a-z]{3}$/.test(track.language || "") ? track.language : "und"
    }),
    timescale: TRANSCODE_SAMPLE_RATE,
    track,
    transcoding: true,
    presentationShift: 0,
    shiftKnown: true,
    get stats() {
      return { sentFrames, errors: decoder?.errors || 0 };
    },
    reset() {
      // Called when playback restarts elsewhere (seek, start). Outputs still
      // queued for the old position are dropped with the encoder's state.
      epoch += 1;
      ready = [];
      readyDuration = 0;
      anchorMicros = null;
      sentFrames = 0;
      lastEnd = 0;
      failure = null;
      freshDecoderNeeded = true;
      if (closed) return;
      try {
        encoder.close();
      } catch (_) {
        // Already closed after an error.
      }
      openEncoder();
    },
    async push(samples) {
      const myEpoch = epoch;
      if (!(await freshDecoder(myEpoch))) return [];
      if (myEpoch !== epoch || closed) return [];
      for (const sample of samples) encodeSample(sample);
      while (encoder.encodeQueueSize > 0 && myEpoch === epoch && !failure && !closed) {
        await nextDequeue(encoder);
      }
      if (myEpoch !== epoch || closed) return [];
      if (failure) throw failure;
      return emit();
    },
    async flush() {
      const myEpoch = epoch;
      if (closed) return [];
      await encoder.flush();
      if (myEpoch !== epoch || closed) return [];
      if (failure) throw failure;
      return emit(true);
    },
    close() {
      if (closed) return;
      closed = true;
      epoch += 1;
      try {
        encoder.close();
      } catch (_) {
        // Already closed.
      }
      decoder.free();
    }
  };
}
