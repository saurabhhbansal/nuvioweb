import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { RemuxUnavailableError, createMemorySource, openHttpSource } from "./byteSource.js";
import { fourcc, readI32, readU32 } from "./bytes.js";
import {
  aacObjectType,
  av1CodecString,
  avcCodecString,
  hevcCodecString,
  parseAc3Frame,
  vp9CodecString
} from "./codecs.js";
import { createInitSegment, createMediaSegment } from "./fmp4.js";
import { openMatroska, parseBlock } from "./mkvDemuxer.js";
import { openMp4 } from "./mp4Demuxer.js";
import { describeRemuxSource, sniffContainer } from "./remuxAudio.js";
import { createTrackWriter } from "./trackWriter.js";

// Original CC0 fixtures, see tests/fixtures/media/multi-audio/README.md.
const fixture = (name) =>
  readFileSync(new URL(`../../../../../../tests/fixtures/media/multi-audio/${name}`, import.meta.url));

function topBoxes(bytes, start = 0, end = bytes.length) {
  const out = [];
  for (let cursor = start; cursor + 8 <= end; ) {
    const size = readU32(bytes, cursor);
    out.push({ type: fourcc(bytes, cursor + 4), start: cursor, size });
    if (size < 8) break;
    cursor += size;
  }
  return out;
}

function findBox(bytes, typePath, start = 0, end = bytes.length) {
  const [type, ...rest] = typePath;
  for (const node of topBoxes(bytes, start, end)) {
    if (node.type !== type) continue;
    if (!rest.length) return node;
    return findBox(bytes, rest, node.start + 8, node.start + node.size);
  }
  return null;
}

async function collect(demuxer, trackIds, startTime = 0) {
  const byTrack = new Map();
  for await (const batch of demuxer.createReader({ trackIds, startTime })) {
    for (const { track, samples } of batch) {
      if (!byTrack.has(track.id)) byTrack.set(track.id, []);
      byTrack.get(track.id).push(...samples);
    }
  }
  return byTrack;
}

test("container sniffing recognises MP4 and Matroska headers", () => {
  assert.equal(sniffContainer(fixture("multi-audio.mp4").subarray(0, 64)), "mp4");
  assert.equal(sniffContainer(fixture("multi-audio.mkv").subarray(0, 64)), "matroska");
  assert.equal(sniffContainer(fixture("multi-audio.webm").subarray(0, 64)), "matroska");
  assert.equal(sniffContainer(new TextEncoder().encode("#EXTM3U\n")), "");
});

test("MP4 demuxer finds the moov at the end and lists every track", async () => {
  const demuxer = await openMp4(createMemorySource(fixture("multi-audio.mp4")));
  assert.ok(Math.abs(demuxer.durationSeconds - 6) < 0.2);
  const summary = demuxer.tracks.map(({ kind, codec, language, name }) => ({ kind, codec, language, name }));
  assert.deepEqual(summary, [
    { kind: "video", codec: "avc1.64000c", language: "", name: "" },
    { kind: "audio", codec: "mp4a.40.2", language: "eng", name: "English" },
    { kind: "audio", codec: "opus", language: "fra", name: "Français" },
    { kind: "audio", codec: "ac-3", language: "deu", name: "Deutsch AC-3" }
  ]);
  const video = demuxer.tracks[0];
  assert.equal(video.samples.count, 60);
  assert.ok(video.samples.sync.reduce((sum, flag) => sum + flag, 0) >= 6, "a keyframe at least every second");
  assert.ok(video.editShift > 0, "B-frames give the video an edit-list shift");
});

test("MP4 reader returns every sample once and starts at a keyframe", async () => {
  const demuxer = await openMp4(createMemorySource(fixture("multi-audio.mp4")));
  const ids = demuxer.tracks.map((track) => track.id);
  const all = await collect(demuxer, ids);
  demuxer.tracks.forEach((track) => assert.equal(all.get(track.id).length, track.samples.count, track.codec));
  const fromMiddle = await collect(demuxer, [1, 3], 2.5);
  const firstVideo = fromMiddle.get(1)[0];
  assert.equal(firstVideo.sync, true);
  const video = demuxer.tracks[0];
  const pts = (firstVideo.dts + firstVideo.compositionOffset - video.editShift) / video.timescale;
  assert.ok(pts <= 2.5 && pts > 1, `keyframe at ${pts}s`);
  assert.ok(fromMiddle.get(3)[0].dts / 48000 <= pts + 0.05);
});

test("Matroska demuxer reads tracks, cues and AC-3 headers", async () => {
  const demuxer = await openMatroska(createMemorySource(fixture("multi-audio.mkv")));
  await demuxer.resolveFrameDependentTracks();
  assert.equal(demuxer.container, "matroska");
  assert.ok(demuxer.seekable && demuxer.cues.length >= 5);
  assert.deepEqual(
    demuxer.tracks.map(({ kind, codecId, codec, language, name }) => ({ kind, codecId, codec, language, name })),
    [
      { kind: "video", codecId: "V_MPEG4/ISO/AVC", codec: "avc1.64000c", language: "", name: "" },
      { kind: "audio", codecId: "A_AAC", codec: "mp4a.40.2", language: "eng", name: "English" },
      { kind: "audio", codecId: "A_OPUS", codec: "opus", language: "fra", name: "Français" },
      { kind: "audio", codecId: "A_AC3", codec: "ac-3", language: "deu", name: "Deutsch AC-3" }
    ]
  );
  const ac3 = demuxer.tracks[3].sampleEntry;
  assert.equal(fourcc(ac3, 4), "ac-3");
  assert.ok(findBox(ac3, ["dac3"], 36, ac3.length), "dac3 box built from the first frame");
  const opus = demuxer.tracks[2].sampleEntry;
  assert.ok(findBox(opus, ["dOps"], 36, opus.length));
});

test("WebM is read as Matroska with VP9 and Opus", async () => {
  const demuxer = await openMatroska(createMemorySource(fixture("multi-audio.webm")));
  assert.equal(demuxer.container, "webm");
  assert.deepEqual(demuxer.tracks.map((track) => track.codec), ["vp09.00.11.08", "opus", "opus"]);
});

test("Matroska reader returns all frames and seeks by cues", async () => {
  const demuxer = await openMatroska(createMemorySource(fixture("multi-audio.mkv")));
  const all = await collect(demuxer, [1, 2]);
  assert.equal(all.get(1).length, 60);
  assert.ok(all.get(1).filter((frame) => frame.sync).length >= 6);
  const fromMiddle = await collect(demuxer, [1], 3.5);
  assert.equal(fromMiddle.get(1)[0].sync, true);
  const firstSeconds = fromMiddle.get(1)[0].pts / demuxer.timescale;
  assert.ok(firstSeconds <= 3.5 && firstSeconds > 2, `cluster at ${firstSeconds}s`);
});

test("rebuilt Matroska decode times keep presentation order and stay monotonic", async () => {
  const demuxer = await openMatroska(createMemorySource(fixture("multi-audio.mkv")));
  const frames = (await collect(demuxer, [1])).get(1);
  const writer = createTrackWriter(demuxer.tracks[0], demuxer);
  const segments = [...writer.push(frames), ...writer.flush()];
  assert.ok(writer.shiftKnown && writer.presentationShift > 0, "B-frames need a presentation shift");
  // Read the trun entries back.
  let previousDts = -Infinity;
  const presented = [];
  for (const { bytes } of segments) {
    const tfdt = findBox(bytes, ["moof", "traf", "tfdt"]);
    let dts = readU32(bytes, tfdt.start + 12) * 2 ** 32 + readU32(bytes, tfdt.start + 16);
    const trun = findBox(bytes, ["moof", "traf", "trun"]);
    const count = readU32(bytes, trun.start + 12);
    for (let index = 0; index < count; index += 1) {
      const entry = trun.start + 20 + index * 16;
      const duration = readU32(bytes, entry);
      const offset = readI32(bytes, entry + 12);
      assert.ok(offset >= 0, "composition offsets are never negative");
      assert.ok(dts > previousDts);
      previousDts = dts;
      presented.push(dts + offset - writer.presentationShift * writer.timescale);
      dts += duration;
    }
  }
  const original = frames.map((frame) => frame.pts).sort((a, b) => a - b);
  assert.deepEqual([...presented].sort((a, b) => a - b).map(Math.round), original.map(Math.round));
});

test("fMP4 init and media segments have the boxes MSE expects", () => {
  const sampleEntry = new Uint8Array([0, 0, 0, 8, 0x6d, 0x70, 0x34, 0x61]);
  const init = createInitSegment({ kind: "audio", timescale: 48000, sampleEntry, language: "fra" });
  assert.deepEqual(topBoxes(init).map((node) => node.type), ["ftyp", "moov"]);
  assert.ok(findBox(init, ["moov", "trak", "mdia", "minf", "stbl", "stsd"]));
  assert.ok(findBox(init, ["moov", "mvex", "trex"]));

  const samples = [
    { data: new Uint8Array([1, 2, 3]), duration: 1024, sync: true },
    { data: new Uint8Array([4, 5]), duration: 1024, sync: true }
  ];
  const segment = createMediaSegment({ sequenceNumber: 7, baseMediaDecodeTime: 2 ** 33, samples });
  const [moof, mdat] = topBoxes(segment);
  assert.equal(moof.type, "moof");
  assert.equal(mdat.type, "mdat");
  const trun = findBox(segment, ["moof", "traf", "trun"]);
  assert.equal(readU32(segment, trun.start + 12), 2);
  assert.equal(readI32(segment, trun.start + 16), moof.size + 8, "data offset points at the mdat payload");
  assert.deepEqual(Array.from(segment.subarray(mdat.start + 8)), [1, 2, 3, 4, 5]);
  const tfdt = findBox(segment, ["moof", "traf", "tfdt"]);
  assert.equal(readU32(segment, tfdt.start + 12), 2);
});

test("block lacing: Xiph, EBML and fixed-size frames split correctly", () => {
  const header = [0x81, 0x00, 0x10]; // track 1, timecode 16
  const frames = [new Uint8Array(300).fill(1), new Uint8Array(5).fill(2), new Uint8Array(7).fill(3)];
  const xiph = new Uint8Array([...header, 0x80 | 0x02, 2, 255, 45, 5, ...frames[0], ...frames[1], ...frames[2]]);
  const parsedXiph = parseBlock(xiph, 0, xiph.length, true);
  assert.equal(parsedXiph.timecode, 16);
  assert.equal(parsedXiph.keyframe, true);
  assert.deepEqual(parsedXiph.frames.map((frame) => frame.length), [300, 5, 7]);

  // EBML lacing: first size 300 as a 2-byte vint, then signed delta -295 (5).
  const delta = -295 + 8191; // bias for 2-byte signed vint
  const ebml = new Uint8Array([...header, 0x06, 2, 0x41, 0x2c, 0x40 | (delta >> 8), delta & 0xff, ...frames[0], ...frames[1], ...frames[2]]);
  assert.deepEqual(parseBlock(ebml, 0, ebml.length, true).frames.map((frame) => frame.length), [300, 5, 7]);

  const fixed = new Uint8Array([...header, 0x04, 2, ...new Uint8Array(12)]);
  assert.deepEqual(parseBlock(fixed, 0, fixed.length, true).frames.map((frame) => frame.length), [4, 4, 4]);
});

test("codec strings come from the configuration records", () => {
  assert.equal(avcCodecString(new Uint8Array([1, 0x64, 0x00, 0x1f])), "avc1.64001f");
  const hvcC = new Uint8Array([1, 0x01, 0x60, 0, 0, 0, 0x90, 0, 0, 0, 0, 0, 93]);
  assert.equal(hevcCodecString(hvcC), "hvc1.1.6.L93.90");
  assert.equal(av1CodecString(new Uint8Array([0x81, 0x08, 0x0c, 0])), "av01.0.08M.08");
  assert.equal(vp9CodecString(new Uint8Array([1, 0, 0, 0, 0, 31, 0x80])), "vp09.00.31.08");
  assert.equal(aacObjectType(new Uint8Array([0x11, 0x90])), 2);
  assert.equal(aacObjectType(new Uint8Array([0x2b, 0x92, 0x08, 0x00])), 5);
});

test("AC-3 frame headers are parsed from the fixture", async () => {
  const demuxer = await openMatroska(createMemorySource(fixture("multi-audio.mkv")));
  const frames = (await collect(demuxer, [4])).get(4);
  const info = parseAc3Frame(frames[0].data);
  assert.equal(info.sampleRate, 48000);
  assert.equal(info.acmod, 2);
  assert.equal(info.bsid, 8);
});

test("describeRemuxSource offers only files with several audio tracks", async (t) => {
  // Node has no Media Source Extensions: pretend AAC/Opus/H.264 are accepted.
  globalThis.MediaSource = { isTypeSupported: (mime) => !/ac-3/.test(mime) };
  t.after(() => delete globalThis.MediaSource);
  const description = await describeRemuxSource(createMemorySource(fixture("multi-audio.mkv")));
  assert.equal(description.audioTracks.length, 3);
  assert.equal(description.nativeIndex, 0);
  assert.deepEqual(description.audioTracks.map((track) => track.label), ["English", "Français", "Deutsch AC-3"]);
  assert.deepEqual(description.audioTracks.map((track) => track.playable), [true, true, false]);
  await assert.rejects(
    describeRemuxSource(createMemorySource(new TextEncoder().encode("not a media file at all, just text"))),
    (error) => error instanceof RemuxUnavailableError && error.reason === "container"
  );
});

function fakeResponse(status, body, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
  };
}

function rangeFetch(bytes, { exposeRange = true, honourRange = true } = {}) {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(init);
    if (init.method === "HEAD") return fakeResponse(200, new Uint8Array(0), { "Content-Length": bytes.length });
    const match = /bytes=(\d+)-(\d+)/.exec(init.headers.Range || "");
    if (!match || !honourRange) return fakeResponse(200, bytes, { "Content-Length": bytes.length });
    const start = Number(match[1]);
    const end = Math.min(bytes.length - 1, Number(match[2]));
    return fakeResponse(206, bytes.subarray(start, end + 1), exposeRange ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` } : {});
  };
  return { fetchImpl, calls };
}

test("HTTP source reads ranges, without credentials, and learns the size", async () => {
  const bytes = fixture("multi-audio.webm");
  const { fetchImpl, calls } = rangeFetch(bytes);
  const source = await openHttpSource("https://media.example.invalid/file.webm", { fetchImpl });
  assert.equal(source.size, bytes.length);
  assert.equal(calls[0].credentials, "omit");
  assert.equal(calls[0].mode, "cors");
  const slice = await source.read(70000, 70010);
  assert.deepEqual(Array.from(slice), Array.from(bytes.subarray(70000, 70010)));
});

test("HTTP source falls back to HEAD when Content-Range is not exposed", async () => {
  const bytes = fixture("multi-audio.webm");
  const { fetchImpl, calls } = rangeFetch(bytes, { exposeRange: false });
  const source = await openHttpSource("https://media.example.invalid/file.webm", { fetchImpl });
  assert.equal(source.size, bytes.length);
  assert.equal(calls[1].method, "HEAD");
});

test("HTTP source reports why a host can't be used", async () => {
  const bytes = fixture("multi-audio.webm");
  await assert.rejects(
    openHttpSource("https://a.invalid/x", { fetchImpl: rangeFetch(bytes, { honourRange: false }).fetchImpl }),
    (error) => error.reason === "no-range"
  );
  await assert.rejects(
    openHttpSource("https://a.invalid/x", { fetchImpl: async () => { throw new TypeError("Failed to fetch"); } }),
    (error) => error.reason === "cors"
  );
  await assert.rejects(
    openHttpSource("https://a.invalid/x", { fetchImpl: async () => fakeResponse(403, new Uint8Array(0)) }),
    (error) => error.reason === "http"
  );
});
