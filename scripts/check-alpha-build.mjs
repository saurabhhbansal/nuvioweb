import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { validatePluginEngineInstallation } from "../app/alpha/scripts/pluginEngineManifest.mjs";

const dist = new URL("../app/alpha/dist/", import.meta.url);
const assets = [
  "index.html", "app.bundle.js", "core-js.bundle.js", "sw.js", "nuvio.env.js",
  "manifest.webmanifest", "assets/libs/hls.min.js", "assets/libs/dash.all.min.js",
  "assets/libs/libbitsub_bg.wasm", "assets/libs/hls.js.LICENSE",
  "assets/libs/dashjs.LICENSE.md", "assets/libs/libbitsub.LICENSE"
];
for (const asset of assets) {
  assert.ok(statSync(new URL(asset, dist)).size > 0, `${asset} must be nonempty`);
}

const context = {};
runInNewContext(readFileSync(new URL("nuvio.env.js", dist), "utf8"), context, { timeout: 1000 });
assert.equal(context.__NUVIO_ENV__.NUVIO_SUPABASE_URL, "https://identity.example.invalid",
  "baseline build must use tests/fixtures/build.properties, never a live backend");
for (const field of ["TRAKT_CLIENT_SECRET", "TRAKT_REDIRECT_URI", "NUVIO_WEB_PUSH_PRIVATE_KEY"]) {
  assert.ok(!Object.hasOwn(context.__NUVIO_ENV__, field), `${field} must not reach the browser`);
}
const engineOptIn = /^(1|true|yes|on)$/i.test(String(process.env.NUVIO_PLUGIN_ENGINE_ASSETS || ""));
const engine = await validatePluginEngineInstallation({ distDir: fileURLToPath(dist), optIn: engineOptIn });
if (engine) {
  console.log(`Plugin engine (opt-in): ${engine.directory}, ${engine.totalBytes} bytes, hashes and MIME verified.`);
}

console.log(`Alpha baseline: ${assets.length} nonempty assets, inert config, no privileged fields.`);
