// Text subtitles inside a Matroska file (SRT, ASS/SSA, WebVTT), read in the
// browser from the file's own host with small range requests.
//
// A movie's subtitle lines are spread through gigabytes of clusters, so the
// whole track is never read. Matroska writers (mkvmerge, FFmpeg) index every
// subtitle block in the Cues with its cluster, its position inside the cluster
// and its duration; the player asks for the lines around the playback position
// and only those blocks are fetched. A file without that index offers no
// embedded subtitles here.

import { MATROSKA_IDS as ID, parseBlock, readElementHeader } from "./mkvDemuxer.js";

export const TEXT_SUBTITLE_CODECS = Object.freeze({
  "S_TEXT/UTF8": "srt",
  "S_TEXT/ASS": "ass",
  "S_TEXT/SSA": "ass",
  "S_TEXT/WEBVTT": "vtt"
});

// A subtitle block is a line or two of text; read this much and parse it.
const BLOCK_READ_BYTES = 4096;
// Blocks closer than this inside one cluster come in one read.
const MERGE_GAP_BYTES = 64 * 1024;
const DEFAULT_LINE_SECONDS = 4;

/** Subtitle tracks this module can show: text codecs with indexed blocks. */
export function listTextSubtitleTracks(demuxer) {
  if (!demuxer || !Array.isArray(demuxer.tracks)) return [];
  return demuxer.tracks
    .filter((track) => track.kind === "subtitle" && TEXT_SUBTITLE_CODECS[track.codecId])
    .filter((track) => track.compressionAlgorithm == null || [0, 3].includes(track.compressionAlgorithm))
    .map((track) => ({ track, index: subtitleCueIndex(demuxer, track.number) }))
    .filter(({ index }) => index.length > 0)
    .map(({ track, index }) => ({
      id: track.number,
      label: track.name || "",
      language: track.language === "und" ? "" : track.language || "",
      codec: TEXT_SUBTITLE_CODECS[track.codecId],
      forced: Boolean(track.forced),
      isDefault: Boolean(track.isDefault),
      lineCount: index.length
    }));
}

/** Every indexed block of one subtitle track, in time order (seconds). */
export function subtitleCueIndex(demuxer, trackNumber) {
  const scale = demuxer?.timescale || 1000;
  const entries = [];
  for (const cue of demuxer?.cues || []) {
    for (const position of cue.positions || []) {
      if (position.track !== trackNumber || position.relative == null) continue;
      entries.push({
        start: cue.time / scale,
        duration: position.duration ? position.duration / scale : 0,
        cluster: position.offset,
        relative: position.relative
      });
    }
  }
  return entries.sort((a, b) => a.start - b.start || a.cluster - b.cluster || a.relative - b.relative);
}

/** Readable text for one block, as safe cue text (no markup but <i>, <b>, <u>). */
export function subtitleText(payload, codec) {
  let text = new TextDecoder("utf-8").decode(payload);
  if (codec === "ass") {
    // Matroska ASS blocks: ReadOrder, Layer, Style, Name, MarginL, MarginR, MarginV, Effect, Text
    const fields = text.split(",");
    text = fields.length >= 9 ? fields.slice(8).join(",") : text;
    text = text
      .replace(/\{[^}]*\}/g, "")
      .replace(/\\[Nn]/g, "\n")
      .replace(/\\h/g, " ");
  }
  return text
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(?!\/?(i|b|u)>)[^>]*>/gi, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&(?!(amp|lt|gt|nbsp|#\d+);)/g, "&amp;")
    .trim();
}

async function inflate(bytes) {
  if (typeof DecompressionStream !== "function") throw new Error("zlib subtitles need DecompressionStream");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// One element at `at` in `bytes`: a SimpleBlock, or a BlockGroup holding a Block
// and maybe its BlockDuration.
function readBlockElement(bytes, at) {
  const header = readElementHeader(bytes, at);
  if (!header || header.unknownSize) return null;
  const start = at + header.headerLength;
  const end = start + header.size;
  if (end > bytes.length) return { needed: end - at };
  if (header.id === ID.SimpleBlock) {
    const block = parseBlock(bytes, start, end, true);
    return block ? { frame: block.frames[0], duration: 0 } : null;
  }
  if (header.id !== ID.BlockGroup) return null;
  let frame = null;
  let duration = 0;
  for (let cursor = start; cursor < end; ) {
    const child = readElementHeader(bytes, cursor);
    if (!child || child.unknownSize) break;
    const childStart = cursor + child.headerLength;
    const childEnd = Math.min(end, childStart + child.size);
    if (child.id === ID.Block) frame = parseBlock(bytes, childStart, childEnd, false)?.frames[0] || null;
    if (child.id === ID.BlockDuration) {
      for (let index = childStart; index < childEnd; index += 1) duration = duration * 256 + bytes[index];
    }
    cursor = childEnd;
  }
  return frame ? { frame, duration } : null;
}

/**
 * Loads one embedded text track's lines lazily. `load(from, to)` resolves the
 * lines that start in [from, to) and weren't returned before.
 */
export function createEmbeddedSubtitleLoader(demuxer, trackNumber) {
  const track = demuxer.tracks.find((candidate) => candidate.number === trackNumber);
  const codec = TEXT_SUBTITLE_CODECS[track?.codecId];
  if (!track || !codec) throw new Error("Not an embedded text subtitle track");
  const index = subtitleCueIndex(demuxer, trackNumber);
  const scale = demuxer.timescale || 1000;
  const done = new Set();
  const clusterData = new Map();

  const clusterDataStart = async (offset, signal) => {
    if (!clusterData.has(offset)) {
      clusterData.set(
        offset,
        demuxer.source.read(offset, offset + 16, { signal }).then((bytes) => {
          const header = readElementHeader(bytes, 0);
          if (!header || header.id !== ID.Cluster) throw new Error("Subtitle cue does not point at a cluster");
          return offset + header.headerLength;
        })
      );
    }
    try {
      return await clusterData.get(offset);
    } catch (error) {
      clusterData.delete(offset);
      throw error;
    }
  };

  const payloadOf = async (frame) => {
    let data = frame;
    if (track.compressionAlgorithm === 0) data = await inflate(data);
    if (track.headerStrip) data = concat(track.headerStrip, data);
    return data;
  };

  async function readGroup(group, signal) {
    const dataStart = await clusterDataStart(group[0].cluster, signal);
    const from = dataStart + group[0].relative;
    const to = Math.min(demuxer.source.size, dataStart + group[group.length - 1].relative + BLOCK_READ_BYTES);
    const bytes = await demuxer.source.read(from, to, { signal });
    const lines = [];
    for (const entry of group) {
      const at = dataStart + entry.relative - from;
      let parsed = readBlockElement(bytes, at);
      if (parsed?.needed) {
        const start = dataStart + entry.relative;
        parsed = readBlockElement(await demuxer.source.read(start, start + parsed.needed, { signal }), 0);
      }
      if (!parsed?.frame) continue;
      const text = subtitleText(await payloadOf(parsed.frame), codec);
      if (!text) continue;
      const duration = entry.duration || (parsed.duration ? parsed.duration / scale : DEFAULT_LINE_SECONDS);
      lines.push({ start: entry.start, end: entry.start + duration, text });
    }
    return lines;
  }

  return {
    trackNumber,
    codec,
    lineCount: index.length,
    async load(fromSeconds, toSeconds, { signal } = {}) {
      const wanted = index.filter(
        (entry) =>
          entry.start + (entry.duration || DEFAULT_LINE_SECONDS) >= fromSeconds &&
          entry.start < toSeconds &&
          !done.has(`${entry.cluster}:${entry.relative}`)
      );
      // Group by cluster, then by nearness, so one read covers several lines.
      const groups = [];
      for (const entry of [...wanted].sort((a, b) => a.cluster - b.cluster || a.relative - b.relative)) {
        const last = groups[groups.length - 1];
        const previous = last?.[last.length - 1];
        if (previous && previous.cluster === entry.cluster && entry.relative - previous.relative < MERGE_GAP_BYTES) {
          last.push(entry);
        } else {
          groups.push([entry]);
        }
      }
      const lines = [];
      for (const group of groups) {
        signal?.throwIfAborted?.();
        lines.push(...(await readGroup(group, signal)));
        group.forEach((entry) => done.add(`${entry.cluster}:${entry.relative}`));
      }
      return lines.sort((a, b) => a.start - b.start);
    }
  };
}
