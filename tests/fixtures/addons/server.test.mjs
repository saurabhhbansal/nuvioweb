import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createAddonFixtureServer } from "./server.mjs";

const server = createAddonFixtureServer();
let origin;
before(async()=>{server.listen(0,"127.0.0.1");await once(server,"listening");origin=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
test("capability declarations remain separate from quality names and original media",async()=>{
  const [declared,unknown,unsupported] = await Promise.all(["declared","unknown-quality","unsupported-mime"].map(async(scenario)=>(await (await fetch(`${origin}/${scenario}/stream/movie/fixture:original.json`)).json()).streams[0]));
  assert.equal(declared.mimeType,'video/webm; codecs="vp8,opus"');
  assert.equal(declared.video.width,640);assert.equal(declared.video.height,360);
  assert.match(unknown.name,/4K HDR HEVC/);assert.equal(unknown.video,undefined);assert.equal(unknown.mimeType,undefined);
  assert.equal(unsupported.mimeType,"video/x-nuvioweb-unsupported");
  for(const source of [declared,unknown,unsupported]) assert.equal(source.url,`${origin}/media/procedural-vp8-opus.webm`);
});
test("legal resource chain and configured/object manifests stay on the fixture origin",async()=>{
  for (const base of ["basic","objects","configured/sample"]) {
    const manifest=await (await fetch(`${origin}/${base}/manifest.json`)).json();
    assert.equal(manifest.types[0],"movie");assert.equal(manifest.catalogs[0].id,"original");
    const catalog=await (await fetch(`${origin}/${base}/catalog/movie/original.json`)).json();
    const id=catalog.metas[0].id;
    const meta=await (await fetch(`${origin}/${base}/meta/movie/${encodeURIComponent(id)}.json`)).json();
    assert.equal(meta.meta.id,id);assert.equal(new URL(meta.meta.poster).origin,origin);
    const streams=await (await fetch(`${origin}/${base}/stream/movie/${id}.json`)).json();
    const subtitles=await (await fetch(`${origin}/${base}/subtitles/movie/${id}.json`)).json();
    for(const url of [streams.streams[0].url,streams.streams[0].subtitles[0].url,subtitles.subtitles[0].url]) assert.equal(new URL(url).origin,origin);
  }
});
test("original media bytes match provenance and honor bounded Range requests",async()=>{
  const provenance=JSON.parse(await readFile(new URL("../media/provenance.json",import.meta.url)));
  const response=await fetch(`${origin}/media/${provenance.file}`);const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(createHash("sha256").update(bytes).digest("hex"),provenance.sha256);
  const range=await fetch(`${origin}/media/${provenance.file}`,{headers:{Range:"bytes=0-31"}});
  assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);
  assert.equal((await fetch(`${origin}/media/${provenance.file}`,{headers:{Range:"bytes=999999-"}})).status,416);
  assert.equal((await fetch(`${origin}/media/not-a-fixture.webm`)).status,404);
});
test("CORS, malformed, unavailable and cancellable-delay scenarios are explicit",async()=>{
  assert.equal((await fetch(`${origin}/basic/manifest.json`)).headers.get("access-control-allow-origin"),"http://127.0.0.1:4371");
  assert.equal((await fetch(`${origin}/cors-denied/manifest.json`)).headers.get("access-control-allow-origin"),null);
  assert.equal((await fetch(`${origin}/failure/manifest.json`)).status,503);
  await assert.rejects((await fetch(`${origin}/malformed/manifest.json`)).json());
  await assert.rejects(fetch(`${origin}/timeout/catalog/movie/original.json`,{signal:AbortSignal.timeout(50)}),{name:"TimeoutError"});
  assert.deepEqual((await (await fetch(`${origin}/empty/catalog/movie/original.json`)).json()).metas,[]);
});
