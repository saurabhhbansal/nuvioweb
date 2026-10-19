import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { executePluginPrototype } from "./pluginSandboxPrototype.mjs";

const fixture = await readFile(new URL("../../../tests/fixtures/plugins/representative-plugin.js", import.meta.url), "utf8");

test("representative fixture executes in the engine sandbox and returns normalized streams", async () => {
  const result = await executePluginPrototype({ code: fixture, input: { tmdbId: 42, mediaType: "movie" } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].sourceId, "fixture-plugin");
  assert.equal(result.groups[0].streams.length, 1);
  assert.equal(result.groups[0].streams[0].url, "https://media.example.com/fixture-1080.mp4");
  assert.equal(result.dropped, 1, "the javascript: stream must be dropped");
  assert.deepEqual(result.logs, ["resolving 42"]);
  assert.ok(result.elapsedMs < 5000);
});

test("sandbox exposes no host networking, process or module globals", async () => {
  const code = `
async function resolve() {
  const names = ["fetch", "require", "process", "XMLHttpRequest", "WebSocket", "importScripts"];
  return [{ sourceId: "probe", sourceName: "probe", streams: [{ url: "https://media.example.com/probe", description: names.map((name) => typeof globalThis[name]).join(",") }] }];
}`;
  const result = await executePluginPrototype({ code });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.groups[0].streams[0].description, "undefined,undefined,undefined,undefined,undefined,undefined");
});

test("an infinite loop is interrupted within the wall-clock budget", async () => {
  const result = await executePluginPrototype({ code: "async function resolve(){ while (true) {} }", limits: { timeMs: 100 } });
  assert.equal(result.ok, false);
  assert.equal(result.error, "timeout");
  assert.ok(result.elapsedMs < 3000, `took ${result.elapsedMs}ms`);
});

test("memory allocation beyond the engine limit fails closed", async () => {
  const result = await executePluginPrototype({
    code: 'async function resolve(){ return "x".repeat(8 * 1024 * 1024); }',
    limits: { memoryBytes: 1024 * 1024, timeMs: 2000 }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "memory");
});

test("oversized serialized output is rejected before normalization", async () => {
  const result = await executePluginPrototype({
    code: 'async function resolve(){ return [{sourceId:"x",sourceName:"x",streams:[{url:"https://media.example.com/x",description:"y".repeat(4000)}]}]; }',
    limits: { outputBytes: 1000 }
  });
  assert.deepEqual({ ok: result.ok, error: result.error }, { ok: false, error: "output-size" });
});

test("malformed but parseable output normalizes to no groups without throwing", async () => {
  const result = await executePluginPrototype({ code: 'async function resolve(){ return { nope: true }; }' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.groups, []);
});

test("empty code is rejected without starting an engine", async () => {
  assert.deepEqual(await executePluginPrototype({ code: "   " }), { ok: false, error: "code" });
});
