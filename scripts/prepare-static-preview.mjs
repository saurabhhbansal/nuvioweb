import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { ENV_PROPERTY_KEYS } from "../app/alpha/scripts/envProperties.mjs";
import { stageIdentityProgressDemo } from "./stage-identity-progress-demo.mjs";
import { stageLegalDemo } from "./stage-legal-demo.mjs";

export function validatePublicConfig(source) {
  const json = source.match(/var values = (\{[\s\S]*?\n\});/)?.[1];
  if (!json) throw new Error("Missing generated public configuration");
  const values = JSON.parse(json);
  if (Object.keys(values).some((key) => !ENV_PROPERTY_KEYS.includes(key))) throw new Error("Unexpected public configuration field");
  if (values.NUVIO_SUPABASE_URL !== "https://api.nuvio.tv" || values.NUVIO_SUPABASE_ANON_KEY !== "sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN") {
    throw new Error("Preview requires the documented public primary URL and publishable key");
  }
  if (values.NUVIO_SUPABASE_FALLBACK_URL) throw new Error("Alternate credential destination is not enabled for this preview");
  for (const key of ["NUVIO_ENABLE_TRAKT_BRIDGE", "NUVIO_ENABLE_DEBRID_BRIDGE", "NUVIO_ENABLE_EXTERNAL_RETURN_BRIDGE"]) {
    if (values[key] !== "false") throw new Error("Static preview sidecars must be explicitly disabled");
  }
  return values;
}

const root = fileURLToPath(new URL("../", import.meta.url));
const noticePaths = [
  "hls.js/LICENSE", "dashjs/LICENSE.md", "dashjs/dist/dash.all.min.js.LICENSE.txt",
  "libbitsub/LICENSE", "libbitsub/pkg/LICENSE", "core-js/LICENSE", "jszip/LICENSE.markdown",
  "pako/LICENSE", "lie/license.md", "immediate/LICENSE.txt", "setimmediate/LICENSE.txt"
];

// The public TMDB key ships in the browser bundle like any client key, but it
// is kept out of git: the deployer keeps it in a private file and points
// NUVIO_TMDB_API_KEY_FILE at it. Only a plain v3 key (32 letters/digits) is accepted.
export function applyTmdbKey(properties, key) {
  const value = String(key ?? "").trim();
  if (!value) return properties;
  if (!/^[A-Za-z0-9]{32}$/.test(value)) throw new Error("NUVIO_TMDB_API_KEY_FILE must hold a 32-character TMDB v3 API key");
  if (!/^TMDB_API_KEY=.*$/m.test(properties)) throw new Error("build.properties has no TMDB_API_KEY line");
  return properties.replace(/^TMDB_API_KEY=.*$/m, `TMDB_API_KEY=${value}`);
}

async function buildPropertiesPath() {
  const committed = join(root,"deploy/cloudflare/build.properties");
  const keyFile = String(process.env.NUVIO_TMDB_API_KEY_FILE || "").trim();
  if (!keyFile) return { path: committed, cleanup: async () => {} };
  const dir = await mkdtemp(join(tmpdir(),"nuvio-preview-"));
  const path = join(dir,"build.properties");
  await writeFile(path, applyTmdbKey(await readFile(committed,"utf8"), await readFile(keyFile,"utf8")), { mode: 0o600 });
  return { path, cleanup: () => rm(dir,{ recursive: true, force: true }) };
}

export async function preparePreview() {
  if (execFileSync("git",["status","--porcelain"],{cwd:root,encoding:"utf8"}).trim()) throw new Error("Commit preview source before staging so matching source is available");
  const pinnedNode = (await readFile(join(root,".node-version"),"utf8")).trim();
  if (process.versions.node !== pinnedNode.replace(/^v/,"")) throw new Error(`Use pinned Node ${pinnedNode} before staging`);
  // Ignored dist may belong to an earlier commit. Always rebuild from this clean
  // revision rather than attaching current matching-source links to stale bytes.
  const properties = await buildPropertiesPath();
  try {
    execFileSync(process.execPath,["scripts/build.mjs"],{
      cwd:join(root,"app/alpha"),
      env:{...process.env,NUVIO_LOCAL_PROPERTIES:properties.path},
      stdio:"inherit"
    });
  } finally {
    await properties.cleanup();
  }
  const source = join(root,"app/alpha/dist");
  const publicConfig = validatePublicConfig(await readFile(join(source,"nuvio.env.js"),"utf8"));
  if (process.env.NUVIO_TMDB_API_KEY_FILE && !publicConfig.TMDB_API_KEY) throw new Error("TMDB key file was given but the build has no TMDB_API_KEY");
  const files = await readdir(source,{recursive:true,withFileTypes:true});
  for (const entry of files) {
    if (entry.isSymbolicLink()) throw new Error("Preview must not contain symlinks");
    if (/^(?:functions|services|node_modules|\.env.*|_worker\.js)$/.test(entry.name) || /\.(?:cjs|exe|pem|key)$/.test(entry.name)) throw new Error(`Disallowed server/private artifact: ${entry.name}`);
  }
  // Separate staging tree; upstream dist is preserved. Never delete an existing deployment.
  const revision = execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
  const destination = join(root,"dist/preview",revision);
  // Do not overlay a previous staging directory with potentially stale files.
  await mkdir(destination,{recursive:false}).catch(async (error) => {
    if (error.code !== "ENOENT") throw error;
    await mkdir(join(root,"dist/preview"),{recursive:true});
    await mkdir(destination);
  });
  await cp(source,destination,{recursive:true});
  await cp(join(root,"deploy/cloudflare/_headers"),join(destination,"_headers"));
  await cp(join(root,"deploy/cloudflare/_redirects"),join(destination,"_redirects"));
  await cp(join(root,"deploy/cloudflare/404.html"),join(destination,"404.html"));
  await cp(join(root,"app/alpha/LICENSE"),join(destination,"LICENSE.txt"));
  await cp(join(root,"UPSTREAM_SOURCES.md"),join(destination,"UPSTREAM_SOURCES.md"));
  for (const path of noticePaths) {
    const target = join(destination,"third-party",path);
    await mkdir(resolve(target,".."),{recursive:true});
    await cp(join(root,"app/alpha/node_modules",path),target);
  }
  await stageLegalDemo(destination);
  await stageIdentityProgressDemo(destination);
  await writeFile(join(destination,"SOURCE.txt"),`NuvioWeb independent community preview; not affiliated with or endorsed by Nuvio.\nGPL source and build instructions for this revision:\nhttps://github.com/saurabhhbansal/nuvioweb/tree/${revision}\nUpstream provenance: /UPSTREAM_SOURCES.md\nGPL license: /LICENSE.txt\nThird-party notice files: ${noticePaths.map((path)=>`/third-party/${path}`).join(", ")}\nBrowser preview only. Native sidecars, paid compute and a media proxy are not deployed.\n`);
  const inventory = [];
  for (const entry of await readdir(destination,{recursive:true,withFileTypes:true})) if (entry.isFile()) {
    const path = join(entry.parentPath,entry.name);
    inventory.push({path:relative(destination,path),sha256:createHash("sha256").update(await readFile(path)).digest("hex")});
  }
  await writeFile(join(destination,"preview-manifest.json"),JSON.stringify({revision,files:inventory.sort((a,b)=>a.path.localeCompare(b.path))},null,2)+"\n");
  return relative(root,destination);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await preparePreview());
}
