// Minimal Matroska/WebM demuxer, scoped to what remuxing needs: the EBML
// header, Info, Tracks, Cues (for seeking) and blocks from Clusters.
// Element IDs: https://www.matroska.org/technical/elements.html

import { RemuxUnavailableError } from "./byteSource.js";
import { describeMatroskaCodec } from "./codecs.js";

const ID = {
  EBML: 0x1a45dfa3,
  DocType: 0x4282,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Seek: 0x4dbb,
  SeekID: 0x53ab,
  SeekPosition: 0x53ac,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
  FlagEnabled: 0xb9,
  FlagDefault: 0x88,
  FlagForced: 0x55aa,
  DefaultDuration: 0x23e383,
  Name: 0x536e,
  Language: 0x22b59c,
  LanguageBCP47: 0x22b59d,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Audio: 0xe1,
  SamplingFrequency: 0xb5,
  Channels: 0x9f,
  ContentEncodings: 0x6d80,
  ContentEncoding: 0x6240,
  ContentCompression: 0x5034,
  ContentCompAlgo: 0x4254,
  ContentCompSettings: 0x4255,
  ContentEncryption: 0x5035,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueTrack: 0xf7,
  CueClusterPosition: 0xf1,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  BlockDuration: 0x9b,
  ReferenceBlock: 0xfb
};

// Top-level Segment children: seeing one of these while reading clusters
// means the current cluster (possibly of unknown size) has ended.
const TOP_LEVEL = new Set([ID.Cluster, ID.Cues, ID.SeekHead, ID.Info, ID.Tracks, 0x1043a770, 0x1254c367, 0x1941a469]);
const MAX_HEADER_ELEMENT_BYTES = 16 * 1024 * 1024;
const CHUNK_BYTES = 1024 * 1024;

/** Element ID (marker bits kept). Returns { value, length } or null if truncated. */
export function readElementId(bytes, offset) {
  const first = bytes[offset];
  if (first === undefined) return null;
  let length = 1;
  if (first & 0x80) length = 1;
  else if (first & 0x40) length = 2;
  else if (first & 0x20) length = 3;
  else if (first & 0x10) length = 4;
  else return { value: -1, length: 1 };
  if (offset + length > bytes.length) return null;
  let value = 0;
  for (let index = 0; index < length; index += 1) value = value * 256 + bytes[offset + index];
  return { value, length };
}

/** EBML variable-size integer (marker removed). `unknown` is true for all-ones sizes. */
export function readVint(bytes, offset) {
  const first = bytes[offset];
  if (first === undefined) return null;
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length += 1;
  if (length > 8) return { value: 0, length: 1, unknown: false, invalid: true };
  if (offset + length > bytes.length) return null;
  let value = first & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let index = 1; index < length; index += 1) {
    const byte = bytes[offset + index];
    value = value * 256 + byte;
    if (byte !== 0xff) allOnes = false;
  }
  return { value, length, unknown: allOnes };
}

/** Element header at `offset`: { id, size, headerLength, unknownSize } or null if truncated. */
export function readElementHeader(bytes, offset) {
  const id = readElementId(bytes, offset);
  if (!id) return null;
  const size = readVint(bytes, offset + id.length);
  if (!size) return null;
  return { id: id.value, size: size.unknown ? -1 : size.value, headerLength: id.length + size.length, unknownSize: size.unknown };
}

function* elements(bytes, start, end) {
  let cursor = start;
  while (cursor < end) {
    const header = readElementHeader(bytes, cursor);
    if (!header || header.id < 0) return;
    const dataStart = cursor + header.headerLength;
    const dataEnd = header.unknownSize ? end : Math.min(end, dataStart + header.size);
    yield { id: header.id, start: dataStart, end: dataEnd };
    cursor = dataEnd;
  }
}

function readUint(bytes, start, end) {
  let value = 0;
  for (let cursor = start; cursor < end; cursor += 1) value = value * 256 + bytes[cursor];
  return value;
}

function readFloat(bytes, start, end) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, end - start);
  return end - start === 4 ? view.getFloat32(0) : end - start === 8 ? view.getFloat64(0) : 0;
}

function readString(bytes, start, end) {
  let text = "";
  try {
    text = new TextDecoder("utf-8").decode(bytes.subarray(start, end));
  } catch (_) {
    text = String.fromCharCode(...bytes.subarray(start, end));
  }
  let length = text.length;
  while (length > 0 && text.charCodeAt(length - 1) === 0) length -= 1;
  return text.slice(0, length).trim();
}

function parseSeekHead(bytes, node, positions) {
  for (const seek of elements(bytes, node.start, node.end)) {
    if (seek.id !== ID.Seek) continue;
    let id = 0;
    let position = -1;
    for (const field of elements(bytes, seek.start, seek.end)) {
      if (field.id === ID.SeekID) id = readUint(bytes, field.start, field.end);
      if (field.id === ID.SeekPosition) position = readUint(bytes, field.start, field.end);
    }
    if (id && position >= 0 && !positions.has(id)) positions.set(id, position);
  }
}

function parseInfo(bytes, node) {
  const info = { timecodeScale: 1000000, duration: 0 };
  for (const field of elements(bytes, node.start, node.end)) {
    if (field.id === ID.TimecodeScale) info.timecodeScale = readUint(bytes, field.start, field.end) || 1000000;
    if (field.id === ID.Duration) info.duration = readFloat(bytes, field.start, field.end);
  }
  return info;
}

function parseTrackEntry(bytes, node) {
  const track = {
    number: 0,
    type: 0,
    enabled: true,
    isDefault: true,
    forced: false,
    defaultDurationNs: 0,
    name: "",
    language: "eng",
    codecId: "",
    codecPrivate: null,
    width: 0,
    height: 0,
    sampleRate: 8000,
    channels: 1,
    headerStrip: null,
    unsupportedReason: ""
  };
  for (const field of elements(bytes, node.start, node.end)) {
    switch (field.id) {
      case ID.TrackNumber: track.number = readUint(bytes, field.start, field.end); break;
      case ID.TrackType: track.type = readUint(bytes, field.start, field.end); break;
      case ID.FlagEnabled: track.enabled = readUint(bytes, field.start, field.end) !== 0; break;
      case ID.FlagDefault: track.isDefault = readUint(bytes, field.start, field.end) !== 0; break;
      case ID.FlagForced: track.forced = readUint(bytes, field.start, field.end) !== 0; break;
      case ID.DefaultDuration: track.defaultDurationNs = readUint(bytes, field.start, field.end); break;
      case ID.Name: track.name = readString(bytes, field.start, field.end); break;
      case ID.Language: track.language = readString(bytes, field.start, field.end); break;
      case ID.LanguageBCP47: track.languageBcp47 = readString(bytes, field.start, field.end); break;
      case ID.CodecID: track.codecId = readString(bytes, field.start, field.end); break;
      case ID.CodecPrivate: track.codecPrivate = bytes.slice(field.start, field.end); break;
      case ID.Video:
        for (const video of elements(bytes, field.start, field.end)) {
          if (video.id === ID.PixelWidth) track.width = readUint(bytes, video.start, video.end);
          if (video.id === ID.PixelHeight) track.height = readUint(bytes, video.start, video.end);
        }
        break;
      case ID.Audio:
        for (const audio of elements(bytes, field.start, field.end)) {
          if (audio.id === ID.SamplingFrequency) track.sampleRate = readFloat(bytes, audio.start, audio.end);
          if (audio.id === ID.Channels) track.channels = readUint(bytes, audio.start, audio.end);
        }
        break;
      case ID.ContentEncodings:
        for (const encoding of elements(bytes, field.start, field.end)) {
          if (encoding.id !== ID.ContentEncoding) continue;
          for (const part of elements(bytes, encoding.start, encoding.end)) {
            if (part.id === ID.ContentEncryption) track.unsupportedReason = "encrypted";
            if (part.id !== ID.ContentCompression) continue;
            let algorithm = 0;
            let settings = null;
            for (const compression of elements(bytes, part.start, part.end)) {
              if (compression.id === ID.ContentCompAlgo) algorithm = readUint(bytes, compression.start, compression.end);
              if (compression.id === ID.ContentCompSettings) settings = bytes.slice(compression.start, compression.end);
            }
            if (algorithm === 3) track.headerStrip = settings;
            else track.unsupportedReason = "compressed";
          }
        }
        break;
      default:
        break;
    }
  }
  return track;
}

function parseCues(bytes, node, segmentStart) {
  const cues = [];
  for (const point of elements(bytes, node.start, node.end)) {
    if (point.id !== ID.CuePoint) continue;
    let time = -1;
    const positions = [];
    for (const field of elements(bytes, point.start, point.end)) {
      if (field.id === ID.CueTime) time = readUint(bytes, field.start, field.end);
      if (field.id !== ID.CueTrackPositions) continue;
      let track = 0;
      let cluster = -1;
      for (const position of elements(bytes, field.start, field.end)) {
        if (position.id === ID.CueTrack) track = readUint(bytes, position.start, position.end);
        if (position.id === ID.CueClusterPosition) cluster = readUint(bytes, position.start, position.end);
      }
      if (cluster >= 0) positions.push({ track, offset: segmentStart + cluster });
    }
    if (time >= 0 && positions.length) cues.push({ time, positions });
  }
  return cues.sort((a, b) => a.time - b.time);
}

// Frame duration guesses (in seconds) for laced blocks without DefaultDuration.
function codecFrameSeconds(track) {
  const rate = track.sampleRate || 48000;
  if (track.codecId.startsWith("A_AAC")) return 1024 / rate;
  if (track.codecId === "A_AC3" || track.codecId === "A_EAC3") return 1536 / rate;
  if (track.codecId === "A_MPEG/L3") return 1152 / rate;
  if (track.codecId === "A_OPUS") return 0.02;
  return 0;
}

/**
 * Splits a SimpleBlock/Block payload into frames.
 * @returns {{ trackNumber: number, timecode: number, keyframe: boolean, frames: Uint8Array[] } | null}
 */
export function parseBlock(bytes, start, end, simple) {
  const track = readVint(bytes, start);
  if (!track || start + track.length + 3 > end) return null;
  let cursor = start + track.length;
  let timecode = (bytes[cursor] << 8) | bytes[cursor + 1];
  if (timecode & 0x8000) timecode -= 0x10000;
  const flags = bytes[cursor + 2];
  cursor += 3;
  const keyframe = simple ? Boolean(flags & 0x80) : false;
  const lacing = (flags >> 1) & 3;
  if (lacing === 0) {
    return { trackNumber: track.value, timecode, keyframe, frames: [bytes.subarray(cursor, end)] };
  }
  const count = bytes[cursor] + 1;
  cursor += 1;
  const sizes = [];
  if (lacing === 1) {
    for (let index = 0; index < count - 1; index += 1) {
      let size = 0;
      let byte;
      do {
        byte = bytes[cursor];
        cursor += 1;
        size += byte;
      } while (byte === 255 && cursor < end);
      sizes.push(size);
    }
  } else if (lacing === 3) {
    const first = readVint(bytes, cursor);
    if (!first) return null;
    cursor += first.length;
    sizes.push(first.value);
    for (let index = 1; index < count - 1; index += 1) {
      const delta = readVint(bytes, cursor);
      if (!delta) return null;
      cursor += delta.length;
      const bias = 2 ** (7 * delta.length - 1) - 1;
      sizes.push(sizes[index - 1] + (delta.value - bias));
    }
  }
  const remaining = end - cursor;
  if (lacing === 2) {
    const each = Math.floor(remaining / count);
    for (let index = 0; index < count - 1; index += 1) sizes.push(each);
  }
  const used = sizes.reduce((sum, size) => sum + size, 0);
  sizes.push(remaining - used);
  if (sizes.some((size) => size < 0)) return null;
  const frames = [];
  for (const size of sizes) {
    frames.push(bytes.subarray(cursor, cursor + size));
    cursor += size;
  }
  return { trackNumber: track.value, timecode, keyframe, frames };
}

export async function openMatroska(source) {
  const head = await source.read(0, Math.min(source.size, 256 * 1024));
  const ebml = readElementHeader(head, 0);
  if (!ebml || ebml.id !== ID.EBML) throw new RemuxUnavailableError("not-matroska");
  let docType = "matroska";
  for (const field of elements(head, ebml.headerLength, ebml.headerLength + ebml.size)) {
    if (field.id === ID.DocType) docType = readString(head, field.start, field.end);
  }
  if (docType !== "matroska" && docType !== "webm") throw new RemuxUnavailableError("not-matroska");
  const segmentOffset = ebml.headerLength + ebml.size;
  const segment = readElementHeader(head, segmentOffset);
  if (!segment || segment.id !== ID.Segment) throw new RemuxUnavailableError("no-segment");
  const segmentStart = segmentOffset + segment.headerLength;
  const segmentEnd = segment.unknownSize ? source.size : Math.min(source.size, segmentStart + segment.size);

  const readElement = async (offset) => {
    const headerBytes = await source.read(offset, Math.min(segmentEnd, offset + 16));
    const header = readElementHeader(headerBytes, 0);
    if (!header) return null;
    return { ...header, offset, dataStart: offset + header.headerLength };
  };
  const loadElement = async (element) => {
    if (element.unknownSize || element.size > MAX_HEADER_ELEMENT_BYTES) return null;
    const bytes = await source.read(element.offset, element.dataStart + element.size);
    return { bytes, node: { start: element.headerLength, end: bytes.length } };
  };

  const seekPositions = new Map();
  let info = null;
  let tracks = null;
  let cues = null;
  let firstCluster = -1;
  for (let offset = segmentStart, guard = 0; offset < segmentEnd && guard < 4096; guard += 1) {
    const element = await readElement(offset);
    if (!element || element.id < 0) break;
    if (element.id === ID.Cluster) {
      firstCluster = offset;
      break;
    }
    if ([ID.SeekHead, ID.Info, ID.Tracks, ID.Cues].includes(element.id)) {
      const loaded = await loadElement(element);
      if (loaded) {
        if (element.id === ID.SeekHead) parseSeekHead(loaded.bytes, loaded.node, seekPositions);
        if (element.id === ID.Info) info = parseInfo(loaded.bytes, loaded.node);
        if (element.id === ID.Tracks) tracks = loaded;
        if (element.id === ID.Cues) cues = parseCues(loaded.bytes, loaded.node, segmentStart);
      }
    }
    if (element.unknownSize) break;
    offset = element.dataStart + element.size;
  }
  const loadBySeek = async (id) => {
    if (!seekPositions.has(id)) return null;
    const element = await readElement(segmentStart + seekPositions.get(id));
    return element && element.id === id ? loadElement(element) : null;
  };
  if (!info) {
    const loaded = await loadBySeek(ID.Info);
    info = loaded ? parseInfo(loaded.bytes, loaded.node) : { timecodeScale: 1000000, duration: 0 };
  }
  if (!tracks) tracks = await loadBySeek(ID.Tracks);
  if (!cues) {
    const loaded = await loadBySeek(ID.Cues);
    if (loaded) cues = parseCues(loaded.bytes, loaded.node, segmentStart);
  }
  if (!tracks) throw new RemuxUnavailableError("no-tracks");
  if (firstCluster < 0) throw new RemuxUnavailableError("no-clusters");

  const timescale = 1e9 / info.timecodeScale;
  const parsedTracks = [];
  for (const entry of elements(tracks.bytes, tracks.node.start, tracks.node.end)) {
    if (entry.id !== ID.TrackEntry) continue;
    const raw = parseTrackEntry(tracks.bytes, entry);
    const kind = raw.type === 1 ? "video" : raw.type === 2 ? "audio" : "";
    if (!kind || !raw.number) continue;
    const described = describeMatroskaCodec(raw);
    parsedTracks.push({
      ...raw,
      id: raw.number,
      kind,
      timescale,
      codec: described.codec,
      sampleEntry: raw.unsupportedReason ? null : described.sampleEntry,
      needsFrame: Boolean(described.needsFrame) && !raw.unsupportedReason,
      language: raw.languageBcp47 || (raw.language === "und" ? "" : raw.language),
      frameSeconds: raw.defaultDurationNs ? raw.defaultDurationNs / 1e9 : codecFrameSeconds(raw)
    });
  }

  const demuxer = {
    container: docType,
    source,
    durationSeconds: (info.duration || 0) / timescale,
    timescale,
    tracks: parsedTracks,
    cues: cues || [],
    firstCluster,
    segmentEnd,
    seekable: Boolean(cues && cues.length),
    createReader({ trackIds, startTime = 0, signal } = {}) {
      return readClusters(this, { trackIds, startTime, signal });
    },
    /** Fills in sample entries that depend on the first frame (AC-3, E-AC-3). */
    async resolveFrameDependentTracks({ signal } = {}) {
      const pending = this.tracks.filter((track) => track.needsFrame && !track.sampleEntry);
      if (!pending.length) return;
      const reader = this.createReader({ trackIds: pending.map((track) => track.id), startTime: 0, signal });
      let budget = 8;
      for await (const batch of reader) {
        for (const { track, samples } of batch) {
          if (track.sampleEntry || !samples.length) continue;
          track.sampleEntry = describeMatroskaCodec(track, samples[0].data).sampleEntry;
          track.needsFrame = false;
          if (!track.sampleEntry) track.unsupportedReason = "codec-header";
        }
        budget -= 1;
        if (pending.every((track) => !track.needsFrame) || budget <= 0) break;
      }
      for (const track of pending) {
        if (track.needsFrame) {
          track.needsFrame = false;
          track.unsupportedReason = track.unsupportedReason || "codec-header";
        }
      }
    }
  };
  return demuxer;
}

function startOffsetFor(demuxer, startTime) {
  if (!demuxer.cues.length || startTime <= 0) return demuxer.firstCluster;
  const target = startTime * demuxer.timescale;
  let offset = demuxer.firstCluster;
  for (const cue of demuxer.cues) {
    if (cue.time > target) break;
    offset = cue.positions[0].offset;
  }
  return offset;
}

/**
 * Reads clusters from the cue at or before `startTime` and yields batches of
 * { track, samples } with samples { data, pts (track timescale), sync }.
 */
async function* readClusters(demuxer, { trackIds, startTime, signal }) {
  const wanted = new Map(demuxer.tracks.filter((track) => trackIds.includes(track.id)).map((track) => [track.number, track]));
  let position = startOffsetFor(demuxer, startTime);
  let buffer = new Uint8Array(0);
  let bufferStart = position;
  let clusterTimecode = 0;
  let ended = false;

  const ensure = async (absoluteEnd) => {
    while (bufferStart + buffer.length < absoluteEnd && bufferStart + buffer.length < demuxer.segmentEnd) {
      const from = bufferStart + buffer.length;
      const chunk = await demuxer.source.read(from, Math.min(demuxer.segmentEnd, Math.max(absoluteEnd, from + CHUNK_BYTES)), { signal });
      if (!chunk.length) break;
      const merged = new Uint8Array(buffer.length + chunk.length);
      merged.set(buffer, 0);
      merged.set(chunk, buffer.length);
      buffer = merged;
    }
    return bufferStart + buffer.length >= absoluteEnd;
  };
  const drop = () => {
    if (position - bufferStart > CHUNK_BYTES) {
      buffer = buffer.slice(position - bufferStart);
      bufferStart = position;
    }
  };

  while (!ended && !signal?.aborted) {
    const batch = new Map();
    const batchStart = position;
    while (position - batchStart < CHUNK_BYTES) {
      if (position > bufferStart + buffer.length) {
        // Skipped past the buffer (Cues, Tags, attachments): don't download them.
        buffer = new Uint8Array(0);
        bufferStart = position;
      }
      if (position >= demuxer.segmentEnd || !(await ensure(position + 16))) {
        if (!(await ensure(position + 2))) {
          ended = true;
          break;
        }
      }
      const header = readElementHeader(buffer, position - bufferStart);
      if (!header || header.id < 0) {
        ended = true;
        break;
      }
      const dataStart = position + header.headerLength;
      if (header.id === ID.Cluster) {
        position = dataStart; // step inside; children are read at this level
        continue;
      }
      if (header.unknownSize) {
        ended = true;
        break;
      }
      const dataEnd = dataStart + header.size;
      if (header.id === ID.Timecode || header.id === ID.SimpleBlock || header.id === ID.BlockGroup) {
        if (!(await ensure(dataEnd))) {
          ended = true;
          break;
        }
        const local = (absolute) => absolute - bufferStart;
        if (header.id === ID.Timecode) {
          clusterTimecode = readUint(buffer, local(dataStart), local(dataEnd));
        } else {
          let block = null;
          let durationUnits = 0;
          let referenced = false;
          if (header.id === ID.SimpleBlock) {
            block = parseBlock(buffer, local(dataStart), local(dataEnd), true);
          } else {
            for (const field of elements(buffer, local(dataStart), local(dataEnd))) {
              if (field.id === ID.Block) block = parseBlock(buffer, field.start, field.end, false);
              if (field.id === ID.BlockDuration) durationUnits = readUint(buffer, field.start, field.end);
              if (field.id === ID.ReferenceBlock) referenced = true;
            }
            if (block) block.keyframe = !referenced;
          }
          const track = block && wanted.get(block.trackNumber);
          if (track) {
            const pts = clusterTimecode + block.timecode;
            const count = block.frames.length;
            const step = count > 1
              ? (durationUnits ? durationUnits / count : track.frameSeconds * demuxer.timescale)
              : 0;
            if (!batch.has(track)) batch.set(track, []);
            const list = batch.get(track);
            block.frames.forEach((frame, index) => {
              const data = track.headerStrip ? concat(track.headerStrip, frame) : frame.slice();
              list.push({ data, pts: pts + index * step, sync: track.kind === "audio" || (block.keyframe && index === 0) });
            });
          }
        }
        position = dataEnd;
      } else if (TOP_LEVEL.has(header.id) || header.size > 0) {
        // Cues, Tags and other elements between or after clusters: skip.
        position = dataEnd;
      } else {
        position = dataEnd;
      }
    }
    drop();
    if (batch.size) yield Array.from(batch, ([track, samples]) => ({ track, samples }));
  }
}

function concat(prefix, frame) {
  const out = new Uint8Array(prefix.length + frame.length);
  out.set(prefix, 0);
  out.set(frame, prefix.length);
  return out;
}

export const MATROSKA_IDS = ID;
