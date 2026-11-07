import assert from "node:assert/strict";
import test from "node:test";

import {
  canCheckPlayabilityHere,
  cachedPlayabilityHint,
  classifyStreamProbe,
  clearPlayabilityResults,
  createPlayabilityQueue,
  friendlyCodecName,
  playabilityProbeUrl,
  rememberPlayability
} from "./streamPlayability.js";

test("classification follows what the player does with the first audio track", () => {
  const video = { codec: "avc1.64001f", playable: true };
  const aac = { codec: "mp4a.40.2", playable: true };
  const ac3 = { codec: "ac-3", channels: 6, playable: false, convertible: true };
  const dts = { codec: "dts", playable: false, convertible: false };
  const reason = (probe) => classifyStreamProbe(probe).reason;
  assert.equal(reason({ video, audio: [aac], switchable: true }), "plays-here");
  assert.equal(reason({ video, audio: [], switchable: true }), "plays-here");
  assert.equal(reason({ video, audio: [ac3, aac], switchable: true }), "audio-converted");
  assert.equal(reason({ video, audio: [dts, aac], switchable: true }), "change-audio");
  assert.equal(reason({ video, audio: [dts], switchable: true }), "no-sound");
  // A Matroska file without a seek index can't be replayed with another track.
  assert.equal(reason({ video, audio: [ac3, aac], switchable: false }), "no-sound");
  assert.equal(reason({ video: { codec: "hvc1", playable: false }, audio: [aac] }), "video-unplayable");
  assert.equal(classifyStreamProbe({ video, audio: [ac3] }).detail, "H.264 · AC-3 5.1");
  assert.equal(classifyStreamProbe(null), null);
});

test("codec names are the ones people know", () => {
  assert.deepEqual(
    ["hev1.1.6.L93", "av01.0.08M.08", "vp09.00.10.08", "ec-3", "mp4a.6B", "fLaC", "a_truehd"].map(friendlyCodecName),
    ["HEVC", "AV1", "VP9", "E-AC-3", "MP3", "FLAC", "TrueHD"]
  );
});

test("only plain files without required headers are checked", () => {
  assert.equal(playabilityProbeUrl({ url: "https://cdn.example.invalid/a.mkv" }), "https://cdn.example.invalid/a.mkv");
  assert.equal(playabilityProbeUrl({ url: "https://cdn.example.invalid/a.m3u8" }), "");
  assert.equal(playabilityProbeUrl({ url: "https://cdn.example.invalid/a.mpd?x=1" }), "");
  assert.equal(playabilityProbeUrl({ url: "magnet:?xt=urn:btih:abc" }), "");
  assert.equal(playabilityProbeUrl({ infoHash: "abc" }), "");
  assert.equal(
    playabilityProbeUrl({
      url: "https://cdn.example.invalid/a.mkv",
      behaviorHints: { proxyHeaders: { request: { Referer: "https://example.invalid" } } }
    }),
    ""
  );
});

test("the check runs only where the remux player decides playback", () => {
  const MediaSource = { isTypeSupported: () => true };
  const fetch = () => {};
  assert.equal(canCheckPlayabilityHere({ HTMLMediaElement: { prototype: {} }, MediaSource, fetch }), true);
  // Safari lists tracks itself.
  assert.equal(
    canCheckPlayabilityHere({ HTMLMediaElement: { prototype: { audioTracks: null } }, MediaSource, fetch }),
    false
  );
  assert.equal(canCheckPlayabilityHere({ HTMLMediaElement: { prototype: {} }, fetch }), false);
});

test("cached hints are found by the stream's URL", () => {
  clearPlayabilityResults();
  const stream = { url: "https://cdn.example.invalid/b.mkv" };
  assert.equal(cachedPlayabilityHint(stream), null);
  rememberPlayability(stream.url, { reason: "no-sound" });
  assert.deepEqual(cachedPlayabilityHint({ raw: stream }), { reason: "no-sound" });
  clearPlayabilityResults();
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

test("the queue runs a few at a time, once per URL, focused cards first", async () => {
  clearPlayabilityResults();
  const started = [];
  const gates = new Map();
  const results = [];
  const queue = createPlayabilityQueue({
    concurrency: 2,
    probe: (url) => {
      started.push(url);
      const gate = deferred();
      gates.set(url, gate);
      return gate.promise;
    },
    onResult: (url, hint) => results.push([url, hint?.reason || null])
  });
  const tick = () => new Promise((done) => setTimeout(done, 0));
  queue.add(["a", "b", "c", "d"]);
  await tick();
  assert.deepEqual(started, ["a", "b"]);
  queue.add(["d"], { first: true });
  queue.add(["a", "b"]);
  gates.get("a").resolve({ video: { codec: "avc1", playable: true }, audio: [] });
  await tick();
  assert.deepEqual(started, ["a", "b", "d"]);
  // A failed probe is answered too (no label), so it isn't retried.
  gates.get("b").resolve(Promise.reject(new Error("cors")));
  await tick();
  assert.deepEqual(results, [
    ["a", "plays-here"],
    ["b", null]
  ]);
  queue.add(["a", "b"]);
  await tick();
  assert.deepEqual(started, ["a", "b", "d", "c"]);
  queue.close();
  gates.get("d").resolve({ video: null, audio: [] });
  await tick();
  // Closed: a late answer isn't recorded or reported.
  assert.equal(results.length, 2);
  assert.equal(cachedPlayabilityHint({ url: "d" }), null);
  clearPlayabilityResults();
});
