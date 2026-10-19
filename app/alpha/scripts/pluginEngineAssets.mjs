// Opt-in builder for the browser QuickJS engine assets.
//
// This tooling only writes into the ignored app/alpha/dist directory. It is
// never invoked by the normal app build, the stager or the application bundle,
// so the deployed 12-asset preview is unchanged. The asyncify variant is used
// because the broker's `api.fetch` awaits a host call.
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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

export async function buildPluginEngineAssets({ outdir = defaultOutdir, entry = defaultEntry } = {}) {
  const resolvedOutdir = path.resolve(outdir);
  if (!resolvedOutdir.startsWith(path.join(alphaRoot, "dist") + path.sep)) {
    throw new Error("engine assets must be written under app/alpha/dist");
  }
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
