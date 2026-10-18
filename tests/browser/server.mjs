import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../app/alpha/dist/", import.meta.url));
const types = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webmanifest":"application/manifest+json", ".xml":"application/xml", ".svg":"image/svg+xml", ".png":"image/png", ".wasm":"application/wasm" };
const app = http.createServer(async (request,response) => {
  try {
    const path = decodeURIComponent(new URL(request.url,"http://127.0.0.1:4371").pathname);
    const file = resolve(root, `.${path === "/" ? "/index.html" : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root+sep)) { response.writeHead(403).end(); return; }
    const body = await readFile(file);
    response.writeHead(200,{"Content-Type":types[extname(file)] || "application/octet-stream", "Cache-Control":"no-store"}).end(body);
  } catch { response.writeHead(404).end("Not found"); }
});
app.listen(4371,"127.0.0.1");
process.on("SIGTERM",()=>app.close());
