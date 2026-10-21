import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { extractLocalLinks, findBrokenLinks } from "./check-docs.mjs";

const fixtures = [];
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "nuvio-doc-check-"));
  fixtures.push(root);
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "README.md"), "# Home\n");
  writeFileSync(join(root, "docs", "guide.md"), "# Guide\n");
  return root;
}
afterEach(() => {
  while (fixtures.length) rmSync(fixtures.pop(), { recursive: true, force: true });
});

test("valid links across directories and with fragments resolve", () => {
  const root = makeRepo();
  writeFileSync(join(root, "README.md"), "[guide](docs/guide.md#intro)\n[dir](docs/)\n");
  assert.deepEqual(findBrokenLinks(root, ["README.md"]), []);
});

test("missing local target is a failure", () => {
  const root = makeRepo();
  writeFileSync(join(root, "docs", "guide.md"), "[missing](does-not-exist.md)\n");
  assert.deepEqual(findBrokenLinks(root, ["docs"]).map(({ reason }) => reason), ["target does not exist"]);
});

test("external URLs and same-page anchors are ignored", () => {
  assert.deepEqual(
    extractLocalLinks("[web](https://example.com/a) [mail](mailto:example@org.net) [here](#section)"),
    []
  );
});

test("file paths that escape the repository are rejected", () => {
  const root = makeRepo();
  writeFileSync(join(root, "README.md"), "[outside](../../secret.txt)\n");
  assert.equal(findBrokenLinks(root, ["README.md"])[0].reason, "path escapes repository");
});

test("fenced examples do not create false link failures", () => {
  assert.deepEqual(extractLocalLinks("~~~md\n[not-real](missing.md)\n~~~\n[real](README.md)"), ["README.md"]);
});

test("bad percent encoding is reported without crashing", () => {
  const root = makeRepo();
  writeFileSync(join(root, "README.md"), "[bad](%XX.md)\n");
  assert.equal(findBrokenLinks(root, ["README.md"])[0].reason, "invalid URL encoding");
});

test("docs/archive is not scanned for broken links", () => {
  const root = makeRepo();
  mkdirSync(join(root, "docs", "archive", "old"), { recursive: true });
  writeFileSync(join(root, "docs", "archive", "old", "note.md"), "[gone](missing.md)\n");
  writeFileSync(join(root, "docs", "archive.md"), "[still checked](missing.md)\n");
  const files = findBrokenLinks(root, ["docs"]).map(({ file }) => file.split("\\").join("/"));
  assert.deepEqual(files, ["docs/archive.md"]);
});
