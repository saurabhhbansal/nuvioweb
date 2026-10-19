import test from "node:test";
import assert from "node:assert/strict";
import {
  describeSource,
  normalizeSourceDescriptor,
  probeNativeSource,
  probeSourceCapabilities,
  selectSourceContentType
} from "./sourceCapabilities.js";

const declared = () =>
  describeSource({
    url: "https://fixture.invalid/original.webm?token=private-query",
    mimeType: 'video/webm; codecs="vp8,opus"',
    video: { codec: "vp8", width: 3840, height: 2160, bitrate: 100000, framerate: 10 },
    audioTracks: [{ codec: "opus", language: "eng", channels: 2 }],
    subtitles: [
      {
        lang: "eng",
        format: "vtt",
        url: "https://fixture.invalid/captions?secret=private-subtitle"
      }
    ],
    behaviorHints: { proxyHeaders: { request: { Authorization: "private-header" } } },
    expiresAt: "2026-01-01T00:00:00Z"
  });

test("titles, filenames, extensions and quality strings cannot invent codec/resolution/HDR", () => {
  const source = describeSource({
    name: "4K HDR HEVC Atmos",
    quality: "2160p",
    url: "https://fixture.invalid/4k-hevc.mp4",
    behaviorHints: { filename: "HDR.2160p.mkv" }
  });
  assert.equal(source.contentType, null);
  assert.equal(source.container, null);
  assert.deepEqual(source.video, {
    codec: null,
    width: null,
    height: null,
    bitrate: null,
    framerate: null,
    hdr: null
  });
  assert.equal(
    probeNativeSource(source, {
      canPlayType() {
        throw new Error("must not probe an invented type");
      }
    }),
    "unknown"
  );
  assert.equal(
    describeSource({ url: "https://fixture.invalid/anything.m3u8?token=secret" }).transportHint,
    "hls"
  );
  assert.equal(describeSource(null).video.codec, null);
});

test("explicit declarations survive without URL, subtitle-query or request-header secrets", () => {
  const source = declared();
  assert.equal(source.evidence, "provider-declared");
  assert.equal(source.video.width, 3840);
  assert.equal(source.video.height, 2160);
  assert.equal(source.video.hdr, null);
  assert.equal(source.container, "webm");
  assert.equal(source.requiredHeaderCount, 1);
  assert.equal(source.expiresAt, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(source.subtitleTracks, [{ language: "eng", format: "vtt" }]);
  assert.doesNotMatch(JSON.stringify(source), /private-|Authorization|https:/);
  const invalid = describeSource({
    mimeType: "<img src=x>",
    video: { codec: "<script>", width: NaN, height: -1, framerate: "60", hdr: "x".repeat(200) },
    audioTracks: Array(100).fill(null),
    expiresAt: "not-a-date"
  });
  assert.equal(invalid.contentType, null);
  assert.equal(invalid.video.codec, null);
  assert.equal(invalid.video.width, null);
  assert.equal(invalid.video.framerate, null);
  assert.equal(invalid.audioTracks.length, 32);
  assert.equal(invalid.expiresAt, null);
});

test("native reports preserve maybe/probably/negative/unknown without declaring overall compatibility", () => {
  for (const [value, expected] of [
    ["probably", "probably"],
    ["maybe", "maybe"],
    ["", "not-reported"],
    [true, "unknown"]
  ]) {
    assert.equal(probeNativeSource(declared(), { canPlayType: () => value }), expected);
  }
  assert.equal(probeNativeSource(declared()), "unknown");
  assert.equal(
    probeNativeSource(declared(), {
      canPlayType() {
        throw new Error("unavailable");
      }
    }),
    "unknown"
  );
});

test("video decoding prediction preserves exact declared4K configuration without mutating metadata", async () => {
  const descriptor = declared();
  const before = JSON.stringify(descriptor);
  let configuration;
  const report = await probeSourceCapabilities(descriptor, {
    mediaCapabilities: {
      async decodingInfo(value) {
        configuration = value;
        return { supported: true, smooth: false, powerEfficient: false };
      }
    }
  });
  assert.deepEqual(configuration, {
    type: "file",
    video: {
      contentType: 'video/webm; codecs="vp8"',
      width: 3840,
      height: 2160,
      bitrate: 100000,
      framerate: 10
    }
  });
  assert.deepEqual(report.videoDecoding, { supported: true, smooth: false, powerEfficient: false });
  assert.match(report.scope, /audio\/HDR\/output unverified/);
  assert.equal(report.evidence, "browser-prediction");
  assert.equal(JSON.stringify(descriptor), before);
  assert.doesNotMatch(JSON.stringify(configuration), /private-|Authorization|keySystem|1920|1080/);
});

test("missing configuration/API, rejected and hanging probes are bounded unknown outcomes", async () => {
  const source = declared();
  assert.equal((await probeSourceCapabilities(source)).decodingStatus, "unknown");
  assert.equal(
    (
      await probeSourceCapabilities(
        { ...source, video: { ...source.video, bitrate: null } },
        {
          mediaCapabilities: {
            decodingInfo() {
              throw new Error("must not invent bitrate");
            }
          }
        }
      )
    ).decodingStatus,
    "unknown"
  );
  assert.equal(
    (
      await probeSourceCapabilities(source, {
        mediaCapabilities: {
          decodingInfo() {
            throw new Error("provider-secret-must-not-escape");
          }
        }
      })
    ).decodingStatus,
    "unavailable"
  );
  const report = await probeSourceCapabilities(source, {
    timeoutMs: 5,
    mediaCapabilities: { decodingInfo: () => new Promise(() => {}) }
  });
  assert.equal(report.decodingStatus, "unavailable");
  assert.equal(report.videoDecoding, null);
});

test("forged internal descriptors are normalized before rendering or capability probing", async () => {
  const forged = {
    contentType: "video/https://fixture.invalid?token=private-query",
    video: {
      codec: "https://fixture.invalid?token=private-codec",
      hdr: "x".repeat(10000),
      width: "3840"
    },
    audioTracks: Array(100).fill({ codec: "https://fixture.invalid?token=private-audio" }),
    subtitleTracks: [{ language: "https://fixture.invalid?token=private-subtitle" }],
    requiredHeaderCount: "private-header",
    expiresAt: "private-expiry",
    transportHint: "private-url"
  };
  const source = normalizeSourceDescriptor(forged);
  assert.equal(source.contentType, null);
  assert.equal(source.video.codec, null);
  assert.equal(source.video.hdr, null);
  assert.equal(source.video.width, null);
  assert.equal(source.audioTracks.length, 32);
  assert.equal(source.requiredHeaderCount, 0);
  assert.equal(source.transportHint, "unknown");
  assert.doesNotMatch(JSON.stringify(source), /private-|https:/);
  let probed = false;
  const report = await probeSourceCapabilities(forged, {
    videoElement: {
      canPlayType() {
        probed = true;
        return "probably";
      }
    }
  });
  assert.equal(report.native, "unknown");
  assert.equal(probed, false);
  assert.equal(normalizeSourceDescriptor({ requiredHeaderCount: 100000 }).requiredHeaderCount, 256);
});

test("selectSourceContentType prefers a validated media type over provider aliases", () => {
  // A short alias must not shadow the declared MIME type that carries the
  // container declaration the startup classifier needs.
  assert.equal(
    selectSourceContentType(["mkv", 'video/x-matroska; codecs="hvc1"']),
    'video/x-matroska; codecs="hvc1"'
  );
  assert.equal(
    selectSourceContentType(["hls", "application/vnd.apple.mpegurl"]),
    "application/vnd.apple.mpegurl"
  );
  assert.equal(
    selectSourceContentType([null, undefined, "", "  ", 'video/mp4; codecs="avc1.640028"']),
    'video/mp4; codecs="avc1.640028"'
  );
  // No validated type means no evidence at all, never a guess from an alias.
  assert.equal(selectSourceContentType(["mkv", "hls", "mp4"]), "");
  assert.equal(selectSourceContentType([]), "");
  assert.equal(selectSourceContentType(null), "");
  // Hostile values are rejected by the same validator describeSource uses.
  assert.equal(selectSourceContentType(['video/mp4; codecs="<script>"', "video/mp4"]), "video/mp4");
  assert.equal(selectSourceContentType(["javascript:alert(1)"]), "");
});
