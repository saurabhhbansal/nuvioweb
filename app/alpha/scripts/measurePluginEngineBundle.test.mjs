import assert from "node:assert/strict";
import test from "node:test";
import { ENGINE_VARIANTS, summarizeMetafile } from "./measurePluginEngineBundle.mjs";

test("metafile accounting separates JavaScript from the WASM asset", () => {
  const summary = summarizeMetafile({
    outputs: {
      "dist/engine/stdin.js": { bytes: 1000 },
      "dist/engine/emscripten-module.wasm": { bytes: 4000 }
    }
  });
  assert.equal(summary.jsBytes, 1000);
  assert.equal(summary.wasmBytes, 4000);
  assert.equal(summary.files.length, 2);
});

test("empty or missing metafiles are accounted as zero", () => {
  assert.deepEqual(summarizeMetafile({}), { jsBytes: 0, wasmBytes: 0, files: [] });
  assert.deepEqual(summarizeMetafile(null), { jsBytes: 0, wasmBytes: 0, files: [] });
});

test("both engine variants are declared with their evaluated packages", () => {
  assert.deepEqual(Object.keys(ENGINE_VARIANTS).sort(), ["async", "sync"]);
  assert.match(ENGINE_VARIANTS.sync.packageName, /release-sync/);
  assert.match(ENGINE_VARIANTS.async.packageName, /release-asyncify/);
});
