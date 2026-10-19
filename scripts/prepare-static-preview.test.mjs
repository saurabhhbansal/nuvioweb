import test from "node:test";
import assert from "node:assert/strict";
import { validatePublicConfig } from "./prepare-static-preview.mjs";

const publicValues = {NUVIO_ENABLE_TRAKT_BRIDGE:"false",NUVIO_ENABLE_DEBRID_BRIDGE:"false",NUVIO_ENABLE_EXTERNAL_RETURN_BRIDGE:"false",NUVIO_SUPABASE_URL:"https://api.nuvio.tv",NUVIO_SUPABASE_ANON_KEY:"sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN",NUVIO_SUPABASE_FALLBACK_URL:""};
const config = (values) => `var values = ${JSON.stringify(values,null,2)};`;
test("rejects a missing/privileged key or alternate credential recipient before staging", () => {
  assert.deepEqual(validatePublicConfig(config(publicValues)),publicValues);
  assert.throws(()=>validatePublicConfig(""),/Missing/);
  assert.throws(()=>validatePublicConfig(config({...publicValues,NUVIO_SUPABASE_ANON_KEY:"service-role-or-account-token"})),/publishable/);
  assert.throws(()=>validatePublicConfig(config({...publicValues,NUVIO_SUPABASE_URL:"https://other.example.invalid"})),/primary/);
  assert.throws(()=>validatePublicConfig(config({...publicValues,NUVIO_SUPABASE_FALLBACK_URL:"https://other.example.invalid"})),/Alternate/);
  assert.throws(()=>validatePublicConfig(config({...publicValues,TRAKT_CLIENT_SECRET:"never-ship"})),/Unexpected/);
});


test("static preview refuses enabled, missing or malformed sidecar flags",()=>{
  for(const key of ["NUVIO_ENABLE_TRAKT_BRIDGE","NUVIO_ENABLE_DEBRID_BRIDGE","NUVIO_ENABLE_EXTERNAL_RETURN_BRIDGE"]) {
    for(const value of ["true",true,"FALSE","",undefined]) assert.throws(()=>validatePublicConfig(config({...publicValues,[key]:value})),/sidecars/);
  }
});

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validatePluginEngineInstallation } from "../app/alpha/scripts/pluginEngineManifest.mjs";

async function makeEngineInstallation() {
  const distDir = await mkdtemp(path.join(tmpdir(), "nuvioweb-engine-dist-"));
  const js = "console.log('engine');\n";
  const wasm = "fake-wasm-bytes";
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  const directory = "0123456789abcdef";
  const engineDir = path.join(distDir, "assets", "plugins", directory);
  await mkdir(engineDir, { recursive: true });
  await writeFile(path.join(engineDir, "plugin-engine.js"), js);
  await writeFile(path.join(engineDir, "emscripten-module.wasm"), wasm);
  const manifest = {
    schemaVersion: 1,
    enginePackage: "quickjs-emscripten",
    engineVersion: "0.32.0",
    variantPackage: "@jitl/quickjs-wasmfile-release-asyncify",
    variantVersion: "0.32.0",
    license: "MIT",
    loadPolicy: "explicit-opt-in-lazy",
    defaultEnabled: false,
    buildEntry: "scripts/pluginEngineBrowserEntry.mjs",
    files: [
      { name: "plugin-engine.js", mime: "text/javascript", bytes: Buffer.byteLength(js), sha256: digest(js) },
      { name: "emscripten-module.wasm", mime: "application/wasm", bytes: Buffer.byteLength(wasm), sha256: digest(wasm) }
    ],
    totalBytes: Buffer.byteLength(js) + Buffer.byteLength(wasm),
    directory: `/assets/plugins/${directory}`
  };
  await writeFile(path.join(distDir, "assets", "plugins", "plugin-engine.json"), JSON.stringify(manifest, null, 2));
  return { distDir, manifest, engineDir };
}

test("engine assets require explicit opt-in and a matching manifest", async () => {
  const empty = await mkdtemp(path.join(tmpdir(), "nuvioweb-engine-empty-"));
  const { distDir, engineDir } = await makeEngineInstallation();
  try {
    assert.equal(await validatePluginEngineInstallation({ distDir: empty, optIn: false }), null);
    await assert.rejects(validatePluginEngineInstallation({ distDir: empty, optIn: true }), /no engine assets/);
    await assert.rejects(validatePluginEngineInstallation({ distDir, optIn: false }), /without NUVIO_PLUGIN_ENGINE_ASSETS/);
    const manifest = await validatePluginEngineInstallation({ distDir, optIn: true });
    assert.equal(manifest.directory, "/assets/plugins/0123456789abcdef");
    assert.equal(manifest.defaultEnabled, false);
    assert.equal(manifest.files.find((file) => file.name === "emscripten-module.wasm").mime, "application/wasm");
    await writeFile(path.join(engineDir, "plugin-engine.js"), "tampered\n");
    await assert.rejects(validatePluginEngineInstallation({ distDir, optIn: true }), /size does not match|hash does not match/);
  } finally {
    await rm(empty, { recursive: true, force: true });
    await rm(distDir, { recursive: true, force: true });
  }
});
