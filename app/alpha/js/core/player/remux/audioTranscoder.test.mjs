import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { decoder as createDecoder } from "@audio/decode-eac3";

import {
  canTranscodeInThisBrowser,
  channelRoles,
  createTranscodingWriter,
  downmixToStereo,
  independentFrames,
  isTranscodeCandidate,
  resampleTo48k
} from "./audioTranscoder.js";
import { createMemorySource } from "./byteSource.js";
import { fourcc, readU32 } from "./bytes.js";
import { openMatroska } from "./mkvDemuxer.js";
import { openMp4 } from "./mp4Demuxer.js";
import { describeRemuxSource } from "./remuxAudio.js";

// Original CC0 fixtures, see tests/fixtures/media/multi-audio/README.md.
const fixture = (name) =>
  readFileSync(
    new URL(`../../../../../../tests/fixtures/media/multi-audio/${name}`, import.meta.url)
  );

async function trackSamples(demuxer, track) {
  const out = [];
  for await (const batch of demuxer.createReader({ trackIds: [track.id], startTime: 0 })) {
    for (const { samples } of batch) out.push(...samples);
  }
  return out;
}

async function openTrack(name, codec) {
  const bytes = fixture(name);
  const demuxer = name.endsWith(".mp4")
    ? await openMp4(createMemorySource(bytes))
    : await openMatroska(createMemorySource(bytes));
  if (demuxer.resolveFrameDependentTracks) await demuxer.resolveFrameDependentTracks();
  const track = demuxer.tracks.find((entry) => entry.kind === "audio" && entry.codec === codec);
  return { demuxer, track, samples: await trackSamples(demuxer, track) };
}

/** Signal power at `hz` (Goertzel), for telling the test tones apart. */
function power(signal, hz, rate = 48000) {
  const coefficient = 2 * Math.cos((2 * Math.PI * hz) / rate);
  let previous = 0;
  let beforePrevious = 0;
  for (const value of signal) {
    const current = value + coefficient * previous - beforePrevious;
    beforePrevious = previous;
    previous = current;
  }
  return (
    (previous * previous +
      beforePrevious * beforePrevious -
      coefficient * previous * beforePrevious) /
    signal.length
  );
}

function rms(signal) {
  let sum = 0;
  for (const value of signal) sum += value * value;
  return Math.sqrt(sum / (signal.length || 1));
}

function eac3Frame({ strmtyp = 0, substreamId = 0, words = 8 } = {}) {
  const frame = new Uint8Array(words * 2);
  frame[0] = 0x0b;
  frame[1] = 0x77;
  frame[2] = (strmtyp << 6) | (substreamId << 3) | (((words - 1) >> 8) & 7);
  frame[3] = (words - 1) & 0xff;
  frame[5] = 16 << 3; // bsid 16: E-AC-3
  return frame;
}

test("only AC-3/E-AC-3 tracks that can be read are conversion candidates", () => {
  assert.equal(isTranscodeCandidate({ kind: "audio", codec: "ac-3" }), true);
  assert.equal(
    isTranscodeCandidate({ kind: "audio", codec: "ec-3", unsupportedReason: "codec-header" }),
    true
  );
  assert.equal(
    isTranscodeCandidate({ kind: "audio", codec: "ec-3", unsupportedReason: "encrypted" }),
    false
  );
  assert.equal(isTranscodeCandidate({ kind: "audio", codec: "dtsc" }), false);
  assert.equal(isTranscodeCandidate({ kind: "video", codec: "ac-3" }), false);
});

test("E-AC-3 access units keep only independent substream 0", () => {
  const independent = eac3Frame({ strmtyp: 0 });
  const dependent = eac3Frame({ strmtyp: 1, words: 12 });
  const otherProgram = eac3Frame({ strmtyp: 0, substreamId: 1 });
  const unit = new Uint8Array([...independent, ...dependent, ...otherProgram]);
  assert.deepEqual(Array.from(independentFrames(unit)), Array.from(independent));
  // Garbage or a truncated unit is passed on as it is.
  const truncated = unit.subarray(0, unit.length - 3);
  assert.equal(independentFrames(truncated), truncated);
  const ac3 = Uint8Array.from([0x0b, 0x77, 0, 0, 0, 8 << 3, 0, 0]);
  assert.equal(independentFrames(ac3), ac3);
});

test("channel roles follow the frame's coding mode", async () => {
  const stereo = await openTrack("multi-audio.mkv", "ac-3");
  assert.deepEqual(channelRoles(stereo.samples[0].data), ["L", "R"]);
  const surround = await openTrack("eac3-surround.mkv", "ec-3");
  assert.deepEqual(channelRoles(surround.samples[0].data), ["L", "R", "C", "LFE", "SL", "SR"]);
  assert.equal(channelRoles(new Uint8Array(8)), null);
});

test("downmix follows the Web Audio speaker rules and never clips", () => {
  const one = (value) => Float32Array.of(value);
  const [left, right] = downmixToStereo(
    [one(0.2), one(0.1), one(0.5), one(1), one(0.3), one(0.4)],
    ["L", "R", "C", "LFE", "SL", "SR"]
  );
  assert.ok(Math.abs(left[0] - (0.2 + Math.SQRT1_2 * (0.5 + 0.3))) < 1e-6);
  assert.ok(Math.abs(right[0] - (0.1 + Math.SQRT1_2 * (0.5 + 0.4))) < 1e-6);
  const [mono] = downmixToStereo([one(0.25)], ["C"]);
  assert.equal(mono[0], 0.25);
  const [loud] = downmixToStereo([one(1), one(1), one(1), one(0), one(1), one(1)]);
  assert.equal(loud[0], 1);
  // Roles that don't match the decoded count fall back to a guess by count.
  const [guessed] = downmixToStereo([one(0), one(0), one(0.5)], ["L", "R"]);
  assert.ok(Math.abs(guessed[0] - 0.5 * Math.SQRT1_2) < 1e-6);
});

test("resampling to 48 kHz keeps duration and leaves 48 kHz alone", () => {
  const input = new Float32Array(441).fill(0.5);
  assert.equal(resampleTo48k(input, 44100).length, 480);
  assert.ok(resampleTo48k(input, 44100).every((value) => Math.abs(value - 0.5) < 1e-6));
  assert.equal(resampleTo48k(input, 48000), input);
});

test("the bundled decoder turns the fixtures' AC-3 and 5.1 E-AC-3 into the right tones", async () => {
  // One decoder per stream: a decoder carries each frame's tail into the next.
  const decoder = await createDecoder();
  const surroundDecoder = await createDecoder();
  try {
    const stereo = await openTrack("multi-audio.mkv", "ac-3");
    const decoded = decoder.decode(stereo.samples[10].data);
    assert.equal(decoded.sampleRate, 48000);
    assert.equal(decoded.channelData.length, 2);
    assert.ok(power(decoded.channelData[0], 660) > 100 * power(decoded.channelData[0], 440));

    const surround = await openTrack("eac3-surround.mkv", "ec-3");
    const frame = independentFrames(surround.samples[10].data);
    const channels = surroundDecoder.decode(frame).channelData;
    assert.equal(channels.length, 6);
    assert.ok(rms(channels[2]) > 0.2, "centre carries the tone");
    assert.ok(
      rms(channels[0]) < 0.01 && rms(channels[4]) < 0.01,
      "front left and surrounds are silent"
    );
    const [left, right] = downmixToStereo(channels, channelRoles(frame));
    for (const side of [left, right]) {
      assert.ok(Math.abs(rms(side) - rms(channels[2]) * Math.SQRT1_2) < 0.02);
      assert.ok(power(side, 550) > 100 * power(side, 440));
    }
  } finally {
    decoder.free();
    surroundDecoder.free();
  }
});

// Stand-ins for WebCodecs, which Node lacks: the encoder cuts its input into
// 20 ms packets and reports them asynchronously, as browsers do.
class FakeAudioData {
  constructor(init) {
    Object.assign(this, init);
    this.closed = false;
  }

  close() {
    this.closed = true;
  }
}

function fakeEncoderClass(log) {
  return class FakeEncoder extends EventTarget {
    constructor({ output, error }) {
      super();
      this.output = output;
      this.error = error;
      this.pending = 0;
      this.frames = 0;
      this.firstTimestamp = null;
      this.state = "unconfigured";
      log.encoders.push(this);
    }

    get encodeQueueSize() {
      return this.pending;
    }

    configure(config) {
      log.configs.push(config);
      this.state = "configured";
    }

    encode(data) {
      if (this.state !== "configured") throw new Error("not configured");
      log.inputs.push({
        format: data.format,
        sampleRate: data.sampleRate,
        channels: data.numberOfChannels,
        frames: data.numberOfFrames,
        timestamp: data.timestamp
      });
      this.pending += 1;
      setTimeout(() => {
        if (this.state !== "configured") return;
        if (this.firstTimestamp === null) this.firstTimestamp = data.timestamp;
        this.frames += data.numberOfFrames;
        this.drain(false);
        this.pending -= 1;
        this.dispatchEvent(new Event("dequeue"));
      }, 0);
    }

    drain(all) {
      this.sent ||= 0;
      while (this.frames - this.sent >= 960 || (all && this.frames > this.sent)) {
        const timestamp = this.firstTimestamp + Math.round((this.sent * 1e6) / 48000);
        this.sent += 960;
        const bytes = Uint8Array.of(0xfc, this.sent & 0xff);
        this.output({
          byteLength: bytes.length,
          timestamp,
          duration: 20000,
          copyTo: (target) => target.set(bytes)
        });
      }
    }

    async flush() {
      await new Promise((resolve) => setTimeout(resolve, 5));
      this.drain(true);
    }

    close() {
      this.state = "closed";
    }
  };
}

function segmentTimes(segment) {
  // moof > traf > tfdt carries the base decode time (version 1, 64-bit).
  const bytes = segment.bytes;
  let cursor = 8;
  while (cursor < bytes.length) {
    const size = readU32(bytes, cursor);
    if (fourcc(bytes, cursor + 4) === "tfdt") return readU32(bytes, cursor + 16);
    cursor += ["moof", "traf"].includes(fourcc(bytes, cursor + 4)) ? 8 : size;
  }
  return null;
}

test("the converting writer feeds stereo 48 kHz PCM to an Opus encoder and writes fMP4", async () => {
  const log = { encoders: [], configs: [], inputs: [] };
  const { demuxer, track, samples } = await openTrack("multi-audio.mp4", "ac-3");
  const writer = await createTranscodingWriter(track, demuxer, {
    AudioEncoderCtor: fakeEncoderClass(log),
    AudioDataCtor: FakeAudioData
  });
  assert.equal(writer.mime, 'audio/mp4; codecs="opus"');
  assert.equal(writer.transcoding, true);
  const initText = Buffer.from(writer.init).toString("latin1");
  assert.ok(initText.includes("Opus") && initText.includes("dOps"));
  assert.deepEqual(log.configs[0], {
    codec: "opus",
    sampleRate: 48000,
    numberOfChannels: 2,
    bitrate: 160000
  });

  const segments = [];
  for (let index = 0; index < samples.length; index += 20) {
    segments.push(...(await writer.push(samples.slice(index, index + 20))));
  }
  segments.push(...(await writer.flush()));
  assert.ok(
    log.inputs.every(
      (input) => input.format === "f32-planar" && input.sampleRate === 48000 && input.channels === 2
    )
  );
  for (let index = 1; index < log.inputs.length; index += 1) {
    const previous = log.inputs[index - 1];
    assert.equal(
      log.inputs[index].timestamp,
      previous.timestamp + Math.round((previous.frames * 1e6) / 48000)
    );
  }
  const totalFrames = log.inputs.reduce((sum, input) => sum + input.frames, 0);
  assert.ok(
    Math.abs(totalFrames / 48000 - 6) < 0.1,
    `about 6 s of audio, got ${totalFrames / 48000}`
  );
  assert.ok(segments.length >= 5);
  const starts = segments.map(segmentTimes);
  for (let index = 1; index < starts.length; index += 1)
    assert.ok(starts[index] > starts[index - 1]);
  writer.close();
  assert.equal(log.encoders.at(-1).state, "closed");
});

test("reset drops output for the old position and restarts at the next sample", async () => {
  const log = { encoders: [], configs: [], inputs: [] };
  const { demuxer, track, samples } = await openTrack("eac3-surround.mkv", "ec-3");
  const writer = await createTranscodingWriter(track, demuxer, {
    AudioEncoderCtor: fakeEncoderClass(log),
    AudioDataCtor: FakeAudioData
  });
  const first = writer.push(samples.slice(0, 40));
  writer.reset();
  assert.deepEqual(await first, [], "a push from before the reset returns nothing");
  assert.equal(log.encoders.length, 2);
  assert.equal(log.encoders[0].state, "closed");
  const later = samples.filter((sample) => sample.pts / track.timescale >= 3);
  const segments = [...(await writer.push(later)), ...(await writer.flush())];
  const resumed = log.inputs.find((input, index) => index > 0 && input.timestamp >= 2.9e6);
  assert.ok(resumed, "encoding restarted near 3 s");
  assert.ok(segments.length && segmentTimes(segments[0]) >= Math.round(2.9 * 48000));
  writer.close();
});

test("conversion is offered only with Opus encoding and Opus in MSE", async () => {
  const supported = {
    AudioData: FakeAudioData,
    AudioEncoder: { isConfigSupported: async (config) => ({ supported: config.codec === "opus" }) },
    MediaSource: { isTypeSupported: (mime) => mime.includes("opus") }
  };
  assert.equal(await canTranscodeInThisBrowser(supported), true);
  assert.equal(await canTranscodeInThisBrowser({ ...supported, AudioEncoder: undefined }), false);
  assert.equal(
    await canTranscodeInThisBrowser({
      ...supported,
      MediaSource: { isTypeSupported: () => false }
    }),
    false
  );
  assert.equal(
    await canTranscodeInThisBrowser({
      ...supported,
      AudioEncoder: { isConfigSupported: async () => ({ supported: false }) }
    }),
    false
  );
});

test("describeRemuxSource marks AC-3/E-AC-3 as converted when MSE rejects them", async (t) => {
  globalThis.MediaSource = { isTypeSupported: (mime) => !/ac-3|ec-3/.test(mime) };
  t.after(() => delete globalThis.MediaSource);
  const converting = await describeRemuxSource(createMemorySource(fixture("multi-audio.mkv")), {
    canTranscode: async () => true
  });
  assert.deepEqual(
    converting.audioTracks.map((track) => [track.playable, track.converted]),
    [
      [true, false],
      [true, false],
      [true, true]
    ]
  );
  assert.equal(converting.audioTracks[2].track.transcode, true);
  const surround = await describeRemuxSource(createMemorySource(fixture("eac3-surround.mkv")), {
    canTranscode: async () => true
  });
  assert.deepEqual(
    surround.audioTracks.map((track) => track.codec),
    ["mp4a.40.2", "ec-3"]
  );
  assert.equal(surround.audioTracks[1].converted, true);
  const plain = await describeRemuxSource(createMemorySource(fixture("multi-audio.mkv")), {
    canTranscode: async () => false
  });
  assert.deepEqual(
    plain.audioTracks.map((track) => track.playable),
    [true, true, false]
  );
});

test("describeRemuxSource converts an AC-3 first track, even when it's the only one", async (t) => {
  globalThis.MediaSource = { isTypeSupported: (mime) => !/ac-3|ec-3/.test(mime) };
  t.after(() => delete globalThis.MediaSource);
  const first = await describeRemuxSource(createMemorySource(fixture("ac3-first.mp4")), {
    canTranscode: async () => true
  });
  assert.equal(first.nativeNeedsConversion, true);
  assert.deepEqual(
    first.audioTracks.map((track) => [track.codec, track.converted]),
    [
      ["ac-3", true],
      ["mp4a.40.2", false]
    ]
  );
  const only = await describeRemuxSource(createMemorySource(fixture("ac3-only.mkv")), {
    canTranscode: async () => true
  });
  assert.equal(only.nativeNeedsConversion, true);
  assert.equal(only.audioTracks.length, 1);
  const multi = await describeRemuxSource(createMemorySource(fixture("multi-audio.mkv")), {
    canTranscode: async () => true
  });
  assert.equal(multi.nativeNeedsConversion, false);
  // Without conversion a single track has nothing to offer.
  await assert.rejects(
    describeRemuxSource(createMemorySource(fixture("ac3-only.mkv")), { canTranscode: async () => false }),
    (error) => error.reason === "single-audio"
  );
  const unconverted = await describeRemuxSource(createMemorySource(fixture("ac3-first.mp4")), {
    canTranscode: async () => false
  });
  assert.equal(unconverted.nativeNeedsConversion, false);
});
