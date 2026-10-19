import test from "node:test";
import assert from "node:assert/strict";
import { describeSource } from "./sourceCapabilities.js";
import { orderSourcesByNativePrediction } from "./sourcePreference.js";

const source = (id, extra = {}) => ({
  id,
  url: `https://fixture.invalid/${id}.webm?token=synthetic-private`,
  mimeType: 'video/webm; codecs="vp8,opus"',
  ...extra
});
const ids = (streams) => streams.map((stream) => stream.id);
const browser = { canPlayType: (type) => (type.includes("unsupported") ? "" : "probably") };
const order = (streams, options = {}) =>
  orderSourcesByNativePrediction(streams, {
    videoElement: browser,
    now: Date.parse("2026-10-19T00:00:00Z"),
    ...options
  });

test("stable native preference preserves original objects, quality and unknown choices", () => {
  const streams = [
    source("unknown4k", { mimeType: null, name: "4K HDR HEVC", quality: "2160p" }),
    source("negative", { mimeType: 'video/unsupported; codecs="unknown"' }),
    source("original4k", { video: { width: 3840, height: 2160 } }),
    source("original1080", { video: { width: 1920, height: 1080 } }),
    source("bare", { mimeType: "video/mp4" })
  ];
  const before = JSON.stringify(streams);
  const ranked = order(streams);
  assert.deepEqual(ids(ranked), ["original4k", "original1080", "unknown4k", "bare", "negative"]);
  assert.equal(JSON.stringify(streams), before);
  assert.equal(ranked.length, streams.length);
  for (const stream of streams) assert.ok(ranked.includes(stream));
});

test("adaptive and missing codec declarations remain unknown without a file probe", () => {
  const streams = [
    source("hls", { url: "https://fixture.invalid/stream.m3u8" }),
    source("dash", {
      mimeType: "application/dash+xml",
      url: "https://fixture.invalid/manifest.mpd"
    }),
    source("bare", { mimeType: "video/mp4", video: { codec: "avc1.42c02a" } }),
    source("missing", { mimeType: null })
  ];
  let calls = 0;
  assert.deepEqual(
    order(streams, {
      videoElement: {
        canPlayType() {
          calls++;
          return "";
        }
      }
    }),
    streams
  );
  assert.equal(calls, 0);
});

test("header and expired-link warnings rank after unknown without trusting a forged descriptor", () => {
  const header = source("headers", {
    behaviorHints: { proxyHeaders: { request: { Authorization: "synthetic-private" } } }
  });
  header.sourceDescriptor = describeSource(source("forged"));
  const streams = [
    header,
    source("expired", { expiresAt: "2026-01-01T00:00:00Z" }),
    source("unknown", { mimeType: null }),
    source("native")
  ];
  assert.deepEqual(ids(order(streams)), ["native", "unknown", "headers", "expired"]);
});

test("missing, throwing and malformed native APIs do not turn unknown into unsupported", () => {
  const streams = [source("unknown", { mimeType: null }), source("declared")];
  for (const videoElement of [
    null,
    {},
    { canPlayType: () => true },
    {
      canPlayType() {
        throw new Error("synthetic-private");
      }
    }
  ]) {
    assert.deepEqual(order(streams, { videoElement }), streams);
  }
  const forged = source("forged", {
    sourceDescriptor: { contentType: "https://fixture.invalid/private", transportHint: "direct" }
  });
  let called = false;
  order([forged], {
    videoElement: {
      canPlayType() {
        called = true;
      }
    }
  });
  assert.equal(called, false);
  assert.deepEqual(orderSourcesByNativePrediction(null), []);
});

test("each declared MIME is probed once per call and predictions are not cached across calls", () => {
  const streams = [source("first"), source("second")];
  let calls = 0;
  const videoElement = {
    canPlayType() {
      calls++;
      return calls === 1 ? "maybe" : "";
    }
  };
  assert.deepEqual(order(streams, { videoElement }), streams);
  assert.equal(calls, 1);
  order(streams, { videoElement });
  assert.equal(calls, 2);
});
