// Progressive (non-fragmented) MP4/MOV demuxer: reads the moov box, builds
// per-track sample tables, and hands out compressed samples by file offset.

import { RemuxUnavailableError } from "./byteSource.js";
import { fourcc, readI32, readU16, readU32, readU64 } from "./bytes.js";
import { codecStringFromSampleEntry } from "./codecs.js";

const MAX_MOOV_BYTES = 96 * 1024 * 1024;
const SPAN_BYTES = 2 * 1024 * 1024;
const SPAN_GAP_BYTES = 512 * 1024;
const GENERIC_HANDLER_NAMES = /^(sound|video|audio)\s*handler$|^core media|^apple|^mainconcept|^l-smash|^gpac|^isomedia/i;

function* boxes(bytes, start, end) {
  let cursor = start;
  while (cursor + 8 <= end) {
    let size = readU32(bytes, cursor);
    const type = fourcc(bytes, cursor + 4);
    let header = 8;
    if (size === 1) {
      size = readU64(bytes, cursor + 8);
      header = 16;
    } else if (size === 0) {
      size = end - cursor;
    }
    if (size < header || cursor + size > end) {
      return;
    }
    yield { type, start: cursor + header, end: cursor + size, boxStart: cursor };
    cursor += size;
  }
}

function child(bytes, parent, type) {
  for (const node of boxes(bytes, parent.start, parent.end)) {
    if (node.type === type) return node;
  }
  return null;
}

function path(bytes, parent, ...types) {
  let node = parent;
  for (const type of types) {
    node = node && child(bytes, node, type);
  }
  return node;
}

function unpackLanguage(value) {
  if (!value || value === 0x7fff) return "";
  const code = String.fromCharCode(((value >> 10) & 0x1f) + 0x60, ((value >> 5) & 0x1f) + 0x60, (value & 0x1f) + 0x60);
  return /^[a-z]{3}$/.test(code) && code !== "und" ? code : "";
}

function readName(bytes, start, end) {
  let text = "";
  for (let cursor = start; cursor < end && bytes[cursor] !== 0; cursor += 1) {
    text += String.fromCharCode(bytes[cursor]);
  }
  try {
    text = decodeURIComponent(escape(text));
  } catch (_) {
    // Not UTF-8; keep the Latin-1 reading.
  }
  return Array.from(text)
    .filter((char) => char.charCodeAt(0) >= 0x20)
    .join("")
    .trim();
}

function parseTrack(bytes, trak) {
  const tkhd = child(bytes, trak, "tkhd");
  const mdia = child(bytes, trak, "mdia");
  const mdhd = mdia && child(bytes, mdia, "mdhd");
  const hdlr = mdia && child(bytes, mdia, "hdlr");
  const stbl = mdia && path(bytes, mdia, "minf", "stbl");
  if (!tkhd || !mdhd || !hdlr || !stbl) return null;

  const handler = fourcc(bytes, hdlr.start + 8);
  const kind = handler === "vide" ? "video" : handler === "soun" ? "audio" : "";
  if (!kind) return null;

  const tkhdVersion = bytes[tkhd.start];
  const enabled = Boolean(bytes[tkhd.start + 3] & 1);
  const id = readU32(bytes, tkhd.start + (tkhdVersion === 1 ? 20 : 12));
  const width = readU32(bytes, tkhd.end - 8) / 65536;
  const height = readU32(bytes, tkhd.end - 4) / 65536;

  const mdhdVersion = bytes[mdhd.start];
  const timescale = readU32(bytes, mdhd.start + (mdhdVersion === 1 ? 20 : 12));
  const duration = mdhdVersion === 1 ? readU64(bytes, mdhd.start + 24) : readU32(bytes, mdhd.start + 16);
  const language = unpackLanguage(readU16(bytes, mdhd.start + (mdhdVersion === 1 ? 32 : 20)));
  const handlerName = readName(bytes, hdlr.start + 24, hdlr.end);
  const udtaName = path(bytes, trak, "udta", "name");
  const name = (udtaName ? readName(bytes, udtaName.start, udtaName.end) : "") ||
    (GENERIC_HANDLER_NAMES.test(handlerName) ? "" : handlerName);

  let editShift = 0;
  const elst = path(bytes, trak, "edts", "elst");
  if (elst) {
    const version = bytes[elst.start];
    const count = readU32(bytes, elst.start + 4);
    let cursor = elst.start + 8;
    for (let index = 0; index < count; index += 1) {
      const mediaTime = version === 1 ? readU64(bytes, cursor + 8) : readI32(bytes, cursor + 4);
      cursor += version === 1 ? 20 : 12;
      // A 64-bit media_time of -1 (empty edit) reads as a huge unsigned value.
      if (mediaTime >= 0 && mediaTime < Number.MAX_SAFE_INTEGER) {
        editShift = mediaTime;
        break;
      }
    }
  }

  const stsd = child(bytes, stbl, "stsd");
  if (!stsd || readU32(bytes, stsd.start + 4) < 1) return null;
  const entryNode = boxes(bytes, stsd.start + 8, stsd.end).next().value;
  if (!entryNode) return null;
  const sampleEntry = bytes.slice(entryNode.boxStart, entryNode.end);
  const entryType = entryNode.type;
  const codec = codecStringFromSampleEntry(sampleEntry);
  const encrypted = entryType === "encv" || entryType === "enca";
  let channels = 0;
  let sampleRate = 0;
  if (kind === "audio") {
    channels = readU16(sampleEntry, 24);
    sampleRate = readU32(sampleEntry, 32) / 65536;
  }

  const samples = buildSampleTable(bytes, stbl);
  return {
    id,
    kind,
    enabled,
    timescale,
    durationSeconds: timescale ? duration / timescale : 0,
    language,
    name,
    codec,
    sampleEntry: encrypted ? null : sampleEntry,
    unsupportedReason: encrypted ? "encrypted" : samples ? "" : "no-samples",
    width,
    height,
    channels,
    sampleRate,
    editShift: kind === "video" ? editShift : 0,
    samples
  };
}

function buildSampleTable(bytes, stbl) {
  const stsz = child(bytes, stbl, "stsz");
  const stz2 = child(bytes, stbl, "stz2");
  const stts = child(bytes, stbl, "stts");
  const stsc = child(bytes, stbl, "stsc");
  const stco = child(bytes, stbl, "stco");
  const co64 = child(bytes, stbl, "co64");
  if ((!stsz && !stz2) || !stts || !stsc || (!stco && !co64)) return null;

  let count;
  const sizes = (() => {
    if (stsz) {
      const fixed = readU32(bytes, stsz.start + 4);
      count = readU32(bytes, stsz.start + 8);
      const out = new Uint32Array(count);
      for (let index = 0; index < count; index += 1) {
        out[index] = fixed || readU32(bytes, stsz.start + 12 + index * 4);
      }
      return out;
    }
    const fieldSize = bytes[stz2.start + 7];
    count = readU32(bytes, stz2.start + 8);
    const out = new Uint32Array(count);
    for (let index = 0; index < count; index += 1) {
      if (fieldSize === 16) out[index] = readU16(bytes, stz2.start + 12 + index * 2);
      else if (fieldSize === 8) out[index] = bytes[stz2.start + 12 + index];
      else out[index] = (bytes[stz2.start + 12 + (index >> 1)] >> (index & 1 ? 0 : 4)) & 0xf;
    }
    return out;
  })();
  if (!count) return null;

  const dts = new Float64Array(count);
  const durations = new Uint32Array(count);
  {
    const entries = readU32(bytes, stts.start + 4);
    let sample = 0;
    let time = 0;
    for (let entry = 0; entry < entries && sample < count; entry += 1) {
      const runCount = readU32(bytes, stts.start + 8 + entry * 8);
      const delta = readU32(bytes, stts.start + 12 + entry * 8);
      for (let index = 0; index < runCount && sample < count; index += 1) {
        dts[sample] = time;
        durations[sample] = delta;
        time += delta;
        sample += 1;
      }
    }
    for (; sample < count; sample += 1) {
      dts[sample] = time;
      durations[sample] = durations[sample - 1] || 0;
      time += durations[sample];
    }
  }

  const compositionOffsets = new Int32Array(count);
  const ctts = child(bytes, stbl, "ctts");
  if (ctts) {
    const entries = readU32(bytes, ctts.start + 4);
    let sample = 0;
    for (let entry = 0; entry < entries && sample < count; entry += 1) {
      const runCount = readU32(bytes, ctts.start + 8 + entry * 8);
      const offset = readI32(bytes, ctts.start + 12 + entry * 8);
      for (let index = 0; index < runCount && sample < count; index += 1) {
        compositionOffsets[sample] = offset;
        sample += 1;
      }
    }
  }

  const sync = new Uint8Array(count);
  const stss = child(bytes, stbl, "stss");
  if (stss) {
    const entries = readU32(bytes, stss.start + 4);
    for (let entry = 0; entry < entries; entry += 1) {
      const number = readU32(bytes, stss.start + 8 + entry * 4);
      if (number >= 1 && number <= count) sync[number - 1] = 1;
    }
  } else {
    sync.fill(1);
  }

  const chunkOffsets = [];
  if (stco) {
    const entries = readU32(bytes, stco.start + 4);
    for (let entry = 0; entry < entries; entry += 1) chunkOffsets.push(readU32(bytes, stco.start + 8 + entry * 4));
  } else {
    const entries = readU32(bytes, co64.start + 4);
    for (let entry = 0; entry < entries; entry += 1) chunkOffsets.push(readU64(bytes, co64.start + 8 + entry * 8));
  }

  const offsets = new Float64Array(count);
  {
    const entries = readU32(bytes, stsc.start + 4);
    const runs = [];
    for (let entry = 0; entry < entries; entry += 1) {
      runs.push({
        firstChunk: readU32(bytes, stsc.start + 8 + entry * 12),
        samplesPerChunk: readU32(bytes, stsc.start + 12 + entry * 12)
      });
    }
    let sample = 0;
    for (let run = 0; run < runs.length && sample < count; run += 1) {
      const lastChunk = run + 1 < runs.length ? runs[run + 1].firstChunk - 1 : chunkOffsets.length;
      for (let chunk = runs[run].firstChunk; chunk <= lastChunk && sample < count; chunk += 1) {
        let offset = chunkOffsets[chunk - 1];
        for (let index = 0; index < runs[run].samplesPerChunk && sample < count; index += 1) {
          offsets[sample] = offset;
          offset += sizes[sample];
          sample += 1;
        }
      }
    }
    if (sample < count) return null;
  }

  return { count, offsets, sizes, dts, durations, compositionOffsets, sync };
}

/** Index of the last sync sample presented at or before `time` seconds. */
function keyframeIndexAt(track, time) {
  const { samples, timescale, editShift } = track;
  let best = 0;
  for (let index = 0; index < samples.count; index += 1) {
    if (!samples.sync[index]) continue;
    const pts = (samples.dts[index] + samples.compositionOffsets[index] - editShift) / timescale;
    if (pts <= time + 1e-6) best = index;
    else if (samples.dts[index] / timescale > time + 10) break;
  }
  return best;
}

/** Index of the last sample decoded at or before `time` seconds. */
function sampleIndexAt(track, time) {
  const { samples, timescale } = track;
  let low = 0;
  let high = samples.count - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (samples.dts[middle] / timescale <= time) low = middle;
    else high = middle - 1;
  }
  return Math.max(0, low);
}

export async function openMp4(source) {
  let offset = 0;
  let moov = null;
  for (let guard = 0; guard < 1024 && offset + 8 <= source.size; guard += 1) {
    const header = await source.read(offset, Math.min(source.size, offset + 16));
    let size = readU32(header, 0);
    const type = fourcc(header, 4);
    if (size === 1) size = readU64(header, 8);
    else if (size === 0) size = source.size - offset;
    if (size < 8) break;
    if (type === "moof") throw new RemuxUnavailableError("fragmented-mp4");
    if (type === "moov") {
      if (size > MAX_MOOV_BYTES) throw new RemuxUnavailableError("moov-too-large");
      moov = await source.read(offset, offset + size);
      break;
    }
    offset += size;
  }
  if (!moov) throw new RemuxUnavailableError("no-moov");

  const root = { start: 8, end: moov.length };
  const mvhd = child(moov, root, "mvhd");
  let durationSeconds = 0;
  if (mvhd) {
    const version = moov[mvhd.start];
    const timescale = readU32(moov, mvhd.start + (version === 1 ? 20 : 12));
    const duration = version === 1 ? readU64(moov, mvhd.start + 24) : readU32(moov, mvhd.start + 16);
    durationSeconds = timescale ? duration / timescale : 0;
  }
  const tracks = [];
  for (const node of boxes(moov, root.start, root.end)) {
    if (node.type !== "trak") continue;
    const track = parseTrack(moov, node);
    if (track) tracks.push(track);
  }
  durationSeconds = Math.max(durationSeconds, ...tracks.map((track) => track.durationSeconds));

  return {
    container: "mp4",
    source,
    durationSeconds,
    tracks,
    /**
     * Reads samples for the given tracks starting at the keyframe at or
     * before `startTime`. Yields batches: [{ track, samples: [...] }].
     * Samples carry dts/compositionOffset/duration in track timescale.
     */
    createReader({ trackIds, startTime = 0, signal } = {}) {
      return readMp4Samples(this, { trackIds, startTime, signal });
    }
  };
}

async function* readMp4Samples(demuxer, { trackIds, startTime, signal }) {
  const chosen = demuxer.tracks.filter((track) => trackIds.includes(track.id) && track.samples);
  const video = chosen.find((track) => track.kind === "video");
  let fromTime = startTime;
  const cursors = chosen.map((track) => ({ track, index: 0 }));
  if (video) {
    const key = keyframeIndexAt(video, startTime);
    const cursor = cursors.find((entry) => entry.track === video);
    cursor.index = key;
    fromTime = Math.min(startTime, (video.samples.dts[key] + video.samples.compositionOffsets[key] - video.editShift) / video.timescale);
  }
  for (const cursor of cursors) {
    if (cursor.track !== video) cursor.index = sampleIndexAt(cursor.track, Math.max(0, fromTime - 0.05));
  }

  while (true) {
    if (signal?.aborted) return;
    // Plan one contiguous span in file order across the chosen tracks.
    const plan = [];
    let spanStart = -1;
    let spanEnd = -1;
    while (true) {
      let next = null;
      for (const cursor of cursors) {
        if (cursor.index >= cursor.track.samples.count) continue;
        const sampleOffset = cursor.track.samples.offsets[cursor.index];
        if (!next || sampleOffset < next.offset) next = { cursor, offset: sampleOffset };
      }
      if (!next) break;
      const size = next.cursor.track.samples.sizes[next.cursor.index];
      if (spanStart < 0) {
        spanStart = next.offset;
        spanEnd = next.offset + size;
      } else if (next.offset - spanEnd > SPAN_GAP_BYTES || next.offset + size - spanStart > SPAN_BYTES) {
        break;
      } else {
        spanEnd = Math.max(spanEnd, next.offset + size);
      }
      plan.push({ track: next.cursor.track, index: next.cursor.index });
      next.cursor.index += 1;
    }
    if (!plan.length) return;
    const bytes = await demuxer.source.read(spanStart, spanEnd, { signal });
    const byTrack = new Map();
    for (const { track, index } of plan) {
      const { samples } = track;
      const start = samples.offsets[index] - spanStart;
      if (!byTrack.has(track)) byTrack.set(track, []);
      byTrack.get(track).push({
        data: bytes.subarray(start, start + samples.sizes[index]),
        dts: samples.dts[index],
        duration: samples.durations[index],
        compositionOffset: samples.compositionOffsets[index],
        sync: Boolean(samples.sync[index])
      });
    }
    yield Array.from(byTrack, ([track, samples]) => ({ track, samples }));
  }
}
