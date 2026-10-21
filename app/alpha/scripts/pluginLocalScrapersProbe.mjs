// Manual, bounded batch only. Never imported by the application or test runner.
import assert from "node:assert/strict";
import { acquirePublicSource, probePluginSource } from "./pluginSourceProbe.mjs";

const revision = "6f88d1c6bddabf30d0768d76224d600ac32bab7c";
const base = `https://raw.githubusercontent.com/phisher98/nuvio-providers/${revision}`;
const manifest = await acquirePublicSource(`${base}/manifest.json`);
const declared = JSON.parse(manifest.code);
assert.ok(Array.isArray(declared.scrapers), "local scraper manifest schema");
const pins = {
  "providers/xprime.js": { bytes: 36936, sha256: "279882bcb321cde7e57722251ae2b96fda8e9549b0cb17e78cc8d44866e1e150" },
  "providers/hdhub4u.js": { bytes: 59747, sha256: "eb859d79ac773aabe62c720c6890cd32e17669995675ff34c16ae0db7cf70256" },
  "providers/vixsrc.js": { bytes: 12214, sha256: "f3a4107c2a43d3e239b571a0068ba053c457872fef7b76cff3f94affa4005a6c" }
};
const filenames = Object.keys(pins);
const requestedDeclarations = Object.fromEntries(filenames.map((name) => [name, declared.scrapers.some((s) => s.filename === name)]));
// Public source acquisition is outside the guest: fixed origin/pin, bounded
// bytes/time, two concurrent downloads, then sequential bounded VM executions.
const sources = [];
for (let i = 0; i < filenames.length; i += 2) {
  sources.push(...await Promise.all(filenames.slice(i, i + 2).map(async (filename) => {
    try { return { filename, source: await acquirePublicSource(`${base}/${filename}`, pins[filename]) }; }
    catch (error) { return { filename, acquisitionFailed: true, httpStatus: Number.isInteger(error.actual) ? error.actual : null }; }
  })));
}
const providers = [];
for (const { filename, source, acquisitionFailed, httpStatus } of sources) {
  if (acquisitionFailed) {
    providers.push({ filename, manifestDeclared: requestedDeclarations[filename], acquisitionFailed: true, httpStatus, executed: false });
    continue;
  }
  // Independent trusted test-host approval, never derived from guest code. No
  // real transport is present even for these approved synthetic destinations.
  const hosts = filename.endsWith("xprime.js") ? ["xprime.tv", "api.themoviedb.org"] :
    filename.endsWith("hdhub4u.js") ? ["hdhub4u.frl", "api.themoviedb.org"] : ["vixsrc.to", "api.themoviedb.org"];
  providers.push({ filename, manifestDeclared: requestedDeclarations[filename], ...await probePluginSource({ source, id: filename.slice(10, -3), hosts }) });
}
console.log(JSON.stringify({
  recordedAt: new Date().toISOString(), repository: "phisher98/nuvio-providers", revision,
  manifest: { bytes: manifest.bytes, sha256: manifest.sha256, scraperCount: declared.scrapers.length,
    requestedDeclarations, ownerReportedScraperCount: 28, declaredSchema: ["id", "name", "filename", "enabled", "formats", "supportedTypes"] },
  transport: "synthetic empty-JSON stub only; no live provider transport or captured responses",
  providers, ownerCredentialsInjected: false, sourceOrRawErrorsLogged: false,
  installationAddedByOwner: true, accountRediscoveryAttempted: false,
  hermesRuntimeExecuted: false, actualEngine: "QuickJS/WASM", streamCompatibilityProved: false
}, null, 2));
