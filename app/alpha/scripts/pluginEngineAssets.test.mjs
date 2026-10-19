import assert from "node:assert/strict";
import test from "node:test";
import { buildEngineManifest, ENGINE_ASSET_NAMES, ENGINE_MIME_TYPES, summarizeEngineAssetFiles } from "./pluginEngineAssets.mjs";

const sha = (char) => char.repeat(64);
const jsFile = { name: ENGINE_ASSET_NAMES.js, bytes: 1200, sha256: sha("a") };
const wasmFile = { name: ENGINE_ASSET_NAMES.wasm, bytes: 3400, sha256: sha("b") };

test("asset accounting sums the JS and WASM bytes", () => {
  assert.deepEqual(summarizeEngineAssetFiles([jsFile, wasmFile]), { jsBytes: 1200, wasmBytes: 3400, totalBytes: 4600 });
});

test("asset accounting rejects a missing WASM or missing JS file", () => {
  assert.throws(() => summarizeEngineAssetFiles([jsFile]), /exactly JS and WASM/);
  assert.throws(() => summarizeEngineAssetFiles([wasmFile]), /exactly JS and WASM/);
});

test("asset accounting rejects duplicates, empty files and invalid hashes", () => {
  assert.throws(() => summarizeEngineAssetFiles([jsFile, jsFile]), /exactly JS and WASM|duplicate/);
  assert.throws(() => summarizeEngineAssetFiles([{ ...jsFile, bytes: 0 }, wasmFile]), /empty/);
  assert.throws(() => summarizeEngineAssetFiles([jsFile, { ...wasmFile, sha256: "nope" }]), /SHA-256/);
});

test("the manifest is explicit opt-in, MIT and defaults to disabled", () => {
  const manifest = buildEngineManifest({ engineVersion: "0.32.0", variantVersion: "0.32.0", files: [jsFile, wasmFile] });
  assert.equal(manifest.defaultEnabled, false);
  assert.equal(manifest.loadPolicy, "explicit-opt-in-lazy");
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(
    manifest.files.map((file) => [file.name, file.mime]),
    [
      [ENGINE_ASSET_NAMES.js, ENGINE_MIME_TYPES[".js"]],
      [ENGINE_ASSET_NAMES.wasm, ENGINE_MIME_TYPES[".wasm"]]
    ]
  );
  assert.equal(manifest.totalBytes, 4600);
});

test("the manifest is deterministic and requires both versions", () => {
  const first = buildEngineManifest({ engineVersion: "0.32.0", variantVersion: "0.32.0", files: [jsFile, wasmFile] });
  const second = buildEngineManifest({ engineVersion: "0.32.0", variantVersion: "0.32.0", files: [jsFile, wasmFile] });
  assert.deepEqual(first, second);
  assert.throws(() => buildEngineManifest({ engineVersion: "", variantVersion: "0.32.0", files: [jsFile, wasmFile] }), /engine version/);
  assert.throws(() => buildEngineManifest({ engineVersion: "0.32.0", variantVersion: "", files: [jsFile, wasmFile] }), /variant version/);
});
