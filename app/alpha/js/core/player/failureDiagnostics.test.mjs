import test from "node:test";
import assert from "node:assert/strict";
import { diagnosePlaybackFailure as diagnose, exportPlaybackDiagnostic } from "./failureDiagnostics.js";
import { describeSource } from "../streams/sourceCapabilities.js";
const descriptor = (mimeType = 'video/mp4; codecs="hvc1.2.4.L153.B0"', extra = {}) => describeSource({ mimeType, video: { codec: "hvc1.2.4.L153.B0" }, ...extra });
const base = { engine: "native-file", nativePrediction: "not-reported", readyState: 0, networkState: 3, mediaErrorCode: 4 };
for (const [name, input, cause, confidence] of [
  ["MKV negative native prediction", { descriptor: descriptor('video/x-matroska; codecs="hvc1.2.4.L153.B0"') }, "unsupported-container", "predicted"],
  ["TrueHD declared with rejection", { descriptor: descriptor(undefined, { audioTracks: [{ codec: "truehd" }] }) }, "unsupported-audio", "predicted"],
  ["exact codec config", { descriptor: descriptor() }, "unsupported-codec-config", "predicted"],
  ["headers outrank formats", { descriptor: descriptor(), headerRequired: true, httpStatus: 403 }, "header-required", "observed"],
  ["source access", { descriptor: descriptor(), httpStatus: 403 }, "source-access", "observed"],
  ["gone not proven expiry", { httpStatus: 410 }, "source-expired-or-gone", "observed"],
  ["server failure", { descriptor: descriptor(), httpStatus: 503 }, "provider-or-transport", "observed"],
  ["media transport", { descriptor: descriptor(), mediaErrorCode: 2 }, "provider-or-transport", "observed"],
  ["range response", { httpStatus: 416, phase: "seek" }, "range-rejected", "observed"],
  ["page response", { responseContentType: "text/html" }, "invalid-media-response", "observed"],
  ["activation", { activationRejected: true }, "activation-required", "observed"],
  ["aborted", { mediaErrorCode: 1 }, "aborted", "observed"],
  ["opaque source error", {}, "unknown-at-transport/startup", "unknown"],
  ["seek opaque", { phase: "seek" }, "unknown-at-seek", "unknown"],
  ["decode does not prove codec", { descriptor: descriptor(), mediaErrorCode: 3, nativePrediction: "unknown" }, "decode-error", "observed"],
  ["positive prediction cannot blame codec", { descriptor: descriptor(), nativePrediction: "probably" }, "unknown-at-transport/startup", "unknown"],
  ["adaptive engine cannot use native prediction", { descriptor: descriptor(), engine: "hls.js" }, "unknown-at-transport/startup", "unknown"],
  ["successful status is not a delivery error", { httpStatus: 206 }, "unknown-at-transport/startup", "unknown"]
]) test(name, () => {
  const report = diagnose({ ...base, ...input });
  assert.equal(report.cause, cause); assert.equal(report.confidence, confidence);
  assert.ok(report.nextAction.label); assert.ok(report.candidateCauses[0].evidence.length);
  assert.equal(report.observed.readyState, 0); assert.equal(report.observed.networkState, 3);
});

test("unknown defaults, conflicts and titles cannot invent a cause", () => {
  const conflict = describeSource({ mimeType: 'video/mp4; codecs="avc1.640028"', video: { codec: "hvc1" } });
  for (const input of [{ title: "MKV TrueHD provider broken" }, { ...base, descriptor: conflict }, { ...base, descriptor: descriptor(), nativePrediction: "unknown" }]) {
    const report = diagnose(input);
    assert.equal(report.confidence, "unknown");
    assert.equal(report.observed.contentType, null);
    assert.equal(report.observed.rangeCapability, "not-observed");
    assert.equal(report.observed.version, null);
  }
});

test("export reconstructs only allowed fields, never secrets or arbitrary properties", () => {
  const secret = "PRIVATE_TOKEN_SENTINEL";
  const input = { ...base, descriptor: { contentType: `https://secret.invalid/${secret}`, video: { codec: `Bearer ${secret}` }, requiredHeaderCount: 1, title: secret },
    engine: secret, phase: secret, responseContentType: `text/html; token=${secret}`, rangeCapability: secret,
    url: `https://secret.invalid/?token=${secret}`, headers: { Authorization: secret }, title: secret,
    detail: secret, error: { message: secret }, observed: { token: secret },
    navigator: { userAgent: `Linux Chrome/123 ${secret}` } };
  const exported = exportPlaybackDiagnostic(input);
  assert.ok(!exported.includes(secret)); assert.ok(!exported.includes("https://"));
  assert.ok(!exported.includes("Authorization")); assert.ok(!exported.includes("Chrome/123"));
  const report = JSON.parse(exported);
  assert.equal(report.observed.requiredHeaders, true);
  assert.equal(report.observed.contentType, null);
  assert.equal(report.observed.engine, "unknown");
});

test("CORS, resource and interference stay unproven without discriminating evidence", () => {
  const report = diagnose({ detail: "Failed to fetch CORS out of memory extension blocked" });
  assert.equal(report.confidence, "unknown");
  assert.ok(report.candidateCauses.filter(x => x.confidence === "unknown").length > 3);
  assert.ok(!report.explanation.includes("extension blocked"));
  assert.ok(report.limits.includes("no extension enumeration"));
});

test("transport signal outranks unsupported guesses", () => {
  const report = diagnose({ ...base, descriptor: descriptor(), transportFailure: true });
  assert.equal(report.cause, "provider-or-transport");
  assert.deepEqual(report.candidateCauses[0].evidence, ["observed.transportFailure"]);
});

test("syntactically valid secret metadata is not an export vocabulary", () => {
  const input = { descriptor: { contentType: "video/PRIVATE_TOKEN_SENTINEL", video: { codec: "PRIVATE_TOKEN_SENTINEL" }, audioTracks: [{ codec: "PRIVATE_TOKEN_SENTINEL" }] } };
  assert.ok(!exportPlaybackDiagnostic(input).includes("PRIVATE_TOKEN_SENTINEL"));
});
