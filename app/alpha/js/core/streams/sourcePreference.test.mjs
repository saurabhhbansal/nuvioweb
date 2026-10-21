import test from "node:test";
import assert from "node:assert/strict";
import { assessSourceForDevice } from "./sourcePreference.js";

const now = Date.parse("2026-10-21T00:00:00Z");
const source = (extra = {}) => ({ url: "https://fixture.invalid/media.mp4", mimeType: "video/mp4", ...extra });
const assess = (stream) => assessSourceForDevice(stream, { now });

test("plain sources, MKV, HLS and notWebReady get no hint", () => {
  assert.equal(assess(source()), null);
  assert.equal(assess(source({ mimeType: "video/x-matroska" })), null);
  assert.equal(assess(source({ url: "https://fixture.invalid/master.m3u8", mimeType: "application/vnd.apple.mpegurl" })), null);
  assert.equal(assess(source({ behaviorHints: { notWebReady: true } })), null);
});

test("declared request headers show a needs-headers hint", () => {
  for (const extra of [
    { behaviorHints: { proxyHeaders: { request: { Referer: "fixture" } } } },
    { headers: { Cookie: "fixture" } },
    { sourceDescriptor: { requiredHeaderCount: 1 } }
  ]) {
    assert.deepEqual(assess(source(extra)), { reason: "headers-required", label: "Needs headers" });
  }
});

test("a provider-declared expiry in the past shows a link-expired hint", () => {
  assert.equal(assess(source({ expiresAt: "2026-01-01T00:00:00Z" })).reason, "expired");
  assert.equal(assess(source({ expiresAt: "2027-01-01T00:00:00Z" })), null);
});
