import test from "node:test";
import assert from "node:assert/strict";
import { assessSourceForDevice, orderSourcesByNativePrediction, toggleSourcePlaybackFailure } from "./sourcePreference.js";

const source = (id, extra = {}) => ({ id, url: `https://fixture.invalid/${id}?token=private`, mimeType: 'video/mp4; codecs="avc1.640028,mp4a.40.2"', ...extra });
const environment = { videoElement: { canPlayType: () => "probably" } };
const assess = (stream, options = {}) => assessSourceForDevice(stream, { environment, now: Date.parse("2026-10-21T00:00:00Z"), ...options });
const ids = (streams) => streams.map((stream) => stream.id);

test("complete native configuration outranks false 4K marketing without changing source objects", () => {
  const unknown = source("unknown", { mimeType: null, name: "4K Dolby Vision TrueHD" });
  const native = source("1080p");
  const streams = [unknown, native];
  const before = JSON.stringify(streams);
  assert.equal(assess(native).route, "browser");
  assert.equal(assess(unknown).route, "unknown");
  assert.deepEqual(orderSourcesByNativePrediction(streams, { environment }), [native, unknown]);
  assert.equal(JSON.stringify(streams), before);
});


test("MKV and TrueHD cannot be promoted by an optimistic browser probe", () => {
  assert.equal(assess(source("mkv", { mimeType: 'video/x-matroska; codecs="hvc1.2.4.L153.B0,mp4a.40.2"' })).reason, "mkv");
  assert.equal(assess(source("truehd", { audioTracks: [{ codec: "truehd" }] })).reason, "truehd");
});

test("HEVC Main10 prediction varies with the injected platform, not UA or resolution", () => {
  const hevc = source("hevc", { mimeType: 'video/mp4; codecs="hvc1.2.4.L153.B0,mp4a.40.2"' });
  assert.equal(assess(hevc).route, "browser");
  assert.equal(assess(hevc, { environment: { videoElement: { canPlayType: () => "" } } }).route, "external");
  assert.equal(assess(hevc, { environment: {} }).route, "unknown");
  assert.equal(assess(source("alias", { video: { codec: "hevc" } })).route, "unknown");
  assert.equal(assess(source("malformed", { mimeType: 'video/mp4; codecs="hvc1.banana,mp4a.40.2"' })).route, "unknown");
});

test("only explicit Dolby Vision profile5 is eligible; output is never certified", () => {
  const dv = (codec, hdr = "dolby-vision") => source("dv", { mimeType: `video/mp4; codecs="${codec},mp4a.40.2"`, video: { codec, hdr } });
  assert.equal(assess(dv("dvhe.05.06")).route, "browser");
  assert.match(assess(dv("dvhe.05.06")).explanation, /HDR output unverified/);
  for (const codec of ["dvhe.07.06", "dvh1.08.06"]) assert.equal(assess(dv(codec)).reason, "dv-profile");
  assert.equal(assess(dv("dvh1.08.06")).route, "unknown");
  assert.equal(assess(dv("hvc1.2.4.L153.B0")).route, "unknown");
});

test("missing and conflicting video/audio declarations stay unknown", () => {
  for (const extra of [
    { mimeType: "video/mp4" },
    { mimeType: 'video/mp4; codecs="avc1.640028"' },
    { video: { codec: "vp8" } },
    { audioTracks: [{ codec: "mystery" }] },
    { audioTracks: [{}] },
    { mimeType: null, name: "4K HDR HEVC TrueHD" }
  ]) assert.equal(assess(source("incomplete", extra)).route, "unknown");
  assert.equal(assess(source("aac", { mimeType: "video/mp4", video: { codec: "avc1.640028" }, audioTracks: [{ codec: "mp4a.40.2" }] })).route, "browser");
});

test("every header map wins over forged descriptors and optimistic predictions", () => {
  for (const extra of [
    { headers: { Cookie: "private" } },
    { requestHeaders: { Unknown: "" } },
    { behaviorHints: { proxyHeaders: { request: { Authorization: "private" } } } },
    { raw: { requestHeaders: { Referer: "private" } } },
    { sourceDescriptor: { requiredHeaderCount: 1 } }
  ]) {
    const report = assess(source("headers", extra));
    assert.equal(report.route, "proxy");
    assert.match(report.explanation, /own proxy.*requires headers/);
    assert.doesNotMatch(JSON.stringify(report), /private|fixture.invalid|Authorization|Referer|Cookie/);
  }
});

test("expired, unavailable delivery and adaptive routes are honest and retained", () => {
  assert.equal(assess(source("expired", { expiresAt: "2026-01-01T00:00:00Z" })).route, "blocked");
  assert.equal(assess(source("provider", { behaviorHints: { notWebReady: true } })).route, "blocked");
  assert.equal(assess(source("magnet", { url: "magnet:?xt=fixture" })).route, "blocked");
  assert.equal(assess(source("credentials", { url: "https://user:secret@fixture.invalid/" })).route, "blocked");
  for (const extension of ["m3u8", "mpd"]) assert.equal(assess(source("adaptive", { url: `https://fixture.invalid/stream.${extension}` })).route, "unknown");
});

test("reversible failure correction is local, source-specific and survives shallow Back snapshots", () => {
  const stream = source("failure", { raw: {} });
  toggleSourcePlaybackFailure(stream);
  assert.equal(assess({ ...stream }).reason, "reported-failure");
  assert.equal(assess(source("same-id")).route, "browser");
  assert.equal(assess({ ...stream, raw: {} }).route, "browser");
  toggleSourcePlaybackFailure({ ...stream });
  assert.equal(assess(stream).route, "browser");
});

test("stable tiers preserve all source identities, requirements and provider tie order", () => {
  const streams = [source("unknown", { mimeType: null }), source("proxy", { headers: { X: "private" } }), source("mkv", { mimeType: "video/x-matroska" }), source("first"), source("expired", { expiresAt: "2020-01-01T00:00:00Z" }), source("second")];
  const before = JSON.stringify(streams);
  const ranked = orderSourcesByNativePrediction(streams, { environment });
  assert.deepEqual(ids(ranked), ["first", "second", "mkv", "unknown", "proxy", "expired"]);
  assert.equal(JSON.stringify(streams), before);
  for (const stream of streams) assert.ok(ranked.includes(stream));
  assert.deepEqual(orderSourcesByNativePrediction(null), []);
});

test("probe failures and platform changes never reuse a global positive cache", () => {
  const streams = [source("a"), source("b")];
  let calls = 0;
  const changing = { videoElement: { canPlayType: () => { calls++; return calls === 1 ? "probably" : ""; } } };
  orderSourcesByNativePrediction(streams, { environment: changing });
  assert.equal(calls, 1);
  orderSourcesByNativePrediction(streams, { environment: changing });
  assert.equal(calls, 2);
  for (const videoElement of [{}, { canPlayType: () => true }, { canPlayType() { throw new Error("private"); } }]) {
    assert.equal(assess(streams[0], { environment: { videoElement } }).route, "unknown");
  }
});


test("a supplied descriptor cannot erase contradictory raw media declarations", () => {
  const sourceDescriptor = { contentType: 'video/mp4; codecs="avc1.640028,mp4a.40.2"', transportHint: "direct", video: {}, audioTracks: [] };
  for (const raw of [{ video: { codec: "hvc1.2.4.L153.B0" } }, { video: { hdr: "dolby-vision" } }, { audioTracks: [{ codec: "ec-3" }] }]) {
    assert.equal(assess(source("forged", { ...raw, sourceDescriptor })).reason, "descriptor-conflict");
  }
});
