import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const mediaRoot = fileURLToPath(new URL("../tests/fixtures/media/", import.meta.url));
const base = "https://nuvioweb-preview.pages.dev/demo";
const id = "nuvioweb-demo-original";

// Optional, static development-preview content. No auto-install, accounts,
// backend, third-party media or credential-bearing URLs are involved.
export async function stageLegalDemo(destination) {
  const root = join(destination, "demo");
  const subtitle = { id: "nuvioweb-demo-english", lang: "eng", url: `${base}/media/english.vtt` };
  const meta = {
    id, type: "movie", name: "NuvioWeb legal demo",
    description: "Original generated rectangles and sine tone, dedicated to the public domain under CC0. Short development playback check; no film, account or third-party media.",
    poster: `${base}/poster.svg`, releaseInfo: "2026"
  };
  const resources = {
    "manifest.json": {
      id: "org.nuvioweb.legal-demo", version: "1.0.0", name: "NuvioWeb legal demo",
      description: "Optional same-host CC0 browser playback check. No account required.",
      types: ["movie"], idPrefixes: ["nuvioweb-demo-"],
      resources: ["catalog", "meta", "stream", "subtitles"],
      catalogs: [{ id: "original", type: "movie", name: "NuvioWeb legal demo" }],
      logo: `${base}/poster.svg`
    },
    "catalog/movie/original.json": { metas: [meta] },
    [`meta/movie/${id}.json`]: { meta },
    [`stream/movie/${id}.json`]: { streams: [{
      name: "Original VP8/Opus demo", title: "CC0 generated pattern and tone",
      url: `${base}/media/procedural-vp8-opus.webm`, mimeType: 'video/webm; codecs="vp8,opus"',
      subtitles: [subtitle], behaviorHints: { notWebReady: false }
    }] },
    [`subtitles/movie/${id}.json`]: { subtitles: [subtitle] }
  };
  for (const [path, data] of Object.entries(resources)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), JSON.stringify(data, null, 2) + "\n");
  }
  await mkdir(join(root, "media"), { recursive: true });
  for (const file of ["procedural-vp8-opus.webm", "english.vtt", "provenance.json"]) {
    await cp(join(mediaRoot, file), join(root, "media", file));
  }
  await writeFile(join(root, "LICENSE.txt"), "NuvioWeb original generated media and English subtitle: CC0 1.0 Universal.\nhttps://creativecommons.org/publicdomain/zero/1.0/\nNo third-party film, music, artwork, account data or stream URL.\nGenerator: scripts/generate-legal-media.mjs in the matching source revision linked by /SOURCE.txt.\nMedia provenance: /demo/media/provenance.json.\nApplication source remains GPL-3.0.\n");
  await writeFile(join(root, "poster.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480" viewBox="0 0 320 480"><rect width="320" height="480" fill="#142033"/><rect x="60" y="170" width="200" height="120" fill="#81d4fa"/><text x="30" y="70" fill="white" font-size="24">NuvioWeb demo</text><text x="30" y="420" fill="white" font-size="18">Original CC0 media</text></svg>\n');
}
