import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const scenarios = new Set(["basic","objects","configured","cors-denied","malformed","shape","slow","failure","empty","timeout","partial","declared","unknown-quality","unsupported-mime"]);
const mediaRoot = new URL("../media/",import.meta.url);

export function createAddonFixtureServer() {
  const requests = [];
  let partialRecovered = false;
  const server = http.createServer(async (request,response) => {
    const url = new URL(request.url,"http://127.0.0.1");
    const origin = `http://127.0.0.1:${server.address().port}`;
    const parts = url.pathname.split("/").filter(Boolean);
    const scenario = parts[0];
    const cors = scenario !== "cors-denied";
    const headers = {"Cache-Control":"no-store","Content-Type":"application/json",...(cors ? {"Access-Control-Allow-Origin":"http://127.0.0.1:4371","Access-Control-Allow-Methods":"GET, HEAD, OPTIONS"} : {})};
    const json = (value,status=200) => response.writeHead(status,headers).end(JSON.stringify(value));
    if (url.pathname === "/health") { json({fixture:true}); return; }
    if (url.pathname === "/__fixture/requests") {
      if (request.method === "DELETE") { requests.length = 0; partialRecovered = false; response.writeHead(204).end(); }
      else json(requests);
      return;
    }
    if (url.pathname === "/__fixture/partial-recovery" && request.method === "POST") { partialRecovered = true; response.writeHead(204).end(); return; }
    if (request.method === "OPTIONS") { response.writeHead(204,headers).end(); return; }
    if (!["GET","HEAD"].includes(request.method)) { json({error:"Method not allowed"},405); return; }
    requests.push({method:request.method,path:url.pathname,authorizationPresent:Boolean(request.headers.authorization),apiKeyPresent:Boolean(request.headers.apikey)});
    if (requests.length > 200) requests.shift();
    try {
      if (url.pathname === "/poster.svg") {
        response.writeHead(200,{...headers,"Content-Type":"image/svg+xml"}).end('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#142033"/><rect x="70" y="180" width="180" height="120" fill="#81d4fa"/><text x="35" y="80" fill="white" font-size="24">Original fixture</text></svg>'); return;
      }
      if (scenario === "media" && ["procedural-vp8-opus.webm","english.vtt"].includes(parts[1]) && parts.length === 2) {
        const bytes = await readFile(new URL(parts[1],mediaRoot));
        const type = parts[1].endsWith(".vtt") ? "text/vtt" : "video/webm";
        const range = request.headers.range;
        if (range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(range);
          const start = match ? Number(match[1]) : NaN;
          const end = match?.[2] ? Math.min(Number(match[2]),bytes.length-1) : bytes.length-1;
          if (!Number.isSafeInteger(start) || start < 0 || start > end) { response.writeHead(416,{...headers,"Content-Range":`bytes */${bytes.length}`}).end(); return; }
          response.writeHead(206,{...headers,"Content-Type":type,"Accept-Ranges":"bytes","Content-Range":`bytes ${start}-${end}/${bytes.length}`,"Content-Length":end-start+1}).end(request.method === "HEAD" ? undefined : bytes.subarray(start,end+1));
        } else response.writeHead(200,{...headers,"Content-Type":type,"Accept-Ranges":"bytes","Content-Length":bytes.length}).end(request.method === "HEAD" ? undefined : bytes);
        return;
      }
      if (!scenarios.has(scenario)) { json({error:"Unknown fixture"},404); return; }
      const rawPath = parts.slice(scenario === "configured" && parts[1] === "sample" ? 2 : 1).join("/");
      const path = decodeURIComponent(rawPath);
      if (scenario === "failure") { json({message:'Fixture provider unavailable <img src=x onerror="globalThis.__fixtureInjected=true">'},503); return; }
      if (scenario === "slow" || (scenario === "timeout" && path.startsWith("catalog/"))) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve,scenario === "slow" ? 250 : 2000);
          response.once("close",()=>{clearTimeout(timer);resolve();});
        });
        if (response.destroyed) return;
      }
      const base = `${origin}/${scenario}${scenario === "configured" ? "/sample" : ""}`;
      const meta = {id:"fixture:original",type:"movie",name:"Original Legal Fixture",description:"Original generated rectangles and sine tone. No external media.",releaseInfo:"2026",poster:`${origin}/poster.svg`};
      if (path === "manifest.json") {
        if (scenario === "malformed") { response.writeHead(200,headers).end('{"id":'); return; }
        if (scenario === "shape") { json({id:"fixture.invalid",types:{wrong:true}}); return; }
        json({id:`org.nuvioweb.fixture.${scenario}`,version:"1.0.0",name:scenario === "configured" ? "Configured Legal Fixture" : scenario === "partial" ? "Partial Provider Fixture" : "Legal Fixture",description:"Original local interoperability fixture",types:["movie"],idPrefixes:["fixture:"],
          resources:scenario === "objects" ? ["catalog",...["meta","stream","subtitles"].map((name)=>({name,types:["movie"],idPrefixes:["fixture:"]}))] : ["catalog","meta","stream","subtitles"],
          catalogs:[{id:"original",type:"movie",name:"Legal Fixture Catalog",extra:[{name:"search",isRequired:false},{name:"skip",isRequired:false}]}],
          behaviorHints:{configurable:scenario === "configured",configurationRequired:false},logo:`${origin}/poster.svg`}); return;
      }
      if (path.startsWith("catalog/movie/original")) {
        const extras = new URLSearchParams(rawPath.slice("catalog/movie/original/".length).replace(/\.json$/,""));
        const search = extras.get("search") || "";
        json({metas:scenario === "empty" || Number(extras.get("skip") || 0)>0 || (search && !meta.name.toLowerCase().includes(search.toLowerCase())) ? [] : [meta]}); return;
      }
      if (path === "meta/movie/fixture:original.json") { json({meta}); return; }
      if (path === "stream/movie/fixture:original.json") {
        if (scenario === "partial" && !partialRecovered) { json({message:"Fixture stream endpoint unavailable"},503); return; }
        const explicit = scenario === "declared" ? {mimeType:'video/webm; codecs="vp8,opus"',video:{codec:"vp8",width:640,height:360,bitrate:100000,framerate:10},audioTracks:[{codec:"opus",language:"und",channels:1}]} : scenario === "unsupported-mime" ? {mimeType:"video/x-nuvioweb-unsupported",video:{codec:"fixture-unknown"}} : {};
        json({streams:scenario === "empty" ? [] : [{...explicit,name:scenario === "unknown-quality" ? "Provider claims 4K HDR HEVC" : "Original local VP8/Opus",title:"Generated legal fixture",url:`${origin}/media/procedural-vp8-opus.webm${scenario === "partial" ? "?provider=partial" : ""}`,subtitles:[{id:"fixture:english",lang:"eng",url:`${origin}/media/english.vtt`}],behaviorHints:{notWebReady:false}}]}); return;
      }
      if (path === "subtitles/movie/fixture:original.json") { json({subtitles:[{id:"fixture:english",lang:"eng",url:`${origin}/media/english.vtt`}]}); return; }
      json({error:`Unsupported fixture resource at ${base}`},404);
    } catch { json({error:"Fixture unavailable"},500); }
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createAddonFixtureServer();
  server.listen(4373,"127.0.0.1");
  process.on("SIGTERM",()=>server.close());
}
