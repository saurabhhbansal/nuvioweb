import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appDir = new URL("../", import.meta.url);

async function sourceFiles(directory) {
  const entries = await readdir(fileURLToPath(new URL(directory, appDir)), {
    recursive: true,
    withFileTypes: true
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js") && !entry.name.includes(".test."))
    .map((entry) => join(entry.parentPath, entry.name));
}

// The icon font only carries the icons listed next to it. An icon written into
// markup but left out of the subset shows its name as plain text, so a new one
// fails here until scripts/subset-material-icons.py is run again.
test("every icon named in material-icons markup is in the font subset", async () => {
  const kept = new Set(
    (await readFile(new URL("assets/fonts/material-icons-subset.names.txt", appDir), "utf8"))
      .split(/\r?\n/)
      .filter(Boolean)
  );
  const missing = new Set();
  for (const file of await sourceFiles("js/")) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/material-icons[^"'`>]*["'`][^>]*>\s*([a-z][a-z0-9_]*)\s*</g)) {
      if (!kept.has(match[1])) missing.add(match[1]);
    }
  }
  assert.ok(kept.size > 100, "the subset list looks truncated");
  assert.deepEqual([...missing].sort(), [], "rerun scripts/subset-material-icons.py");
});

test("the stylesheet loads the self-hosted fonts, not Google's", async () => {
  const base = await readFile(new URL("css/base.css", appDir), "utf8");
  assert.doesNotMatch(base, /@import/);
  assert.match(base, /assets\/fonts\/inter-latin-var\.woff2/);
  assert.match(base, /assets\/fonts\/material-icons-subset\.woff2/);
});
