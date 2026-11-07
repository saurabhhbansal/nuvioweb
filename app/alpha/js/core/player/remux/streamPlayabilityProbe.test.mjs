import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createMemorySource } from "./byteSource.js";
import { inspectSourcePlayability, probeStreamPlayability } from "./remuxAudio.js";
import { classifyStreamProbe } from "../../streams/streamPlayability.js";

function fixture(name) {
  return new Uint8Array(
    readFileSync(new URL(`../../../../../../tests/fixtures/media/multi-audio/${name}`, import.meta.url))
  );
}

// Node has no Media Source Extensions: accept what Chromium accepts, minus AC-3.
function fakeMse(t, accept = (mime) => !/ac-3|ec-3/.test(mime)) {
  globalThis.MediaSource = { isTypeSupported: accept };
  t.after(() => delete globalThis.MediaSource);
}

async function label(name, { canTranscode = true } = {}) {
  const report = await inspectSourcePlayability(createMemorySource(fixture(name)), {
    canTranscode: async () => canTranscode
  });
  return { report, hint: classifyStreamProbe(report) };
}

test("a file whose first audio track plays is labelled as playing here", async (t) => {
  fakeMse(t);
  for (const name of ["multi-audio.mp4", "multi-audio.mkv", "multi-audio.webm", "eac3-surround.mkv"]) {
    const { hint } = await label(name);
    assert.equal(hint.reason, "plays-here", name);
    assert.equal(hint.tone, "positive");
  }
  assert.equal((await label("multi-audio.mkv")).hint.detail, "H.264 · AAC");
});

test("an AC-3 first track is labelled by what the player can do with it", async (t) => {
  fakeMse(t);
  const converted = await label("ac3-first.mp4");
  assert.equal(converted.hint.reason, "audio-converted");
  assert.equal(converted.hint.detail, "H.264 · AC-3");
  assert.deepEqual(
    converted.report.audio.map((track) => [track.codec, track.playable, track.convertible]),
    [
      ["ac-3", false, true],
      ["mp4a.40.2", true, false]
    ]
  );
  // Without conversion the AAC track is still there to switch to...
  assert.equal((await label("ac3-first.mp4", { canTranscode: false })).hint.reason, "change-audio");
  // ...and a file with only AC-3 plays silent.
  assert.equal((await label("ac3-only.mkv", { canTranscode: false })).hint.reason, "no-sound");
  assert.equal((await label("ac3-only.mkv")).hint.reason, "audio-converted");
});

test("Matroska AC-3 counts as playable where MSE accepts it, without reading a frame", async (t) => {
  fakeMse(t, () => true);
  const { report, hint } = await label("ac3-only.mkv");
  assert.equal(report.audio[0].playable, true);
  assert.equal(hint.reason, "plays-here");
});

test("a video codec this browser rejects is labelled before any audio question", async (t) => {
  fakeMse(t, (mime) => !mime.startsWith("video/"));
  const { report, hint } = await label("multi-audio.mkv");
  assert.equal(report.video.playable, false);
  assert.equal(report.switchable, false);
  assert.equal(hint.reason, "video-unplayable");
  assert.equal(hint.tone, "warning");
});

function rangeFetch(bytes, log) {
  return async (_url, init = {}) => {
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(init.headers.Range);
    const slice = bytes.subarray(Number(start), Math.min(bytes.length, Number(end) + 1));
    log.push(slice.length);
    return {
      status: 206,
      headers: { get: (name) => (name.toLowerCase() === "content-range" ? `bytes ${start}-${end}/${bytes.length}` : null) },
      arrayBuffer: async () => slice.slice().buffer
    };
  };
}

test("the HTTP check reads only the header and stops at its byte budget", async (t) => {
  fakeMse(t);
  const bytes = fixture("multi-audio.mkv");
  const log = [];
  const report = await probeStreamPlayability("https://media.example.invalid/a.mkv", {
    fetchImpl: rangeFetch(bytes, log),
    canTranscode: async () => true
  });
  assert.equal(classifyStreamProbe(report).reason, "plays-here");
  // Header reads only: the opening 64 KiB, the 256 KiB Matroska head and a few
  // small element reads, whatever the file's size.
  assert.ok(log.reduce((sum, size) => sum + size, 0) <= 64 * 1024 + 256 * 1024 + 16 * 1024);

  await assert.rejects(
    probeStreamPlayability("https://media.example.invalid/a.mkv", {
      fetchImpl: rangeFetch(bytes, []),
      byteBudget: 1024
    }),
    (error) => error.reason === "probe-budget"
  );
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    probeStreamPlayability("https://media.example.invalid/a.mkv", {
      fetchImpl: rangeFetch(bytes, []),
      signal: aborted.signal
    })
  );
});
