// Validates an installed opt-in plugin engine under a built dist directory.
// Used by the artifact checker and the static-preview stager so both agree on
// versioned layout, hashes, sizes and MIME. No network or execution.
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export const ENGINE_FILE_NAMES = Object.freeze(["plugin-engine.js", "emscripten-module.wasm"]);

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function validatePluginEngineInstallation({ distDir, optIn }) {
  const pluginsRoot = path.join(distDir, "assets", "plugins");
  const manifestPath = path.join(pluginsRoot, "plugin-engine.json");
  const hasAssets = await exists(manifestPath);
  if (hasAssets !== Boolean(optIn)) {
    throw new Error(
      hasAssets
        ? "Engine assets are present without NUVIO_PLUGIN_ENGINE_ASSETS=1; remove them or opt in explicitly."
        : "NUVIO_PLUGIN_ENGINE_ASSETS=1 was set but no engine assets were emitted."
    );
  }
  if (!hasAssets) return null;

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1) throw new Error("engine manifest schema is unsupported");
  if (manifest.defaultEnabled !== false) throw new Error("engine manifest must default to disabled");
  if (manifest.loadPolicy !== "explicit-opt-in-lazy") throw new Error("engine manifest load policy is invalid");
  if (manifest.license !== "MIT") throw new Error("engine manifest license is invalid");
  const match = /^\/assets\/plugins\/([a-f0-9]{16})$/.exec(String(manifest.directory || ""));
  if (!match) throw new Error("engine directory must be a 16-hex versioned path");
  const engineDir = path.join(pluginsRoot, match[1]);
  const entries = (await readdir(engineDir)).sort();
  if (JSON.stringify(entries) !== JSON.stringify([...ENGINE_FILE_NAMES].sort())) {
    throw new Error("engine directory must contain only the JS and WASM assets");
  }
  const files = new Map();
  for (const file of manifest.files) {
    if (!ENGINE_FILE_NAMES.includes(file.name) || files.has(file.name)) throw new Error("engine manifest file entry is invalid");
    files.set(file.name, file);
  }
  if (files.size !== ENGINE_FILE_NAMES.length) throw new Error("engine manifest must list both assets");
  for (const name of ENGINE_FILE_NAMES) {
    const entry = files.get(name);
    const expectedMime = name.endsWith(".wasm") ? "application/wasm" : "text/javascript";
    if (entry.mime !== expectedMime) throw new Error(`${name} MIME is invalid`);
    const bytes = await readFile(path.join(engineDir, name));
    if (bytes.byteLength !== entry.bytes) throw new Error(`${name} size does not match the manifest`);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== entry.sha256) throw new Error(`${name} hash does not match the manifest`);
  }
  const js = files.get("plugin-engine.js");
  const wasm = files.get("emscripten-module.wasm");
  if (manifest.totalBytes !== js.bytes + wasm.bytes) throw new Error("engine manifest total is invalid");
  return manifest;
}
