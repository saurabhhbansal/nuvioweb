import test from "node:test";
import assert from "node:assert/strict";

import {
  describeAacConfig,
  readAudioSampleEntries,
  readBoxes,
  summarizeProbe,
} from "./generate-audio-recovery-media.mjs";

function box(type, payload = new Uint8Array()) {
  const size = 8 + payload.length;
  const bytes = new Uint8Array(size);
  bytes[0] = (size >>> 24) & 0xff;
  bytes[1] = (size >>> 16) & 0xff;
  bytes[2] = (size >>> 8) & 0xff;
  bytes[3] = size & 0xff;
  for (let index = 0; index < 4; index += 1)
    bytes[4 + index] = type.charCodeAt(index);
  bytes.set(payload, 8);
  return bytes;
}

function concat(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function uint32(value) {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

// stsd = version/flags(4) + entry_count(4) + one sample entry of size/fourcc + body.
function stsdWith(entryFourcc, entryBody, entryChildren = new Uint8Array()) {
  const entryPayload = concat(
    new Uint8Array(6),
    new Uint8Array([0, 1]),
    entryChildren,
    entryBody,
  );
  const entrySize = 8 + entryPayload.length;
  const entry = concat(
    uint32(entrySize),
    new Uint8Array(
      [...entryFourcc].map((character) => character.charCodeAt(0)),
    ),
    entryPayload,
  );
  return box("stsd", concat(new Uint8Array(4), uint32(1), entry));
}

function mp4WithStsd(stsd) {
  const stbl = box("stbl", stsd);
  const minf = box("minf", stbl);
  const mdia = box("mdia", minf);
  const trak = box("trak", mdia);
  const moov = box("moov", trak);
  const ftyp = box(
    "ftyp",
    new Uint8Array([..."isomiso6"].map((character) => character.charCodeAt(0))),
  );
  return concat(ftyp, moov);
}

// esds payload: version/flags, then DecoderSpecificInfo tag 0x05, length 2,
// AudioSpecificConfig 0x11 0x90 = AAC-LC, 48 kHz, 2 channels.
const aacEsds = box(
  "esds",
  new Uint8Array([0, 0, 0, 0, 0x05, 0x02, 0x11, 0x90]),
);
const aacFile = mp4WithStsd(stsdWith("mp4a", new Uint8Array(), aacEsds));

const opusDops = box("dOps", new Uint8Array([0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
const opusFile = mp4WithStsd(stsdWith("Opus", new Uint8Array(), opusDops));

test("readAudioSampleEntries finds the real audio sample entry, not text in mdat", () => {
  const entries = readAudioSampleEntries(aacFile);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].fourcc, "mp4a");
  assert.equal(entries[0].audio, true);

  // A file whose payload merely mentions "mp4a" must not be read as AAC.
  const mdatOnly = concat(
    box("ftyp", new Uint8Array(8)),
    box("mdat", new Uint8Array([..."mp4a"].map((c) => c.charCodeAt(0)))),
  );
  assert.deepEqual(readAudioSampleEntries(mdatOnly), []);
});

test("describeAacConfig reads the AudioSpecificConfig", () => {
  const entries = readAudioSampleEntries(aacFile);
  assert.deepEqual(describeAacConfig(entries[0].configBytes), {
    audioObjectType: 2,
    samplingFrequency: 48000,
    channelConfiguration: 2,
  });
});

test("readBoxes bounds malformed input instead of throwing", () => {
  const garbage = new Uint8Array([
    0, 0, 0, 0, 0x6d, 0x6f, 0x6f, 0x76, 0xff, 0xff, 0xff, 0xff,
  ]);
  assert.doesNotThrow(() => readBoxes(garbage));
  assert.doesNotThrow(() => readAudioSampleEntries(garbage));
  assert.deepEqual(readAudioSampleEntries(garbage), []);
  // An oversized declared box size is rejected rather than clamped.
  const oversized = new Uint8Array([0, 0, 0, 0xff, 0x6d, 0x6f, 0x6f, 0x76]);
  assert.deepEqual(readBoxes(oversized), []);
});

function reportWith(bytes, overrides = {}) {
  return {
    audioEncoder: { present: false, configs: [] },
    mediaRecorder: {
      types: [],
      recording: {
        requestedMimeType: "audio/mp4",
        actualMimeType: "audio/mp4",
        bytes: bytes.length,
        withinByteLimit: true,
        base64: Buffer.from(bytes).toString("base64"),
      },
      ...overrides,
    },
  };
}

test("summarizeProbe reports supported only with an inspectable AAC configuration", () => {
  const summary = summarizeProbe(reportWith(aacFile));
  assert.equal(summary.status, "supported");
  assert.deepEqual(summary.reasons, []);
  assert.equal(summary.aacConfig.samplingFrequency, 48000);
  assert.deepEqual(summary.sampleEntries, ["mp4a"]);
});

test("summarizeProbe reports blocked with the actual emitted sample entry", () => {
  const summary = summarizeProbe(reportWith(opusFile));
  assert.equal(summary.status, "blocked");
  assert.deepEqual(summary.sampleEntries, ["Opus"]);
  assert.match(summary.reasons.join(" "), /Opus rather than mp4a/);
  assert.match(summary.reasons.join(" "), /AudioEncoder is not exposed/);
});

test("summarizeProbe reports blocked when there is no audio sample entry at all", () => {
  const summary = summarizeProbe(
    reportWith(
      concat(box("ftyp", new Uint8Array(8)), box("mdat", new Uint8Array(4))),
    ),
  );
  assert.equal(summary.status, "blocked");
  assert.deepEqual(summary.sampleEntries, []);
  assert.match(summary.reasons.join(" "), /no recognisable audio sample entry/);
});

test("summarizeProbe tolerates a recording error and missing base64", () => {
  const summary = summarizeProbe({
    audioEncoder: { present: false, configs: [] },
    mediaRecorder: {
      types: [],
      recording: { error: "MediaRecorder unavailable" },
    },
  });
  assert.equal(summary.status, "blocked");
  assert.deepEqual(summary.sampleEntries, []);
  assert.equal(summary.recording, null);
});
