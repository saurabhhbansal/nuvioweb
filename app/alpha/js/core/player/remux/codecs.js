// Codec strings for MediaSource.isTypeSupported and MP4 sample entries for
// tracks that come from Matroska. Only configuration headers are read or
// written; frames pass through untouched.

import { BitReader, BitWriter, concatBytes, fourcc, hex2, readU16, readU32 } from "./bytes.js";
import { audioSampleEntry, box, esdsBox, fullBox, visualSampleEntry, writeBytes } from "./fmp4.js";

const { u8, u16, u32 } = writeBytes;

export function avcCodecString(avcC, prefix = "avc1") {
  if (!avcC || avcC.length < 4) {
    return `${prefix}.42E01E`;
  }
  return `${prefix}.${hex2(avcC[1])}${hex2(avcC[2])}${hex2(avcC[3])}`.toLowerCase();
}

export function hevcCodecString(hvcC, prefix = "hvc1") {
  if (!hvcC || hvcC.length < 13) {
    return `${prefix}.1.6.L93.B0`;
  }
  const space = hvcC[1] >> 6;
  const tier = (hvcC[1] >> 5) & 1;
  const profile = hvcC[1] & 0x1f;
  let compat = readU32(hvcC, 2);
  let reversed = 0;
  for (let index = 0; index < 32; index += 1) {
    reversed = reversed * 2 + (compat & 1);
    compat >>>= 1;
  }
  const constraints = Array.from(hvcC.subarray(6, 12));
  while (constraints.length && constraints[constraints.length - 1] === 0) {
    constraints.pop();
  }
  const parts = [
    prefix,
    `${["", "A", "B", "C"][space]}${profile}`,
    reversed.toString(16).toUpperCase(),
    `${tier ? "H" : "L"}${hvcC[12]}`,
    ...constraints.map((byte) => byte.toString(16).toUpperCase())
  ];
  return parts.join(".");
}

export function av1CodecString(av1C) {
  if (!av1C || av1C.length < 4) {
    return "av01.0.04M.08";
  }
  const profile = av1C[1] >> 5;
  const level = av1C[1] & 0x1f;
  const tier = av1C[2] >> 7;
  const highBitDepth = (av1C[2] >> 6) & 1;
  const twelveBit = (av1C[2] >> 5) & 1;
  const depth = twelveBit ? 12 : highBitDepth ? 10 : 8;
  return `av01.${profile}.${String(level).padStart(2, "0")}${tier ? "H" : "M"}.${String(depth).padStart(2, "0")}`;
}

export function vp9CodecString(vpcC) {
  // vpcC is a full box payload: 4 bytes version/flags, then profile, level, bitDepth...
  if (!vpcC || vpcC.length < 7) {
    return "vp09.00.10.08";
  }
  const profile = vpcC[4];
  const level = vpcC[5];
  const depth = vpcC[6] >> 4;
  return `vp09.${String(profile).padStart(2, "0")}.${String(level).padStart(2, "0")}.${String(depth).padStart(2, "0")}`;
}

function readDescriptor(bytes, offset) {
  const tag = bytes[offset];
  let length = 0;
  let cursor = offset + 1;
  for (let index = 0; index < 4; index += 1) {
    const byte = bytes[cursor];
    cursor += 1;
    length = (length << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) {
      break;
    }
  }
  return { tag, start: cursor, end: Math.min(bytes.length, cursor + length) };
}

/** Reads the object type and AudioSpecificConfig from an esds payload (after version/flags). */
export function parseEsds(esdsPayload) {
  let objectType = 0;
  let decoderSpecificInfo = null;
  const walk = (start, end) => {
    let cursor = start;
    while (cursor + 2 <= end) {
      const node = readDescriptor(esdsPayload, cursor);
      if (node.tag === 0x03) {
        let inner = node.start + 3;
        const flags = esdsPayload[node.start + 2];
        if (flags & 0x80) inner += 2;
        if (flags & 0x40) inner += 1 + esdsPayload[inner];
        if (flags & 0x20) inner += 2;
        walk(inner, node.end);
      } else if (node.tag === 0x04) {
        objectType = esdsPayload[node.start];
        walk(node.start + 13, node.end);
      } else if (node.tag === 0x05) {
        decoderSpecificInfo = esdsPayload.subarray(node.start, node.end);
      }
      cursor = node.end;
    }
  };
  walk(4, esdsPayload.length);
  return { objectType, decoderSpecificInfo };
}

export function aacObjectType(audioSpecificConfig) {
  if (!audioSpecificConfig?.length) {
    return 2;
  }
  const reader = new BitReader(audioSpecificConfig);
  const type = reader.read(5);
  return type === 31 ? 32 + reader.read(6) : type;
}

export function mp4aCodecString(objectType, audioSpecificConfig) {
  if (objectType === 0x40 || objectType === 0x66 || objectType === 0x67 || objectType === 0x68) {
    return `mp4a.40.${aacObjectType(audioSpecificConfig)}`;
  }
  return `mp4a.${objectType.toString(16).toUpperCase()}`;
}

const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

export function buildAudioSpecificConfig(objectType, sampleRate, channels) {
  const writer = new BitWriter();
  const rateIndex = AAC_RATES.indexOf(sampleRate);
  writer.write(5, objectType);
  if (rateIndex >= 0) {
    writer.write(4, rateIndex);
  } else {
    writer.write(4, 15);
    writer.write(24, sampleRate);
  }
  writer.write(4, channels);
  writer.write(3, 0);
  return writer.toBytes();
}

/** OpusHead (little endian, from Matroska CodecPrivate) to the dOps box. */
export function dOpsFromOpusHead(head, channelsFallback = 2) {
  const valid = head?.length >= 19 && String.fromCharCode(...head.subarray(0, 8)) === "OpusHead";
  const channels = valid ? head[9] : channelsFallback;
  const preSkip = valid ? head[10] | (head[11] << 8) : 312;
  const inputRate = valid ? (head[12] | (head[13] << 8) | (head[14] << 16) | (head[15] << 24)) >>> 0 : 48000;
  const gain = valid ? head[16] | (head[17] << 8) : 0;
  const family = valid ? head[18] : 0;
  const mapping = valid && family !== 0 ? head.subarray(19, 21 + channels) : new Uint8Array(0);
  return box("dOps", u8(0, channels), u16(preSkip), u32(inputRate), u16(gain), u8(family), mapping);
}

/** FLAC CodecPrivate ("fLaC" + metadata blocks) to the dfLa box, keeping STREAMINFO only. */
export function dfLaFromFlacPrivate(codecPrivate) {
  if (!codecPrivate || codecPrivate.length < 42 || fourcc(codecPrivate, 0) !== "fLaC") {
    return null;
  }
  const block = codecPrivate.slice(4, 4 + 4 + 34);
  block[0] = 0x80 | (block[0] & 0x7f);
  return fullBox("dfLa", 0, 0, block);
}

const AC3_RATES = [48000, 44100, 32000];

/** Reads an AC-3 frame header (syncinfo + start of bsi). */
export function parseAc3Frame(frame) {
  if (!frame || frame.length < 8 || frame[0] !== 0x0b || frame[1] !== 0x77) {
    return null;
  }
  const reader = new BitReader(frame, 4);
  const fscod = reader.read(2);
  const frmsizecod = reader.read(6);
  const bsid = reader.read(5);
  const bsmod = reader.read(3);
  const acmod = reader.read(3);
  if (acmod & 1 && acmod !== 1) reader.skip(2);
  if (acmod & 4) reader.skip(2);
  if (acmod === 2) reader.skip(2);
  const lfeon = reader.read(1);
  if (bsid > 10) {
    return null;
  }
  return { fscod, frmsizecod, bsid, bsmod, acmod, lfeon, sampleRate: AC3_RATES[fscod] || 48000 };
}

export function dac3Box(info) {
  const writer = new BitWriter();
  writer.write(2, info.fscod);
  writer.write(5, info.bsid);
  writer.write(3, info.bsmod);
  writer.write(3, info.acmod);
  writer.write(1, info.lfeon);
  writer.write(5, info.frmsizecod >> 1);
  writer.write(5, 0);
  return box("dac3", writer.toBytes());
}

/** Reads the first independent E-AC-3 substream header. */
export function parseEac3Frame(frame) {
  if (!frame || frame.length < 8 || frame[0] !== 0x0b || frame[1] !== 0x77) {
    return null;
  }
  const reader = new BitReader(frame, 2);
  reader.read(2); // strmtyp
  reader.read(3); // substreamid
  const frmsiz = reader.read(11);
  const fscod = reader.read(2);
  let numblkscod = 3;
  let sampleRate = AC3_RATES[fscod] || 48000;
  if (fscod === 3) {
    const fscod2 = reader.read(2);
    sampleRate = [24000, 22050, 16000][fscod2] || 24000;
  } else {
    numblkscod = reader.read(2);
  }
  const acmod = reader.read(3);
  const lfeon = reader.read(1);
  const bsid = reader.read(5);
  if (bsid <= 10 || bsid > 16) {
    return null;
  }
  const blocks = [1, 2, 3, 6][numblkscod];
  const frameBytes = (frmsiz + 1) * 2;
  const kbps = Math.round((frameBytes * 8 * sampleRate) / (blocks * 256) / 1000);
  return { fscod: fscod === 3 ? 3 : fscod, bsid, acmod, lfeon, sampleRate, kbps };
}

export function dec3Box(info) {
  const writer = new BitWriter();
  writer.write(13, Math.min(8191, info.kbps));
  writer.write(3, 0); // one independent substream
  writer.write(2, info.fscod);
  writer.write(5, info.bsid);
  writer.write(1, 0);
  writer.write(1, 0);
  writer.write(3, 0); // bsmod
  writer.write(3, info.acmod);
  writer.write(1, info.lfeon);
  writer.write(3, 0);
  writer.write(4, 0); // no dependent substreams
  writer.write(1, 0);
  return box("dec3", writer.toBytes());
}

function vp9Level(width, height) {
  const pixels = width * height;
  const levels = [
    [36864, 10],
    [73728, 11],
    [122880, 20],
    [245760, 21],
    [552960, 30],
    [983040, 31],
    [2228224, 40],
    [8912896, 50],
    [35651584, 60]
  ];
  return (levels.find(([limit]) => pixels <= limit) || [0, 62])[1];
}

function vpcCFromMatroska(codecPrivate, width, height) {
  let profile = 0;
  let level = vp9Level(width, height);
  let depth = 8;
  let chroma = 1;
  // Matroska VP9 CodecPrivate: ID (1 byte), length (1 byte), value.
  for (let cursor = 0; codecPrivate && cursor + 2 < codecPrivate.length; ) {
    const id = codecPrivate[cursor];
    const length = codecPrivate[cursor + 1];
    const value = codecPrivate[cursor + 2];
    if (id === 1) profile = value;
    if (id === 2 && value) level = value;
    if (id === 3) depth = value;
    if (id === 4) chroma = value;
    cursor += 2 + length;
  }
  return fullBox("vpcC", 1, 0, u8(profile, level, (depth << 4) | (chroma << 1), 2, 2, 2), u16(0));
}

const UNSUPPORTED_AUDIO = {
  A_DTS: "dtsc",
  "A_DTS/EXPRESS": "dtse",
  "A_DTS/LOSSLESS": "dtsl",
  A_TRUEHD: "mlpa",
  A_VORBIS: "vorbis",
  "A_PCM/INT/LIT": "lpcm",
  "A_PCM/INT/BIG": "lpcm",
  "A_PCM/FLOAT/IEEE": "lpcm"
};

/**
 * Builds the MP4 sample entry and codec string for a Matroska track.
 * Returns { codec, sampleEntry } where sampleEntry is null when the codec
 * cannot be carried in fragmented MP4, or `needsFrame: true` when the
 * entry depends on the first frame (AC-3, E-AC-3).
 */
export function describeMatroskaCodec(track, firstFrame = null) {
  const id = String(track.codecId || "");
  const codecPrivate = track.codecPrivate || null;
  const width = track.width || 0;
  const height = track.height || 0;
  const channels = track.channels || 2;
  const sampleRate = Math.round(track.sampleRate || 48000);
  switch (id) {
    case "V_MPEG4/ISO/AVC":
      return {
        codec: avcCodecString(codecPrivate),
        sampleEntry: codecPrivate ? visualSampleEntry("avc1", width, height, box("avcC", codecPrivate)) : null
      };
    case "V_MPEGH/ISO/HEVC":
      return {
        codec: hevcCodecString(codecPrivate),
        sampleEntry: codecPrivate ? visualSampleEntry("hvc1", width, height, box("hvcC", codecPrivate)) : null
      };
    case "V_AV1":
      return {
        codec: av1CodecString(codecPrivate),
        sampleEntry: codecPrivate ? visualSampleEntry("av01", width, height, box("av1C", codecPrivate)) : null
      };
    case "V_VP9": {
      const vpcC = vpcCFromMatroska(codecPrivate, width, height);
      return { codec: vp9CodecString(vpcC.subarray(8)), sampleEntry: visualSampleEntry("vp09", width, height, vpcC) };
    }
    case "A_OPUS":
      return { codec: "opus", sampleEntry: audioSampleEntry("Opus", channels, 48000, dOpsFromOpusHead(codecPrivate, channels)) };
    case "A_FLAC": {
      const dfLa = dfLaFromFlacPrivate(codecPrivate);
      return { codec: "flac", sampleEntry: dfLa ? audioSampleEntry("fLaC", channels, sampleRate, dfLa) : null };
    }
    case "A_MPEG/L3":
      return { codec: "mp4a.6B", sampleEntry: audioSampleEntry("mp4a", channels, sampleRate, esdsBox(0x6b)) };
    case "A_AC3":
    case "A_EAC3": {
      const eac3 = id === "A_EAC3";
      const codec = eac3 ? "ec-3" : "ac-3";
      if (!firstFrame) {
        return { codec, sampleEntry: null, needsFrame: true };
      }
      const info = eac3 ? parseEac3Frame(firstFrame) : parseAc3Frame(firstFrame);
      if (!info) {
        return { codec, sampleEntry: null };
      }
      return {
        codec,
        sampleEntry: audioSampleEntry(eac3 ? "ec-3" : "ac-3", channels, info.sampleRate, eac3 ? dec3Box(info) : dac3Box(info))
      };
    }
    default:
      break;
  }
  if (id.startsWith("A_AAC")) {
    let asc = codecPrivate && codecPrivate.length >= 2 ? codecPrivate : null;
    if (!asc) {
      const profile = id.includes("/SBR") ? 5 : id.includes("/LTP") ? 4 : id.includes("/SSR") ? 3 : id.includes("/MAIN") ? 1 : 2;
      asc = buildAudioSpecificConfig(profile, sampleRate, channels);
    }
    return { codec: mp4aCodecString(0x40, asc), sampleEntry: audioSampleEntry("mp4a", channels, sampleRate, esdsBox(0x40, asc)) };
  }
  return { codec: UNSUPPORTED_AUDIO[id] || id.toLowerCase(), sampleEntry: null };
}

/** Codec string for an MP4 sample entry box (type + payload). */
export function codecStringFromSampleEntry(entry) {
  const type = fourcc(entry, 4);
  const isVisual = ["avc1", "avc3", "hvc1", "hev1", "av01", "vp09", "vp08"].includes(type);
  const soundVersion = isVisual ? 0 : readU16(entry, 16);
  const childStart = 8 + (isVisual ? 78 : 28 + (soundVersion === 1 ? 16 : soundVersion === 2 ? 36 : 0));
  const children = {};
  for (let cursor = childStart; cursor + 8 <= entry.length; ) {
    const size = readU32(entry, cursor);
    if (size < 8) break;
    children[fourcc(entry, cursor + 4)] = entry.subarray(cursor + 8, cursor + size);
    cursor += size;
  }
  switch (type) {
    case "avc1":
    case "avc3":
      return avcCodecString(children.avcC, type);
    case "hvc1":
    case "hev1":
      return hevcCodecString(children.hvcC, type);
    case "av01":
      return av1CodecString(children.av1C);
    case "vp09":
      return vp9CodecString(children.vpcC);
    case "mp4a": {
      if (!children.esds) return "mp4a.40.2";
      const { objectType, decoderSpecificInfo } = parseEsds(children.esds);
      return mp4aCodecString(objectType || 0x40, decoderSpecificInfo);
    }
    case "Opus":
      return "opus";
    case "fLaC":
      return "flac";
    case ".mp3":
      return "mp3";
    default:
      return type.trim();
  }
}

export { concatBytes, readU16 };
