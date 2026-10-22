import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../app/alpha/dist/", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../../app/alpha/js/", import.meta.url));
const navigationAliases = new Set((await readFile(new URL("../../deploy/cloudflare/_redirects", import.meta.url), "utf8"))
  .split("\n").filter((line) => line && !line.startsWith("#")).map((line) => line.split(" ")[0]));
const headerRules = (await readFile(new URL("../../deploy/cloudflare/_headers", import.meta.url), "utf8"))
  .split(/\n\s*\n/).map((block) => block.split("\n").filter((line) => line.trim() && !line.startsWith("#")))
  .filter((lines) => lines.length).map(([path,...lines]) => ({path, headers: lines.map((line) => {
    const colon = line.indexOf(":"); return [line.slice(0,colon).trim(), line.slice(colon+1).trim()];
  })}));
function headersFor(path) {
  const headers = {};
  for (const rule of headerRules) if (rule.path === "/*" || rule.path === path) {
    for (const [name,value] of rule.headers) headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
  }
  return headers;
}
// Loopback-only test control. This server is never part of the deploy artifact.
let revision = 0;
const types = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webmanifest":"application/manifest+json", ".xml":"application/xml", ".svg":"image/svg+xml", ".png":"image/png", ".wasm":"application/wasm", ".woff2":"font/woff2" };
const app = http.createServer(async (request,response) => {
  try {
    const path = decodeURIComponent(new URL(request.url,"http://127.0.0.1:4371").pathname);
    if (process.env.NUVIO_ADDON_TEST === "1" && request.method === "GET") {
      if (path === "/__fixture/harness") {
        response.writeHead(200,{"Content-Type":"text/html","Cache-Control":"no-store"}).end('<!doctype html><title>Local add-on transport harness</title><script>globalThis.__NUVIO_ENV__={NUVIO_SUPABASE_URL:"https://identity.example.invalid",NUVIO_SUPABASE_ANON_KEY:"fixture-public-anon-key",NUVIO_SUPABASE_FALLBACK_URL:""};</script>'); return;
      }
      const prefix = "/__fixture/source/js/";
      if (path.startsWith(prefix)) {
        const file = resolve(sourceRoot,path.slice(prefix.length));
        if (!file.startsWith(sourceRoot.endsWith(sep) ? sourceRoot : sourceRoot+sep) || !file.endsWith(".js")) { response.writeHead(403).end(); return; }
        response.writeHead(200,{"Content-Type":"application/javascript","Cache-Control":"no-store"}).end(await readFile(file)); return;
      }
    }
    if (process.env.NUVIO_PWA_TEST === "1" && path === "/__test/build" && request.method === "POST") {
      revision = new URL(request.url,"http://127.0.0.1:4371").searchParams.get("revision") === "1" ? 1 : 0;
      response.writeHead(204).end(); return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405).end(); return; }
    const file = resolve(root, `.${path === "/" ? "/index.html" : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root+sep)) { response.writeHead(403).end(); return; }
    let body;
    try { body = await readFile(file); }
    catch (error) {
      // The app uses client-side navigation. Never return HTML for a missing asset/API.
      if (error.code !== "ENOENT" || !navigationAliases.has(path)) throw error;
      body = await readFile(resolve(root,"index.html"));
    }
    if (process.env.NUVIO_PWA_TEST === "1") {
      if (path === "/sw.js") body = body.toString().replace(/(const CACHE_NAME = "[^"]+)(")/, `$1-fixture-${revision}$2`);
      if (path === "/app.bundle.js" || path === "/nuvio.env.js") body = Buffer.concat([Buffer.from(body), Buffer.from(`\n;globalThis.__NUVIO_PWA_${path === "/app.bundle.js" ? "APP" : "CONFIG"}__=${revision};\n`)]);
    }
    response.writeHead(200,{"Content-Type":types[extname(file)] || "text/html", ...headersFor(path)}).end(request.method === "HEAD" ? undefined : body);
  } catch { response.writeHead(404).end("Not found"); }
});
app.listen(4371,"127.0.0.1");
process.on("SIGTERM",()=>app.close());
