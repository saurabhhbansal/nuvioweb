import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyStartupFailure,
  isUnsupportedStartupFailure,
  STARTUP_FAILURE_CATEGORIES,
  STARTUP_FAILURE_REASONS
} from "./startupFailure.js";
import { describeSource } from "../streams/sourceCapabilities.js";

const matroska = describeSource({
  url: "https://media.example.invalid/movie.mkv",
  mimeType: 'video/x-matroska; codecs="hvc1"',
  video: { codec: "hvc1", width: 3840, height: 2160 }
});

const mp4Hevc = describeSource({
  url: "https://media.example.invalid/movie.mp4",
  mimeType: 'video/mp4; codecs="hvc1"',
  video: { codec: "hvc1", width: 3840, height: 2160 }
});

const mp4H264 = describeSource({
  url: "https://media.example.invalid/movie.mp4",
  mimeType: 'video/mp4; codecs="avc1.640028"',
  video: { codec: "avc1.640028", width: 1920, height: 1080 }
});

const hls = describeSource({
  url: "https://media.example.invalid/master.m3u8",
  mimeType: "application/vnd.apple.mpegurl"
});

const headerRestricted = {
  ...describeSource({
    url: "https://media.example.invalid/webdl.mkv",
    mimeType: 'video/x-matroska; codecs="hvc1"',
    video: { codec: "hvc1" },
    behaviorHints: { notWebReady: true, proxyHeaders: { request: { Authorization: "x" } } }
  })
};

const declaredContainer = (mimeType) =>
  describeSource({ url: "https://m.example.invalid/a", mimeType });

test("matroska rejected by the engine is an unsupported container, not a stall", () => {
  const result = classifyStartupFailure({
    descriptor: matroska,
    nativePrediction: "not-reported",
    engine: "native-file",
    timedOut: true
  });
  assert.equal(result.reason, STARTUP_FAILURE_REASONS.UNSUPPORTED_CONTAINER);
  assert.equal(result.category, STARTUP_FAILURE_CATEGORIES.UNSUPPORTED);
  assert.equal(result.evidence, "native-not-reported");
  assert.equal(result.container, "matroska");
});

test("matroska surfaced as a stall after an engine media error is also an unsupported container", () => {
  const result = classifyStartupFailure({
    descriptor: matroska,
    nativePrediction: "unknown",
    engine: "native-file",
    mediaErrorCode: 4,
    timedOut: true
  });
  assert.equal(result.reason, STARTUP_FAILURE_REASONS.UNSUPPORTED_CONTAINER);
  assert.equal(result.evidence, "media-error");
});

test("a declared non-web container is container evidence even without a mapped name", () => {
  const result = classifyStartupFailure({
    descriptor: declaredContainer("video/x-msvideo"),
    nativePrediction: "not-reported",
    engine: "native-file"
  });
  assert.equal(result.reason, STARTUP_FAILURE_REASONS.UNSUPPORTED_CONTAINER);
  assert.equal(result.container, "video/x-msvideo");
});

test("HEVC in an MP4 container is an unsupported codec, not a container failure", () => {
  const result = classifyStartupFailure({
    descriptor: mp4Hevc,
    nativePrediction: "not-reported",
    engine: "native-file",
    timedOut: true
  });
  assert.equal(result.reason, STARTUP_FAILURE_REASONS.UNSUPPORTED_CODEC);
  assert.equal(result.codec, "hvc1");
  assert.equal(result.container, null);
});

test("a predicted-playable source is never classified unsupported", () => {
  for (const prediction of ["probably", "maybe"]) {
    // A predicted-playable source that raised a media error keeps the engine-error
    // reason; one that only timed out keeps the retry-friendly stall reason.
    const errored = classifyStartupFailure({
      descriptor: mp4Hevc,
      nativePrediction: prediction,
      engine: "native-file",
      mediaErrorCode: 4
    });
    assert.notEqual(errored.category, STARTUP_FAILURE_CATEGORIES.UNSUPPORTED, prediction);
    assert.equal(errored.reason, STARTUP_FAILURE_REASONS.STARTUP_MEDIA_ERROR, prediction);

    const stalled = classifyStartupFailure({
      descriptor: mp4Hevc,
      nativePrediction: prediction,
      engine: "native-file",
      timedOut: true
    });
    assert.notEqual(stalled.category, STARTUP_FAILURE_CATEGORIES.UNSUPPORTED, prediction);
    assert.equal(stalled.reason, STARTUP_FAILURE_REASONS.STARTUP_STALL, prediction);
  }
});

test("a supported control source that only stalled stays a genuine stall", () => {
  const result = classifyStartupFailure({
    descriptor: mp4H264,
    nativePrediction: "probably",
    engine: "native-file",
    timedOut: true
  });
  assert.equal(result.reason, STARTUP_FAILURE_REASONS.STARTUP_STALL);
  assert.equal(result.category, STARTUP_FAILURE_CATEGORIES.STALL);
});

test("adaptive transports never get an unsupported container claim", () => {
  for (const engine of ["hls.js", "dash.js"]) {
    const result = classifyStartupFailure({
      descriptor: hls,
      nativePrediction: "not-reported",
      engine,
      timedOut: true
    });
    assert.equal(result.reason, STARTUP_FAILURE_REASONS.STARTUP_STALL, engine);
    assert.notEqual(result.category, STARTUP_FAILURE_CATEGORIES.UNSUPPORTED, engine);
  }
  const nativeHls = classifyStartupFailure({
    descriptor: hls,
    nativePrediction: "not-reported",
    engine: "native-file",
    timedOut: true
  });
  assert.equal(nativeHls.reason, STARTUP_FAILURE_REASONS.STARTUP_STALL);
});

test("header-required wins over every media verdict because the source was never requested correctly", () => {
  const result = classifyStartupFailure({
    descriptor: headerRestricted,
    nativePrediction: "not-reported",
    engine: "native-file",
    mediaErrorCode: 4,
    timedOut: true,
    headerRequired: true
  });
  assert.equal(result.reason, STARTUP_FAILURE_REASONS.HEADER_REQUIRED);
  assert.equal(result.category, STARTUP_FAILURE_CATEGORIES.HEADER_REQUIRED);
  assert.equal(result.evidence, "provider-declared");
  assert.equal(isUnsupportedStartupFailure(result), true);
});

test("a network failure is never relabelled as unsupported", () => {
  const statusResult = classifyStartupFailure({
    descriptor: matroska,
    nativePrediction: "not-reported",
    engine: "native-file",
    mediaErrorCode: 4,
    httpStatus: 403,
    timedOut: true
  });
  assert.equal(statusResult.reason, STARTUP_FAILURE_REASONS.NETWORK);
  assert.equal(statusResult.httpStatus, 403);

  const netResult = classifyStartupFailure({
    descriptor: matroska,
    nativePrediction: "not-reported",
    engine: "native-file",
    mediaErrorCode: 2,
    timedOut: true
  });
  assert.equal(netResult.reason, STARTUP_FAILURE_REASONS.NETWORK);

  const abortResult = classifyStartupFailure({
    descriptor: matroska,
    nativePrediction: "not-reported",
    engine: "native-file",
    mediaErrorCode: 1
  });
  assert.equal(abortResult.reason, STARTUP_FAILURE_REASONS.ABORTED);
});

test("an error page or unparsable manifest stays a source fault", () => {
  for (const detail of [
    "HlsError: manifestParsingError",
    "the server returned text/html",
    "<!doctype html><title>403</title>"
  ]) {
    const result = classifyStartupFailure({
      descriptor: matroska,
      nativePrediction: "not-reported",
      engine: "native-file",
      mediaErrorCode: 4,
      detail,
      timedOut: true
    });
    assert.equal(result.reason, STARTUP_FAILURE_REASONS.INVALID_CONTENT, detail);
  }
});

test("a decode failure without descriptor evidence is reported as a decode error", () => {
  const result = classifyStartupFailure({
    engine: "native-file",
    mediaErrorCode: 3,
    detail: "PIPELINE_ERROR_DECODE"
  });
  assert.equal(result.reason, STARTUP_FAILURE_REASONS.DECODE_ERROR);
  assert.equal(result.category, STARTUP_FAILURE_CATEGORIES.DECODE);
});

test("an unknown source or empty evidence never claims unsupported", () => {
  const unknown = classifyStartupFailure({ engine: "native-file", timedOut: true });
  assert.equal(unknown.reason, STARTUP_FAILURE_REASONS.STARTUP_STALL);
  assert.equal(unknown.evidence, "startup-timeout");

  const empty = classifyStartupFailure();
  assert.equal(empty.reason, STARTUP_FAILURE_REASONS.STARTUP_UNKNOWN);
  assert.equal(empty.category, STARTUP_FAILURE_CATEGORIES.UNKNOWN);
  assert.equal(isUnsupportedStartupFailure(empty), false);

  const runtime = classifyStartupFailure({
    engine: "native-file",
    detail: "NotAllowedError: play() failed",
    mediaErrorCode: 0
  });
  assert.equal(runtime.reason, STARTUP_FAILURE_REASONS.STARTUP_MEDIA_ERROR);
});

test("the element-error path keeps its distinct source-error reason", () => {
  const result = classifyStartupFailure({ engine: "native-file", sourceElementError: true });
  assert.equal(result.reason, STARTUP_FAILURE_REASONS.STARTUP_SOURCE_ERROR);
});

test("the classifier bounds hostile input and never throws", () => {
  const hostile = {
    descriptor: {
      contentType: 'video/mp4; codecs="' + "<script>".repeat(60) + '"',
      video: { codec: "<svg onload=alert(1)>".repeat(20) },
      transportHint: "javascript:alert(1)"
    },
    nativePrediction: "definitely".repeat(40),
    engine: { toString: () => "native-file" },
    mediaErrorCode: "4",
    detail: "<img src=x onerror=alert(1)>".repeat(200),
    httpStatus: "not-a-status",
    headerRequired: "true",
    timedOut: "yes",
    sourceElementError: 1
  };
  const result = classifyStartupFailure(hostile);
  assert.equal(typeof result.reason, "string");
  assert.equal(typeof result.category, "string");
  assert.ok(String(result.reason).length <= 40);
  assert.ok(String(result.container ?? "").length <= 200);
  assert.ok(String(result.codec ?? "").length <= 200);
  assert.doesNotMatch(JSON.stringify(result), /<script|<svg|<img/);
});

test("a non-integer or out-of-range media code is treated as absent", () => {
  for (const mediaErrorCode of [0, -1, 5, 4.5, NaN, "boom", null, undefined]) {
    const result = classifyStartupFailure({ engine: "native-file", mediaErrorCode });
    assert.equal(result.reason, STARTUP_FAILURE_REASONS.STARTUP_UNKNOWN, String(mediaErrorCode));
  }
});

test("transport wording in the runtime detail never becomes an unsupported verdict", () => {
  for (const detail of [
    "TypeError: Failed to fetch",
    "net::ERR_CONNECTION_RESET",
    "NetworkError when attempting to fetch resource",
    "request timed out"
  ]) {
    const result = classifyStartupFailure({
      descriptor: matroska,
      nativePrediction: "not-reported",
      engine: "native-file",
      mediaErrorCode: 4,
      detail,
      timedOut: true
    });
    assert.equal(result.reason, STARTUP_FAILURE_REASONS.NETWORK, detail);
    assert.equal(result.evidence, "runtime-detail", detail);
  }
});

test("a detail too long to inspect cannot produce an unsupported verdict", () => {
  const detail = `${"x".repeat(1100)} invalid content`;
  const stalled = classifyStartupFailure({
    descriptor: matroska,
    nativePrediction: "not-reported",
    engine: "native-file",
    mediaErrorCode: 4,
    detail,
    timedOut: true
  });
  assert.equal(stalled.reason, STARTUP_FAILURE_REASONS.STARTUP_STALL);
  assert.notEqual(stalled.category, STARTUP_FAILURE_CATEGORIES.UNSUPPORTED);

  const errored = classifyStartupFailure({
    descriptor: matroska,
    nativePrediction: "not-reported",
    engine: "native-file",
    mediaErrorCode: 4,
    detail
  });
  assert.equal(errored.reason, STARTUP_FAILURE_REASONS.STARTUP_MEDIA_ERROR);
  assert.notEqual(errored.category, STARTUP_FAILURE_CATEGORIES.UNSUPPORTED);
});

test("a MIME-only codec declaration is still codec evidence", () => {
  const descriptor = describeSource({
    url: "https://media.example.invalid/movie.mp4",
    mimeType: 'video/mp4; codecs="hvc1"'
  });
  assert.equal(descriptor.video.codec, null);
  const result = classifyStartupFailure({
    descriptor,
    nativePrediction: "not-reported",
    engine: "native-file"
  });
  assert.equal(result.reason, STARTUP_FAILURE_REASONS.UNSUPPORTED_CODEC);
  assert.equal(result.codec, "hvc1");
});

test("a MIME-only container declaration is still container evidence", () => {
  const descriptor = describeSource({
    url: "https://media.example.invalid/movie.mkv",
    mimeType: "video/x-matroska"
  });
  const result = classifyStartupFailure({
    descriptor,
    nativePrediction: "not-reported",
    engine: "native-file",
    timedOut: true
  });
  assert.equal(result.reason, STARTUP_FAILURE_REASONS.UNSUPPORTED_CONTAINER);
});

test("uninspectable detail values cannot produce an unsupported verdict", () => {
  // An Error or a boxed String can carry text we never see, so neither may be
  // treated as a fully inspected detail.
  for (const detail of [new Error("Failed to fetch"), new String("x".repeat(1100))]) {
    const result = classifyStartupFailure({
      descriptor: matroska,
      nativePrediction: "not-reported",
      engine: "native-file",
      mediaErrorCode: 4,
      detail
    });
    assert.notEqual(result.category, STARTUP_FAILURE_CATEGORIES.UNSUPPORTED, String(detail));
  }
  // A short Error message is still readable as a marker.
  const error = classifyStartupFailure({
    descriptor: matroska,
    nativePrediction: "not-reported",
    engine: "native-file",
    mediaErrorCode: 4,
    detail: new Error("TypeError: Failed to fetch")
  });
  assert.equal(error.reason, STARTUP_FAILURE_REASONS.NETWORK);
});

test("a generic load-failure word next to a codec rejection stays a codec verdict", () => {
  const result = classifyStartupFailure({
    descriptor: mp4Hevc,
    nativePrediction: "not-reported",
    engine: "native-file",
    mediaErrorCode: 4,
    detail: "Unsupported codec hvc1; load failed"
  });
  assert.equal(result.reason, STARTUP_FAILURE_REASONS.UNSUPPORTED_CODEC);
  assert.equal(result.evidence, "native-not-reported");
});
