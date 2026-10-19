import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePluginDescriptor,
  normalizePluginResult,
  normalizePluginStreams,
  PLUGIN_CONTRACT_LIMITS
} from "./pluginContract.js";

const baseDescriptor = {
  id: "fixture-plugin",
  name: "Fixture plugin",
  version: "1.0.0",
  apiVersion: 1,
  code: "export async function resolve(api, input) { return []; }",
  allowedHosts: ["media.example.com"]
};

test("valid descriptor is normalized and frozen with unknown fields dropped", () => {
  const result = normalizePluginDescriptor({ ...baseDescriptor, injected: "drop me", __proto__: { polluted: true } });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.descriptor).sort(), ["allowedHosts", "apiVersion", "code", "id", "name", "version"]);
  assert.equal(result.descriptor.name, "Fixture plugin");
  assert.ok(Object.isFrozen(result.descriptor));
  assert.equal({}.polluted, undefined);
});

test("oversized or empty plugin code is rejected with a bounded reason", () => {
  const huge = normalizePluginDescriptor({ ...baseDescriptor, code: "a".repeat(PLUGIN_CONTRACT_LIMITS.codeBytes + 1) });
  assert.deepEqual(huge, { ok: false, errors: ["code-size"] });
  assert.deepEqual(normalizePluginDescriptor({ ...baseDescriptor, code: "   " }), { ok: false, errors: ["code"] });
});

test("unsupported api versions are rejected", () => {
  assert.deepEqual(normalizePluginDescriptor({ ...baseDescriptor, apiVersion: 2 }), { ok: false, errors: ["apiVersion"] });
  assert.deepEqual(normalizePluginDescriptor({ ...baseDescriptor, apiVersion: "1" }), { ok: false, errors: ["apiVersion"] });
});

test("host allowlists reject schemes, wildcards, IPs, localhost and blocking suffixes", () => {
  for (const host of ["https://media.example.com", "*.example.com", "127.0.0.1", "0.0.0.0", "localhost", "router.local", "svc.internal", "media.example.com/path", "media.example.com:443", "user@media.example.com", "media.example.com."]) {
    const result = normalizePluginDescriptor({ ...baseDescriptor, allowedHosts: [host] });
    assert.equal(result.ok, false, host);
    assert.ok(result.errors.includes("allowedHosts-entry"), host);
  }
  assert.equal(normalizePluginDescriptor({ ...baseDescriptor, allowedHosts: ["MEDIA.Example.com"] }).descriptor.allowedHosts[0], "media.example.com");
});

test("host allowlists are bounded and duplicate-collapsed", () => {
  const tooMany = normalizePluginDescriptor({
    ...baseDescriptor,
    allowedHosts: Array.from({ length: PLUGIN_CONTRACT_LIMITS.hosts + 1 }, (_, index) => `h${index}.example.com`)
  });
  assert.ok(tooMany.errors.includes("allowedHosts-size"));
  const duplicates = normalizePluginDescriptor({ ...baseDescriptor, allowedHosts: ["a.example.com", "A.example.com"] });
  assert.deepEqual(duplicates.descriptor.allowedHosts, ["a.example.com"]);
});

test("non-http, credential-bearing and protocol-relative media URLs are dropped", () => {
  const { streams, dropped } = normalizePluginStreams([
    { name: "ok", url: "https://media.example.com/a.mp4" },
    { name: "js", url: "javascript:alert(1)" },
    { name: "data", url: "data:text/html,<script>alert(1)</script>" },
    { name: "creds", url: "https://user:pass@media.example.com/a.mp4" },
    { name: "relative", url: "//media.example.com/a.mp4" },
    { name: "file", url: "file:///etc/passwd" },
    { name: "too-long", url: `https://media.example.com/${"a".repeat(PLUGIN_CONTRACT_LIMITS.url)}` }
  ]);
  assert.equal(streams.length, 1);
  assert.equal(dropped, 6);
  assert.equal(streams[0].url, "https://media.example.com/a.mp4");
});

test("text is trimmed, control characters are removed and fields are capped", () => {
  const { streams } = normalizePluginStreams([
    { name: `  bad\u0000name  `, title: "t".repeat(500), description: "line\nbreak", quality: "q".repeat(200), url: "https://media.example.com/a.mp4" }
  ]);
  assert.equal(streams[0].name, "bad name");
  assert.equal(streams[0].title.length, PLUGIN_CONTRACT_LIMITS.text);
  assert.equal(streams[0].description, "line break");
  assert.equal(streams[0].quality.length, PLUGIN_CONTRACT_LIMITS.quality);
});

test("group and stream counts are bounded with dropped counts", () => {
  const groups = Array.from({ length: PLUGIN_CONTRACT_LIMITS.groups + 5 }, (_, index) => ({
    sourceId: `s${index}`,
    sourceName: `Source ${index}`,
    streams: [{ url: `https://media.example.com/${index}.mp4` }]
  }));
  const bounded = normalizePluginResult(groups);
  assert.equal(bounded.groups.length, PLUGIN_CONTRACT_LIMITS.groups);
  assert.equal(bounded.dropped, 5);

  const streams = Array.from({ length: PLUGIN_CONTRACT_LIMITS.streams + 10 }, (_, index) => ({ url: `https://media.example.com/${index}.mp4` }));
  const boundedStreams = normalizePluginStreams(streams);
  assert.equal(boundedStreams.streams.length, PLUGIN_CONTRACT_LIMITS.streams);
  assert.equal(boundedStreams.dropped, 10);
});

test("malformed results and forged prototype keys cannot pollute or leak input", () => {
  assert.deepEqual(normalizePluginResult(null), { groups: [], dropped: 0 });
  assert.deepEqual(normalizePluginResult("not-an-array"), { groups: [], dropped: 0 });
  const forged = JSON.parse(
    '[{"sourceId":"x","sourceName":"x","streams":[{"url":"https://media.example.com/a.mp4","__proto__":{"polluted":true}}]},{"sourceId":"empty","streams":[]},{"bad":true}]'
  );
  const result = normalizePluginResult(forged);
  assert.equal(result.groups.length, 1);
  assert.equal(result.dropped, 2);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(result.groups[0].streams[0].polluted, undefined);
  const error = normalizePluginDescriptor({ ...baseDescriptor, code: "x".repeat(PLUGIN_CONTRACT_LIMITS.codeBytes + 1) });
  assert.doesNotMatch(JSON.stringify(error), /xxxx/i);
});

test("representative fixture satisfies the descriptor bounds it will run under", async () => {
  const { readFile } = await import("node:fs/promises");
  const code = await readFile(new URL("../../../../../tests/fixtures/plugins/representative-plugin.js", import.meta.url), "utf8");
  const result = normalizePluginDescriptor({
    id: "fixture-plugin",
    name: "Fixture plugin",
    version: "1.0.0",
    apiVersion: 1,
    code,
    allowedHosts: ["media.example.com"]
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(new TextEncoder().encode(code).length <= PLUGIN_CONTRACT_LIMITS.codeBytes);
});
