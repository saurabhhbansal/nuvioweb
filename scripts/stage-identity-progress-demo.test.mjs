import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { chromium, expect } from "@playwright/test";
import { stageLegalDemo } from "./stage-legal-demo.mjs";
import { stageIdentityProgressDemo } from "./stage-identity-progress-demo.mjs";

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "nuvio-identity-progress-"));
  try { await stageLegalDemo(root); await stageIdentityProgressDemo(root); await run(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("optional identity addon resolves two original120-second CC0 items with checked bytes and no credential URLs", async () => fixture(async root => {
  const base = join(root, "demo/identity-progress");
  const json = async path => JSON.parse(await readFile(join(base, path), "utf8"));
  const manifest = await json("manifest.json");
  assert.deepEqual(manifest.resources, ["catalog", "meta", "stream"]);
  const catalog = await json("catalog/movie/original.json");
  assert.equal(catalog.metas.length, 2);
  assert.notEqual(catalog.metas[0].id, catalog.metas[1].id);
  for (const meta of catalog.metas) {
    assert.ok(meta.id.startsWith(manifest.idPrefixes[0]));
    assert.deepEqual((await json(`meta/movie/${meta.id}.json`)).meta, meta);
    const stream = (await json(`stream/movie/${meta.id}.json`)).streams[0];
    for (const value of [meta.poster, stream.url]) {
      const url = new URL(value);
      assert.equal(url.origin, "https://nuvioweb-preview.pages.dev");
      assert.equal(url.username + url.password + url.search + url.hash, "");
      assert.ok((await readFile(join(root, url.pathname))).length);
    }
  }
  const provenance = await json("media/provenance.json");
  const media = await readFile(join(base, "media", provenance.file));
  assert.equal(provenance.license, "CC0-1.0");
  assert.ok(provenance.measuredDurationSeconds >= 119 && provenance.measuredDurationSeconds <= 121);
  assert.ok(media.length < 2 * 1024 * 1024);
  assert.equal(media.length, provenance.bytes);
  assert.equal(createHash("sha256").update(media).digest("hex"), provenance.sha256);
  assert.match(await readFile(join(base, "LICENSE.txt"), "utf8"), /CC0 1.0 Universal/);
}));

test("actual Chromium decodes a finite long fixture and advances after seeking", {timeout:30000}, async () => fixture(async root => {
  const media = await readFile(join(root, "demo/identity-progress/media/original-progress-vp8-opus.webm"));
  const server = createServer((request, response) => {
    if (request.url === "/") { response.writeHead(200, {"Content-Type":"text/html"}); response.end('<video muted controls src="/fixture.webm"></video>'); }
    else if (request.url === "/fixture.webm") {
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || "");
      if (range) {
        const start = Number(range[1]);
        const end = Math.min(range[2] ? Number(range[2]) : media.length-1, media.length-1);
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>end || start>=media.length) {response.writeHead(416, {"Content-Range":`bytes */${media.length}`});response.end();return;}
        response.writeHead(206, {"Content-Type":"video/webm", "Accept-Ranges":"bytes", "Content-Range":`bytes ${start}-${end}/${media.length}`, "Content-Length":end-start+1});response.end(media.subarray(start,end+1));
      } else {response.writeHead(200, {"Content-Type":"video/webm", "Accept-Ranges":"bytes", "Content-Length":media.length});response.end(media);}
    }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({serviceWorkers:"block"});
    const origin = `http://127.0.0.1:${server.address().port}`;
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
    const page = await context.newPage();page.setDefaultTimeout(10000);
    await page.goto(origin);
    const video = page.locator("video");
    await expect.poll(() => video.evaluate(v => Number.isFinite(v.duration) && v.duration >=119 && v.duration <=121)).toBe(true);
    assert.deepEqual(await video.evaluate(v => [v.videoWidth,v.videoHeight,v.error?.code||null]), [160,90,null]);
    await video.evaluate(v => v.play());
    await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThan(0.1);
    await video.evaluate(v => {v.pause();v.currentTime=35;});
    await expect.poll(() => video.evaluate(v => !v.seeking && Math.abs(v.currentTime-35)<0.1)).toBe(true);
    await video.evaluate(v => v.play());
    await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThan(35.1);
    await video.evaluate(v => v.pause());
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}));
