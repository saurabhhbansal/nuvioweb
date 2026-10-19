// Opt-in builder for the browser QuickJS engine assets.
//
// This tooling only writes into the ignored app/alpha/dist directory. It is
// never invoked by the normal app build, the stager or the application bundle,
// so the deployed 12-asset preview is unchanged. The asyncify variant is used
// because the broker's `api.fetch` awaits a host call.
import { copyFile, lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, stop as stopEsbuild } from "esbuild";

const require = createRequire(import.meta.url);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const alphaRoot = path.resolve(scriptsDir, "..");
const defaultEntry = path.join(scriptsDir, "pluginEngineBrowserEntry.mjs");
const defaultOutdir = path.join(alphaRoot, "dist", "plugin-engine");

export const ENGINE_ASSET_NAMES = Object.freeze({
  js: "plugin-engine.js",
  wasm: "emscripten-module.wasm",
  manifest: "plugin-engine.json"
});

export const ENGINE_MIME_TYPES = Object.freeze({
  ".js": "text/javascript",
  ".wasm": "application/wasm"
});

export const ENGINE_VARIANT_PACKAGE = "@jitl/quickjs-wasmfile-release-asyncify";

function isValidSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

// Pure accounting over the built files so the manifest rules are testable
// without invoking esbuild.
export function summarizeEngineAssetFiles(files = []) {
  if (!Array.isArray(files) || files.length !== 2) throw new Error("engine assets must contain exactly JS and WASM");
  const byName = new Map();
  for (const file of files) {
    if (!file || typeof file.name !== "string") throw new Error("invalid engine asset entry");
    if (byName.has(file.name)) throw new Error("duplicate engine asset entry");
    if (!Number.isInteger(file.bytes) || file.bytes <= 0) throw new Error(`engine asset ${file.name} is empty`);
    if (!isValidSha256(file.sha256)) throw new Error(`engine asset ${file.name} has no SHA-256`);
    byName.set(file.name, file);
  }
  const js = byName.get(ENGINE_ASSET_NAMES.js);
  const wasm = byName.get(ENGINE_ASSET_NAMES.wasm);
  if (!js || !wasm) throw new Error("engine assets must include the JS and WASM files");
  return { jsBytes: js.bytes, wasmBytes: wasm.bytes, totalBytes: js.bytes + wasm.bytes };
}

export function buildEngineManifest({ engineVersion, variantVersion, files }) {
  if (typeof engineVersion !== "string" || !engineVersion.trim()) throw new Error("engine version is required");
  if (typeof variantVersion !== "string" || !variantVersion.trim()) throw new Error("variant version is required");
  const totals = summarizeEngineAssetFiles(files);
  return {
    schemaVersion: 1,
    enginePackage: "quickjs-emscripten",
    engineVersion,
    variantPackage: ENGINE_VARIANT_PACKAGE,
    variantVersion,
    license: "MIT",
    loadPolicy: "explicit-opt-in-lazy",
    defaultEnabled: false,
    buildEntry: "scripts/pluginEngineBrowserEntry.mjs",
    files: [
      { name: ENGINE_ASSET_NAMES.js, mime: ENGINE_MIME_TYPES[".js"], bytes: totals.jsBytes, sha256: files.find((file) => file.name === ENGINE_ASSET_NAMES.js).sha256 },
      { name: ENGINE_ASSET_NAMES.wasm, mime: ENGINE_MIME_TYPES[".wasm"], bytes: totals.wasmBytes, sha256: files.find((file) => file.name === ENGINE_ASSET_NAMES.wasm).sha256 }
    ],
    totalBytes: totals.totalBytes
  };
}

function packageVersion(packageName) {
  const manifestPath = path.join(alphaRoot, "node_modules", ...packageName.split("/"), "package.json");
  return JSON.parse(readFileSync(manifestPath, "utf8")).version;
}

function variantWasmPath() {
  return path.join(path.dirname(require.resolve(ENGINE_VARIANT_PACKAGE)), "emscripten-module.wasm");
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

// Resolve the requested output directory without following symlinks out of the
// ignored app/alpha/dist tree. The builder recursively deletes its output, so a
// lexical prefix check is not enough when an ancestor is a symlink.
export async function resolveSafeOutdir(requested, { distRoot = path.join(alphaRoot, "dist"), repositoryRoot = alphaRoot } = {}) {
  await mkdir(distRoot, { recursive: true });
  const distStat = await lstat(distRoot);
  if (distStat.isSymbolicLink()) throw new Error("app/alpha/dist must not be a symlink");
  const allowedRoot = await realpath(distRoot);
  const realRepository = await realpath(repositoryRoot);
  const distRelative = path.relative(realRepository, allowedRoot);
  if (!distRelative || distRelative.startsWith("..") || path.isAbsolute(distRelative)) {
    throw new Error("app/alpha/dist resolves outside the repository");
  }
  const resolved = path.resolve(requested);
  const parent = await realpath(path.dirname(resolved));
  const candidate = path.join(parent, path.basename(resolved));
  const relativeToRoot = path.relative(allowedRoot, candidate);
  if (!relativeToRoot || relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error("engine assets must be written under app/alpha/dist");
  }
  try {
    if ((await lstat(candidate)).isSymbolicLink()) throw new Error("engine assets output must not be a symlink");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return candidate;
}

export async function buildPluginEngineAssets({ outdir = defaultOutdir, entry = defaultEntry } = {}) {
  const resolvedOutdir = await resolveSafeOutdir(outdir);
  await rm(resolvedOutdir, { recursive: true, force: true });
  await mkdir(resolvedOutdir, { recursive: true });

  const jsPath = path.join(resolvedOutdir, ENGINE_ASSET_NAMES.js);
  try {
    await build({
      entryPoints: [path.resolve(entry)],
      bundle: true,
      minify: true,
      format: "esm",
      platform: "browser",
      target: ["es2022"],
      outfile: jsPath,
      logLevel: "silent"
    });
  } finally {
    // Do not leave esbuild's long-lived service process behind in test workers.
    stopEsbuild();
  }

  // Emscripten keeps the wasm as an external `new URL("emscripten-module.wasm")`
  // reference, so esbuild leaves it out of the bundle; copy it beside the JS.
  const wasmPath = path.join(resolvedOutdir, ENGINE_ASSET_NAMES.wasm);
  await copyFile(variantWasmPath(), wasmPath);

  const jsText = await readFile(jsPath, "utf8");
  if (!jsText.includes(ENGINE_ASSET_NAMES.wasm)) throw new Error("engine JS does not reference the external WASM asset");

  const files = [
    { name: ENGINE_ASSET_NAMES.js, bytes: (await stat(jsPath)).size, sha256: await sha256File(jsPath) },
    { name: ENGINE_ASSET_NAMES.wasm, bytes: (await stat(wasmPath)).size, sha256: await sha256File(wasmPath) }
  ];
  const manifest = buildEngineManifest({
    engineVersion: packageVersion("quickjs-emscripten"),
    variantVersion: packageVersion(ENGINE_VARIANT_PACKAGE),
    files
  });
  await writeFile(path.join(resolvedOutdir, ENGINE_ASSET_NAMES.manifest), `${JSON.stringify(manifest, null, 2)}\n`);
  return { outdir: resolvedOutdir, manifest };
}

export function buildInstalledManifest(manifest, directory) {
  if (!/^\/assets\/plugins\/[a-f0-9]{16}$/.test(directory)) throw new Error("invalid engine asset directory");
  return { ...manifest, directory };
}

// Installs the built engine into a content-versioned directory under
// app/alpha/dist and writes the non-immutable manifest that points at it. Only
// called by the explicit opt-in build hook; the normal build never touches it.
export async function installPluginEngineAssets({ distDir = path.join(alphaRoot, "dist") } = {}) {
  const expected = path.join(alphaRoot, "dist");
  const resolvedDist = path.resolve(distDir);
  if (resolvedDist !== expected) throw new Error("engine assets must be installed under app/alpha/dist");
  const realAlpha = await realpath(alphaRoot);
  const realDist = await realpath(resolvedDist);
  if (realDist !== path.join(realAlpha, "dist")) throw new Error("app/alpha/dist must not be a symlink");
  const pluginsRoot = path.join(realDist, "assets", "plugins");
  await mkdir(pluginsRoot, { recursive: true });
  const staging = path.join(pluginsRoot, `.staging-${randomBytes(6).toString("hex")}`);
  try {
    const { manifest } = await buildPluginEngineAssets({ outdir: staging });
    const jsSha = manifest.files.find((file) => file.name === ENGINE_ASSET_NAMES.js).sha256;
    const wasmSha = manifest.files.find((file) => file.name === ENGINE_ASSET_NAMES.wasm).sha256;
    const directoryName = createHash("sha256").update(`${jsSha}:${wasmSha}`).digest("hex").slice(0, 16);
    const target = path.join(pluginsRoot, directoryName);
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await rename(path.join(staging, ENGINE_ASSET_NAMES.js), path.join(target, ENGINE_ASSET_NAMES.js));
    await rename(path.join(staging, ENGINE_ASSET_NAMES.wasm), path.join(target, ENGINE_ASSET_NAMES.wasm));
    const installed = buildInstalledManifest(manifest, `/assets/plugins/${directoryName}`);
    await writeFile(path.join(pluginsRoot, ENGINE_ASSET_NAMES.manifest), `${JSON.stringify(installed, null, 2)}\n`);
    return installed;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
