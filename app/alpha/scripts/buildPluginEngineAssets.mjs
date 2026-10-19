// CLI wrapper for the opt-in browser engine asset build.
//
// Usage: node app/alpha/scripts/buildPluginEngineAssets.mjs [outdir]
// Writes only under app/alpha/dist (default: dist/plugin-engine); never called
// by the normal application build or the preview stager.
import path from "node:path";
import { buildPluginEngineAssets } from "./pluginEngineAssets.mjs";

const outdir = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
const { manifest } = await buildPluginEngineAssets(outdir ? { outdir } : {});
console.log(JSON.stringify(manifest, null, 2));
