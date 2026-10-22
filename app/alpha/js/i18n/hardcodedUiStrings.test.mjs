import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findHardcodedCopy, scanUi } from "./hardcodedUiStrings.mjs";

// New UI copy goes through `t(key, params, fallback)` with an English string in
// res/values/strings.xml, so the other locales can translate it.
//
// The baseline lists the English that was already written straight into
// js/ui when this check arrived. It may only shrink: a string that is not in
// it fails the check, and so does a baseline entry the code no longer has, so
// translating a string means deleting its line from the baseline too.

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BASELINE_FILE = path.join(ROOT, "js/i18n/hardcodedUiStrings.baseline.json");

function texts(source) {
  return findHardcodedCopy(source).map((item) => item.text);
}

function counts(list = []) {
  const map = new Map();
  for (const item of list) map.set(item, (map.get(item) || 0) + 1);
  return map;
}

// Entries of `a` beyond what `b` has, as "file: text" lines.
function excess(a, b) {
  const lines = [];
  for (const file of Object.keys(a).sort()) {
    const have = counts(b[file]);
    for (const [text, count] of counts(a[file])) {
      const extra = count - (have.get(text) || 0);
      for (let i = 0; i < extra; i += 1) lines.push(`${file}: ${JSON.stringify(text)}`);
    }
  }
  return lines;
}

test("flags copy assigned to text properties and attributes", () => {
  assert.deepEqual(texts('el.textContent = "Loading sources";'), ["Loading sources"]);
  assert.deepEqual(texts('el.title = ok ? "Saved" : "Not saved";'), ["Saved", "Not saved"]);
  assert.deepEqual(texts('el.setAttribute("aria-label", "Close dialog");'), ["Close dialog"]);
});

test("flags copy in markup, its labelled attributes and escaped holes", () => {
  assert.deepEqual(texts("const html = `<p class=\"x\">You're offline</p>`;"), ["You're offline"]);
  assert.deepEqual(texts('const html = `<button title="Mute" data-x="${a}">${b}</button>`;'), [
    "Mute"
  ]);
  assert.deepEqual(texts('const html = `<b>${escapeHtml(muted ? "Unmute" : "Mute")}</b>`;'), [
    "Unmute",
    "Mute"
  ]);
});

test("flags copy handed to dialogs as title or label", () => {
  assert.deepEqual(texts('new Dialog({ title: "Remove item?", buttons: [{ label: "Remove" }] });'), [
    "Remove item?",
    "Remove"
  ]);
});

test("ignores translated copy, class names, icons, urls and data attributes", () => {
  const source = [
    'el.textContent = t("player_mute", {}, "Mute");',
    'el.title = I18n.t("a", {}, { fallback: "Fallback text" });',
    'const html = `<span class="material-icons focusable is-on">play_arrow</span>`;',
    'const a = `<a href="https://example.com/x" data-label="Some Value" id="main-nav"></a>`;',
    'const b = `<img src="${src}" alt="">${escapeHtml(t("k", {}, "Translated"))}`;',
    'const c = `<div style="${x ? "color: red" : ""}">${count}</div>`;'
  ].join("\n");
  assert.deepEqual(texts(source), []);
});

test("js/ui has no hard-coded copy beyond the shrinking baseline", async () => {
  const [current, baseline] = await Promise.all([
    scanUi(ROOT),
    readFile(BASELINE_FILE, "utf8").then(JSON.parse)
  ]);
  const added = excess(current, baseline);
  assert.deepEqual(
    added,
    [],
    "Hard-coded UI copy found. Use t(key, params, fallback) and add the English to " +
      "res/values/strings.xml instead of adding it to the baseline:\n" +
      added.join("\n")
  );
  const stale = excess(baseline, current);
  assert.deepEqual(
    stale,
    [],
    "These strings are no longer hard-coded. Delete them from " +
      "js/i18n/hardcodedUiStrings.baseline.json:\n" +
      stale.join("\n")
  );
});
