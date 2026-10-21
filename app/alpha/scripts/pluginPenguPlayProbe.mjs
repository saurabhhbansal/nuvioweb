// Manual-only pinned public-wrapper probe; source stays in memory.
import { acquirePublicSource, probePluginSource } from "./pluginSourceProbe.mjs";
const source = await acquirePublicSource(
  "https://raw.githubusercontent.com/G2nOOn/Nuvio-Plugin/58c3708a491914f5c1439f6f3ddb3269b8b0ca8e/providers/2peckle.js",
  { bytes: 13046, sha256: "08fc26eaf2d375b86549de848bea0a289cae12c64c689f33c452e005c5dc28b0" }
);
const result = await probePluginSource({ source, id: "public-uninstalled-2peckle", hosts: ["pengu.uk", "api.themoviedb.org"] });
console.log(JSON.stringify({
  recordedAt: new Date().toISOString(), ...result,
  transport: "synthetic empty-JSON stub only; no live provider transport",
  ownerCredentialsInjected: false, sourceOrErrorsLogged: false,
  installationProvenanceMatched: false, streamCompatibilityProved: false
}, null, 2));
