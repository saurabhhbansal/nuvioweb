import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { stageLegalDemo } from "./stage-legal-demo.mjs";

test("optional preview demo resolves every declared resource to static same-host CC0 files", async () => {
  const destination = await mkdtemp(join(tmpdir(), "nuvio-static-demo-"));
  try {
    await stageLegalDemo(destination);
    const root = join(destination, "demo");
    const json = async path => JSON.parse(await readFile(join(root, path), "utf8"));
    const manifest = await json("manifest.json");
    assert.deepEqual(manifest.resources, ["catalog", "meta", "stream", "subtitles"]);
    assert.equal(manifest.behaviorHints, undefined);
    const catalog = await json(`catalog/movie/${manifest.catalogs[0].id}.json`);
    const item = catalog.metas[0];
    assert.ok(item.id.startsWith(manifest.idPrefixes[0]));
    assert.deepEqual((await json(`meta/movie/${item.id}.json`)).meta, item);
    const stream = (await json(`stream/movie/${item.id}.json`)).streams[0];
    const subtitles = (await json(`subtitles/movie/${item.id}.json`)).subtitles;
    assert.deepEqual(stream.subtitles, subtitles);
    for (const value of [manifest.logo, item.poster, stream.url, subtitles[0].url]) {
      const url = new URL(value);
      assert.equal(url.origin, "https://nuvioweb-preview.pages.dev");
      assert.equal(url.username + url.password + url.search + url.hash, "");
      assert.ok((await readFile(join(destination, url.pathname))).length > 0);
    }
    const provenance = await json("media/provenance.json");
    assert.equal(provenance.license, "CC0-1.0");
    const media = await readFile(join(root, "media", provenance.file));
    assert.equal(media.length, provenance.bytes);
    assert.equal(createHash("sha256").update(media).digest("hex"), provenance.sha256);
    assert.match(await readFile(join(root, "media/english.vtt"), "utf8"), /^WEBVTT/);
    assert.match(await readFile(join(root, "LICENSE.txt"), "utf8"), /CC0 1.0 Universal/);
    const files = await readdir(root, { recursive: true });
    assert.ok(files.every(path => !/\.(?:m?js|cjs|pem|key)$/.test(path)));
  } finally { await rm(destination, { recursive: true, force: true }); }
});
