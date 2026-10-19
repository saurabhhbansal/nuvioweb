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

test("the builder rejects an output path that escapes through a symlink", async () => {
  const { mkdir, mkdtemp, readdir, rm, symlink } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { buildPluginEngineAssets } = await import("./pluginEngineAssets.mjs");
  const alphaRoot = fileURLToPath(new URL("../", import.meta.url));
  const outside = await mkdtemp(join(tmpdir(), "nuvioweb-engine-"));
  const link = join(alphaRoot, "dist", `symlink-${process.pid}-${Date.now()}`);
  try {
    await mkdir(join(alphaRoot, "dist"), { recursive: true });
    await symlink(outside, link, "dir");
    await assert.rejects(buildPluginEngineAssets({ outdir: join(link, "engine") }), /written under app\/alpha\/dist/);
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(link, { force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("a symlinked dist root or a missing dist root is handled safely", async () => {
  const { mkdtemp, rm, symlink } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { resolveSafeOutdir } = await import("./pluginEngineAssets.mjs");
  const repositoryRoot = await mkdtemp(join(tmpdir(), "nuvioweb-repo-"));
  const outside = await mkdtemp(join(tmpdir(), "nuvioweb-outside-"));
  try {
    const clean = await resolveSafeOutdir(join(repositoryRoot, "dist", "engine"), { distRoot: join(repositoryRoot, "dist"), repositoryRoot });
    assert.equal(clean, join(repositoryRoot, "dist", "engine"));
    const linkedRepository = await mkdtemp(join(tmpdir(), "nuvioweb-repo-link-"));
    try {
      await symlink(outside, join(linkedRepository, "dist"), "dir");
      await assert.rejects(
        resolveSafeOutdir(join(linkedRepository, "dist", "engine"), { distRoot: join(linkedRepository, "dist"), repositoryRoot: linkedRepository }),
        /must not be a symlink/
      );
    } finally {
      await rm(linkedRepository, { recursive: true, force: true });
    }
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("the installed manifest adds a versioned directory and rejects unsafe paths", async () => {
  const { buildInstalledManifest } = await import("./pluginEngineAssets.mjs");
  const base = buildEngineManifest({ engineVersion: "0.32.0", variantVersion: "0.32.0", files: [jsFile, wasmFile] });
  const installed = buildInstalledManifest(base, "/assets/plugins/0123456789abcdef");
  assert.equal(installed.directory, "/assets/plugins/0123456789abcdef");
  assert.equal(installed.defaultEnabled, false);
  assert.deepEqual(installed.files, base.files);
  assert.throws(() => buildInstalledManifest(base, "/assets/plugins/not-hex"), /invalid engine asset directory/);
  assert.throws(() => buildInstalledManifest(base, "../outside"), /invalid engine asset directory/);
});
