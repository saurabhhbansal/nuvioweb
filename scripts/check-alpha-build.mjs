import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { runInNewContext } from "node:vm";

const dist = new URL("../app/alpha/dist/", import.meta.url);
const assets = [
  "index.html", "app.bundle.js", "plugin-worker.bundle.js", "sw.js", "nuvio.env.js",
  "manifest.webmanifest", "assets/libs/hls.min.js", "assets/libs/dash.all.min.js",
  "assets/libs/qrcode-generator.js", "assets/fonts/inter-latin-var.woff2",
  "assets/fonts/material-icons-subset.woff2", "assets/fonts/Inter-OFL.txt",
  "assets/fonts/MaterialIcons-LICENSE.txt",
  "assets/libs/libbitsub_bg.wasm", "assets/libs/hls.js.LICENSE",
  "assets/libs/dashjs.LICENSE.md", "assets/libs/libbitsub.LICENSE"
];
for (const asset of assets) {
  assert.ok(statSync(new URL(asset, dist)).size > 0, `${asset} must be nonempty`);
}

// The app bundle is an ES module split into chunks. The service worker precaches
// every chunk by name, so each one it lists has to exist, and the page has to
// load the entry as a module.
const index = readFileSync(new URL("index.html", dist), "utf8");
assert.match(index, /<script\s+type="module"\s+src="app\.bundle\.js\?v=[0-9a-f]+"/, "entry must load as a module");
const worker = readFileSync(new URL("sw.js", dist), "utf8");
const chunks = JSON.parse(worker.match(/const APP_CHUNKS = (\[.*?\]);/)?.[1] || "null");
assert.ok(Array.isArray(chunks) && chunks.length > 0, "sw.js must list the bundle chunks");
for (const chunk of chunks) {
  assert.ok(statSync(new URL(chunk, dist)).size > 0, `${chunk} must be nonempty`);
}
for (const [, preload] of index.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)) {
  assert.ok(chunks.includes(`./${preload}`), `${preload} is preloaded but not precached`);
}

const context = {};
runInNewContext(readFileSync(new URL("nuvio.env.js", dist), "utf8"), context, { timeout: 1000 });
assert.equal(context.__NUVIO_ENV__.NUVIO_SUPABASE_URL, "https://identity.example.invalid",
  "baseline build must use tests/fixtures/build.properties, never a live backend");
for (const field of ["TRAKT_CLIENT_SECRET", "TRAKT_REDIRECT_URI", "NUVIO_WEB_PUSH_PRIVATE_KEY"]) {
  assert.ok(!Object.hasOwn(context.__NUVIO_ENV__, field), `${field} must not reach the browser`);
}
console.log(`Alpha baseline: ${assets.length} nonempty assets, ${chunks.length} precached chunks, inert config, no privileged fields.`);
