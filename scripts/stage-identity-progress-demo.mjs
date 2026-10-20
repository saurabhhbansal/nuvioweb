import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const mediaRoot = fileURLToPath(new URL("../tests/fixtures/media/identity-progress/", import.meta.url));
const base = "https://nuvioweb-preview.pages.dev/demo/identity-progress";
export async function stageIdentityProgressDemo(destination) {
  const root = join(destination, "demo/identity-progress");
  const metas = ["watched", "progress"].map(purpose => ({ id: `nuvioweb-identity-${purpose}-original`, type: "movie", name: `NuvioWeb ${purpose} sync fixture`, description: "Original120-second CC0 rectangle and sine tone for optional development sync observations. No third-party media or account data.", poster: "https://nuvioweb-preview.pages.dev/demo/poster.svg" }));
  const resources = {
    "manifest.json": { id: "org.nuvioweb.identity-progress", version: "1.0.0", name: "NuvioWeb identity sync fixtures", types: ["movie"], idPrefixes: ["nuvioweb-identity-"], resources: ["catalog", "meta", "stream"], catalogs: [{id: "original", type: "movie", name: "Identity sync fixtures"}] },
    "catalog/movie/original.json": { metas }
  };
  for (const meta of metas) {
    resources[`meta/movie/${meta.id}.json`] = { meta };
    resources[`stream/movie/${meta.id}.json`] = { streams: [{ name: "Original120-second VP8/Opus sync fixture", title: "CC0 generated rectangle/tone", url: `${base}/media/original-progress-vp8-opus.webm`, mimeType: 'video/webm; codecs="vp8,opus"', behaviorHints: {notWebReady: false} }] };
  }
  for (const [path, value] of Object.entries(resources)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), JSON.stringify(value, null, 2) + "\n");
  }
  await mkdir(join(root, "media"), {recursive: true});
  for (const file of ["original-progress-vp8-opus.webm", "provenance.json"]) await cp(join(mediaRoot, file), join(root, "media", file));
  await writeFile(join(root, "LICENSE.txt"), "Original NuvioWeb procedural rectangle and sine tone: CC0 1.0 Universal.\nhttps://creativecommons.org/publicdomain/zero/1.0/\nGenerator: scripts/generate-progress-media.mjs in matching /SOURCE.txt revision.\nProvenance: /demo/identity-progress/media/provenance.json.\nNo third-party media, account data or credential-bearing URLs. Application remains GPL-3.0.\n");
}
