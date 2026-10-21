// Original synthetic probe regressions, never real-provider acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { probePluginSource } from "./pluginSourceProbe.mjs";

const run = (code) => probePluginSource({
  source: { code, bytes: Buffer.byteLength(code), sha256: createHash("sha256").update(code).digest("hex") },
  id: "synthetic-probe-regression", hosts: ["allowed.example"]
});

test("source probe distinguishes missing parser import from a successful invocation", async () => {
  const result = await run('var parser = require("cheerio-without-node-native"); module.exports.getStreams = function() { return []; };');
  assert.equal(result.actual.ok, false);
  assert.equal(result.diagnostic.observation.bootstrapOk, false);
  assert.equal(result.diagnostic.observation.entryFunction, false);
  assert.equal(result.diagnostic.observation.observedImport, "cheerio-without-node-native");
  assert.equal(result.totalTransportDispatches, 0);
});

test("source probe reports raw header-row presence without exporting header values", async () => {
  const result = await run('module.exports.getStreams = function() { return [{ name:"private-canary", url:"https://media.example/private-canary", headers:{ Authorization:"private-canary" } }]; };');
  assert.equal(result.actual.ok, false);
  assert.equal(result.actual.normalizedRows, 0);
  assert.equal(result.diagnostic.observation.rows, 1);
  assert.equal(result.diagnostic.observation.rowsWithHeaders, 1);
  assert.equal(result.diagnostic.observation.sampleHasHeaders, true);
  assert.deepEqual(result.diagnostic.observation.sampleFields, ["name", "url", "headers"]);
  assert.doesNotMatch(JSON.stringify(result), /private-canary|Authorization|media\.example/);
});

test("source probe reports actual missing API name without raw error/log output", async () => {
  const result = await run('module.exports.getStreams = function() { console.log("private-canary"); setTimeout(function(){},1); return []; };');
  assert.equal(result.actual.ok, false);
  assert.equal(result.diagnostic.observation.missingApi, "setTimeout");
  assert.deepEqual(result.diagnostic.observation.missingGlobals, ["setTimeout"]);
  assert.doesNotMatch(JSON.stringify(result), /private-canary|is not defined/);
});

test("source probe classifies caught missing API in a prefixed provider log without exporting it", async () => {
  const result = await run('module.exports.getStreams=function(){try {new URLSearchParams();} catch(e) {console.error("private-canary: "+e.message);}return [];};');
  assert.equal(result.actual.ok,true);
  assert.equal(result.diagnostic.observation.missingApi,"URLSearchParams");
  assert.doesNotMatch(JSON.stringify(result),/private-canary|is not defined/);
});

test("source probe rejects injected diagnostic secret fields before export", async () => {
  const result = await run('__probe.missingApi="private-canary"; module.exports.getStreams = function() { return []; };');
  assert.equal(result.diagnostic.ok, false);
  assert.equal(result.diagnostic.error, "output-policy");
  assert.equal(result.diagnostic.observation, null);
  assert.doesNotMatch(JSON.stringify(result), /private-canary/);
});
