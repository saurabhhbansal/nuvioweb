import test from "node:test";
import assert from "node:assert/strict";

import {
  describeAacConfig,
  readAudioSampleEntries,
  readBoxes,
  readEsdsDecoderConfig,
  summarizeProbe,
} from "./generate-audio-recovery-media.mjs";

function u32(value) {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function ascii(value) {
  return new Uint8Array([...value].map((character) => character.charCodeAt(0)));
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function zeros(count) {
  return new Uint8Array(count);
}

function box(type, payload = new Uint8Array()) {
  return concat(u32(8 + payload.length), ascii(type), payload);
}

// A realistic version-0 audio sample entry header: 6 reserved + 2 data_ref,
// 8 reserved, 2 channels, 2 sample_size, 2 pre_defined, 2 reserved, 4 rate
// (16.16), then child boxes. This is the layout the parser must handle.
function audioSampleEntry(
  fourcc,
  { channels = 2, sampleRate = 48000, children = new Uint8Array() } = {},
) {
  const header = concat(
    zeros(6),
    new Uint8Array([0, 1]),
    zeros(8),
    new Uint8Array([(channels >> 8) & 0xff, channels & 0xff]),
    new Uint8Array([0, 16]),
    zeros(2),
    zeros(2),
    u32((sampleRate << 16) >>> 0),
  );
  return box(fourcc, concat(header, children));
}

function stsdWith(...entries) {
  return box("stsd", concat(zeros(4), u32(entries.length), ...entries));
}

function mp4WithStsd(stsd) {
  return concat(
    box("ftyp", concat(ascii("isom"), u32(0x200), ascii("isomiso6"))),
    box("moov", box("trak", box("mdia", box("minf", box("stbl", stsd))))),
  );
}

// esds: version/flags, then ES_Descriptor(0x03) > DecoderConfigDescriptor(0x04)
// > DecoderSpecificInfo(0x05) with a real two-byte AudioSpecificConfig.
function esdsWith(asc) {
  const dsi = concat(new Uint8Array([0x05, asc.length]), new Uint8Array(asc));
  const dcd = concat(
    new Uint8Array([0x04, 13 + dsi.length]),
    new Uint8Array([0x40, 0x15]),
    zeros(3),
    u32(128000),
    u32(128000),
    dsi,
  );
  const es = concat(
    new Uint8Array([0x03, 3 + dcd.length]),
    new Uint8Array([0, 1, 0]),
    dcd,
  );
  return box("esds", concat(zeros(4), es));
}

function transferReport(
  bytes,
  { complete = true, transferred = bytes.length } = {},
) {
  return {
    audioEncoder: { present: false, configs: [] },
    mediaRecorder: {
      types: [],
      recording: {
        requestedMimeType: "audio/mp4",
        actualMimeType: "audio/mp4",
        bytes: bytes.length,
        byteLimitExceeded: false,
        transfer: {
          transferred,
          totalBytes: bytes.length,
          complete,
          base64: Buffer.from(bytes).toString("base64"),
        },
      },
    },
  };
}

// AudioSpecificConfig 0x11 0x90 = AAC-LC, 48 kHz, 2 channels.
const AAC_LC_48K_STEREO = [0x11, 0x90];
const aacFile = mp4WithStsd(
  stsdWith(audioSampleEntry("mp4a", { children: esdsWith(AAC_LC_48K_STEREO) })),
);
const opusFile = mp4WithStsd(
  stsdWith(
    audioSampleEntry("Opus", {
      children: box("dOps", concat(zeros(2), zeros(9))),
    }),
  ),
);

test("a realistic mp4a entry exposes its AudioSpecificConfig", () => {
  const entries = readAudioSampleEntries(aacFile);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].fourcc, "mp4a");
  assert.equal(entries[0].audio, true);
  assert.deepEqual(entries[0].descriptors, [0x03, 0x04, 0x05]);
  assert.deepEqual(describeAacConfig(entries[0].decoderConfig), {
    audioObjectType: 2,
    samplingFrequency: 48000,
    channelConfiguration: 2,
    bitsConsumed: 13,
  });
});

test("the descriptor walk finds DecoderSpecificInfo through nested descriptors", () => {
  const esds = esdsWith(AAC_LC_48K_STEREO);
  const parsed = readEsdsDecoderConfig(esds, 12, esds.length);
  assert.deepEqual(parsed.tags, [0x03, 0x04, 0x05]);
  assert.deepEqual(Array.from(parsed.asc), AAC_LC_48K_STEREO);
});

test("an Opus recording is recognised as Opus, not as AAC", () => {
  const entries = readAudioSampleEntries(opusFile);
  assert.equal(entries[0].fourcc, "Opus");
  assert.equal(entries[0].audio, true);
  const summary = summarizeProbe(transferReport(opusFile));
  assert.equal(summary.status, "blocked");
  assert.match(summary.reasons.join(" "), /carried Opus rather than mp4a/);
});

test("text inside mdat is not mistaken for a sample entry", () => {
  const decoy = concat(
    box("ftyp", ascii("isom")),
    box("mdat", ascii("mp4aesdsxxxx")),
  );
  assert.deepEqual(readAudioSampleEntries(decoy), []);
  const summary = summarizeProbe(transferReport(decoy));
  assert.equal(summary.status, "blocked");
  assert.match(summary.reasons.join(" "), /no recognisable audio sample entry/);
});

test("a truncated or reserved AudioSpecificConfig is rejected", () => {
  assert.equal(describeAacConfig([0x11]), null); // one byte cannot describe the configuration
  assert.equal(describeAacConfig([0x00, 0x90]), null); // object type 0 is reserved
  assert.equal(describeAacConfig([0xf8, 0x00]), null); // object type 31 escapes
  assert.equal(describeAacConfig([0x11, 0x80]), null); // channel configuration 0
  assert.deepEqual(describeAacConfig([0x11, 0x90]), {
    audioObjectType: 2,
    samplingFrequency: 48000,
    channelConfiguration: 2,
    bitsConsumed: 13,
  });
});

test("an mp4a entry with an invalid configuration cannot report supported", () => {
  const invalid = mp4WithStsd(
    stsdWith(audioSampleEntry("mp4a", { children: esdsWith([0x00, 0x90]) })),
  );
  const summary = summarizeProbe(transferReport(invalid));
  assert.equal(summary.status, "blocked");
  assert.match(summary.reasons.join(" "), /AudioSpecificConfig is invalid/);
});

test("an mp4a entry without DecoderSpecificInfo cannot report supported", () => {
  const noEsds = mp4WithStsd(stsdWith(audioSampleEntry("mp4a")));
  const summary = summarizeProbe(transferReport(noEsds));
  assert.equal(summary.status, "blocked");
  assert.match(summary.reasons.join(" "), /no DecoderSpecificInfo/);
});

test("a valid mp4a recording reports supported with the parsed configuration", () => {
  const summary = summarizeProbe(transferReport(aacFile));
  assert.equal(summary.status, "supported");
  assert.deepEqual(summary.reasons, []);
  assert.equal(summary.sampleEntries.length, 1);
  assert.equal(summary.sampleEntries[0].fourcc, "mp4a");
  assert.equal(summary.aacConfig.samplingFrequency, 48000);
});

test("incomplete initialization transfer is reported, not silently accepted", () => {
  const summary = summarizeProbe(
    transferReport(aacFile, { complete: false, transferred: 16 }),
  );
  assert.match(summary.reasons.join(" "), /inspection is incomplete/);
});

test("an unexpected recording error surfaces as an error, not a normal block", () => {
  const summary = summarizeProbe({
    audioEncoder: { present: false, configs: [] },
    mediaRecorder: {
      types: [],
      recording: {
        capability: "error",
        errorName: "ReferenceError",
        error: "boom is not defined",
      },
    },
  });
  assert.equal(summary.status, "blocked");
  assert.match(
    summary.reasons.join(" "),
    /failed unexpectedly: ReferenceError/,
  );
});

test("box and descriptor walks bound hostile input without throwing", () => {
  const garbage = new Uint8Array([
    0, 0, 0, 0, 0x6d, 0x6f, 0x6f, 0x76, 0xff, 0xff, 0xff, 0xff,
  ]);
  assert.doesNotThrow(() => readBoxes(garbage));
  assert.deepEqual(readAudioSampleEntries(garbage), []);
  // A box that claims more bytes than exist is rejected, not clamped.
  assert.deepEqual(
    readBoxes(new Uint8Array([0, 0, 0, 0xff, 0x6d, 0x6f, 0x6f, 0x76])),
    [],
  );
  // Deep nesting is bounded by the depth budget instead of overflowing the stack.
  let nested = box("moov", zeros(0));
  for (let index = 0; index < 40; index += 1) nested = box("moov", nested);
  assert.doesNotThrow(() => readBoxes(nested));
  // Descriptor chains with absurd lengths are rejected.
  assert.doesNotThrow(() =>
    readEsdsDecoderConfig(new Uint8Array([0x03, 0xff, 0xff, 0xff, 0xff]), 0, 5),
  );
  assert.equal(
    readEsdsDecoderConfig(new Uint8Array([0x05, 0x7f, 0x11, 0x90]), 0, 4).asc,
    null,
  );
});
