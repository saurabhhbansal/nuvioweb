// Fragmented MP4 writer: one track per init segment, the shape Media Source
// Extensions wants when audio and video live in separate SourceBuffers.
// Samples are copied untouched; nothing here decodes or re-encodes.

import { concatBytes } from "./bytes.js";

const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

function u8(...values) {
  return Uint8Array.from(values);
}

function u16(value) {
  return u8((value >> 8) & 0xff, value & 0xff);
}

function u32(value) {
  const v = value >>> 0;
  return u8((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
}

function i32(value) {
  return u32(value | 0);
}

function u64(value) {
  const high = Math.floor(value / 0x100000000);
  return concatBytes([u32(high), u32(value - high * 0x100000000)]);
}

function ascii(text) {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

export function box(type, ...payload) {
  const body = concatBytes(payload.filter(Boolean));
  return concatBytes([u32(body.length + 8), ascii(type), body]);
}

export function fullBox(type, version, flags, ...payload) {
  return box(type, u8(version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff), ...payload);
}

function matrix() {
  return concatBytes(MATRIX.map(u32));
}

function packLanguage(language) {
  const code = /^[a-z]{3}$/.test(String(language || "")) ? language : "und";
  let value = 0;
  for (const char of code) {
    value = (value << 5) | (char.charCodeAt(0) - 0x60);
  }
  return u16(value);
}

/**
 * @param {object} track
 * @param {"video"|"audio"} track.kind
 * @param {number} track.timescale
 * @param {Uint8Array} track.sampleEntry One complete sample entry box (avc1, mp4a, Opus...).
 * @param {number} [track.width]
 * @param {number} [track.height]
 * @param {string} [track.language] ISO 639-2 code.
 */
export function createInitSegment(track) {
  const isVideo = track.kind === "video";
  const ftyp = box("ftyp", ascii("iso6"), u32(0), ascii("iso6"), ascii("iso5"), ascii("mp41"), ascii("isom"));
  const mvhd = fullBox(
    "mvhd",
    0,
    0,
    u32(0),
    u32(0),
    u32(1000),
    u32(0),
    u32(0x00010000),
    u16(0x0100),
    new Uint8Array(10),
    matrix(),
    new Uint8Array(24),
    u32(2)
  );
  const tkhd = fullBox(
    "tkhd",
    0,
    3,
    u32(0),
    u32(0),
    u32(1),
    u32(0),
    u32(0),
    new Uint8Array(8),
    u16(0),
    u16(0),
    u16(isVideo ? 0 : 0x0100),
    u16(0),
    matrix(),
    u32((Math.round(track.width || 0) & 0xffff) * 0x10000),
    u32((Math.round(track.height || 0) & 0xffff) * 0x10000)
  );
  const mdhd = fullBox("mdhd", 0, 0, u32(0), u32(0), u32(track.timescale), u32(0), packLanguage(track.language), u16(0));
  const hdlr = fullBox("hdlr", 0, 0, u32(0), ascii(isVideo ? "vide" : "soun"), new Uint8Array(12), u8(0));
  const mediaHeader = isVideo ? fullBox("vmhd", 0, 1, new Uint8Array(8)) : fullBox("smhd", 0, 0, new Uint8Array(4));
  const dinf = box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1)));
  const stbl = box(
    "stbl",
    fullBox("stsd", 0, 0, u32(1), track.sampleEntry),
    fullBox("stts", 0, 0, u32(0)),
    fullBox("stsc", 0, 0, u32(0)),
    fullBox("stsz", 0, 0, u32(0), u32(0)),
    fullBox("stco", 0, 0, u32(0))
  );
  const trak = box("trak", tkhd, box("mdia", mdhd, hdlr, box("minf", mediaHeader, dinf, stbl)));
  const mvex = box("mvex", fullBox("trex", 0, 0, u32(1), u32(1), u32(0), u32(0), u32(0)));
  return concatBytes([ftyp, box("moov", mvhd, trak, mvex)]);
}

const SYNC_FLAGS = 0x02000000;
const NON_SYNC_FLAGS = 0x01010000;

/**
 * @param {object} fragment
 * @param {number} fragment.sequenceNumber
 * @param {number} fragment.baseMediaDecodeTime In track timescale units, >= 0.
 * @param {{ data: Uint8Array, duration: number, compositionOffset?: number, sync?: boolean }[]} fragment.samples
 */
export function createMediaSegment({ sequenceNumber, baseMediaDecodeTime, samples }) {
  const entries = samples.map((sample) =>
    concatBytes([
      u32(Math.max(0, Math.round(sample.duration))),
      u32(sample.data.length),
      u32(sample.sync === false ? NON_SYNC_FLAGS : SYNC_FLAGS),
      i32(Math.round(sample.compositionOffset || 0))
    ])
  );
  const build = (dataOffset) =>
    box(
      "moof",
      fullBox("mfhd", 0, 0, u32(sequenceNumber)),
      box(
        "traf",
        fullBox("tfhd", 0, 0x020000, u32(1)),
        fullBox("tfdt", 1, 0, u64(Math.max(0, Math.round(baseMediaDecodeTime)))),
        fullBox("trun", 1, 0x000f01, u32(samples.length), i32(dataOffset), ...entries)
      )
    );
  const moofLength = build(0).length;
  const moof = build(moofLength + 8);
  const mdat = box("mdat", ...samples.map((sample) => sample.data));
  return concatBytes([moof, mdat]);
}

// Sample entry builders, used when the source is Matroska and has no MP4
// sample description to copy.

export function visualSampleEntry(type, width, height, ...children) {
  const compressor = new Uint8Array(32);
  return box(
    type,
    new Uint8Array(6),
    u16(1),
    new Uint8Array(16),
    u16(width & 0xffff),
    u16(height & 0xffff),
    u32(0x00480000),
    u32(0x00480000),
    u32(0),
    u16(1),
    compressor,
    u16(0x0018),
    u16(0xffff),
    ...children
  );
}

export function audioSampleEntry(type, channels, sampleRate, ...children) {
  const rate = sampleRate > 0xffff ? 0 : sampleRate;
  return box(
    type,
    new Uint8Array(6),
    u16(1),
    new Uint8Array(8),
    u16(channels || 2),
    u16(16),
    u16(0),
    u16(0),
    u32(rate * 0x10000),
    ...children
  );
}

function descriptor(tag, ...payload) {
  const body = concatBytes(payload);
  const length = body.length;
  const sizeBytes = u8(0x80 | ((length >> 21) & 0x7f), 0x80 | ((length >> 14) & 0x7f), 0x80 | ((length >> 7) & 0x7f), length & 0x7f);
  return concatBytes([u8(tag), sizeBytes, body]);
}

export function esdsBox(objectTypeIndication, decoderSpecificInfo = null) {
  const decoderConfig = descriptor(
    0x04,
    u8(objectTypeIndication, 0x15, 0, 0, 0),
    u32(0),
    u32(0),
    ...(decoderSpecificInfo?.length ? [descriptor(0x05, decoderSpecificInfo)] : [])
  );
  return fullBox("esds", 0, 0, descriptor(0x03, u16(1), u8(0), decoderConfig, descriptor(0x06, u8(0x02))));
}

export const writeBytes = { u8, u16, u32, i32, u64, ascii };
