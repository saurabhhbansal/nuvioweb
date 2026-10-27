import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { imageFallbackAttribute, installImageFallbacks, runImageFallback } from "./imageFallback.js";

function fakeImage(mode, { dataset = {}, next = null, parent = null, src = "https://img.example/a.jpg" } = {}) {
  const attributes = new Map([["data-img-fallback", mode], ["src", src]]);
  return {
    tagName: "IMG",
    hidden: false,
    removed: false,
    dataset: { ...dataset },
    nextElementSibling: next,
    parentElement: parent,
    classList: { names: new Set(), add(name) { this.names.add(name); } },
    get src() { return attributes.get("src") || ""; },
    set src(value) { attributes.set("src", value); },
    getAttribute: (name) => attributes.get(name) ?? null,
    removeAttribute: (name) => attributes.delete(name),
    remove() { this.removed = true; }
  };
}

test("templates get a data attribute, never an inline handler", () => {
  assert.equal(imageFallbackAttribute("hide"), ' data-img-fallback="hide"');
  assert.throws(() => imageFallbackAttribute("alert(1)"));
});

test("hide, hide-reveal and remove behave like the handlers they replace", () => {
  const hidden = fakeImage("hide");
  runImageFallback(hidden);
  assert.equal(hidden.hidden, true);

  const label = { hidden: true };
  const revealed = fakeImage("hide-reveal", { next: label });
  runImageFallback(revealed);
  assert.equal(revealed.hidden, true);
  assert.equal(label.hidden, false);
  // No sibling: still hides, does not throw.
  runImageFallback(fakeImage("hide-reveal"));

  const removed = fakeImage("remove");
  runImageFallback(removed);
  assert.equal(removed.removed, true);
});

test("swap-src retries once with the fallback", () => {
  const image = fakeImage("swap-src", { dataset: { fallbackSrc: "https://img.example/b.jpg" } });
  runImageFallback(image);
  assert.equal(image.src, "https://img.example/b.jpg");
  assert.equal(runImageFallback(image), false);
});

test("src-then-hide-reveal tries the fallback, then shows the placeholder", () => {
  const placeholder = { hidden: true };
  const image = fakeImage("src-then-hide-reveal", { dataset: { fallbackSrc: "https://img.example/b.jpg" }, next: placeholder });
  runImageFallback(image);
  assert.equal(image.src, "https://img.example/b.jpg");
  assert.equal(image.hidden, false);
  runImageFallback(image);
  assert.equal(image.hidden, true);
  assert.equal(placeholder.hidden, false);
});

test("queue walks the encoded fallbacks, drops <picture> sources, then shows a placeholder", () => {
  const sources = [{ removed: false, remove() { this.removed = true; } }];
  const picture = { tagName: "PICTURE", querySelectorAll: () => sources };
  const image = fakeImage("queue", {
    parent: picture,
    dataset: { fallbackSrcs: [encodeURIComponent("https://img.example/b.jpg?x=1|2")].join("|") }
  });
  runImageFallback(image);
  assert.equal(sources[0].removed, true);
  assert.equal(image.src, "https://img.example/b.jpg?x=1|2");
  assert.equal(image.dataset.fallbackSrcs, "");
  runImageFallback(image);
  assert.equal(image.getAttribute("src"), null);
  assert.equal(image.classList.names.has("placeholder"), true);
});

test("one capture-phase listener handles image errors and expand toggles", () => {
  const listeners = [];
  const root = { addEventListener: (type, handler, capture) => listeners.push({ type, handler, capture }) };
  installImageFallbacks(root);
  installImageFallbacks(root);
  assert.equal(listeners.length, 2);
  const error = listeners.find((entry) => entry.type === "error");
  assert.equal(error.capture, true);
  const image = fakeImage("hide");
  error.handler({ target: image });
  assert.equal(image.hidden, true);

  const toggled = new Set();
  const title = { classList: { toggle: (name) => (toggled.has(name) ? toggled.delete(name) : toggled.add(name)) } };
  listeners.find((entry) => entry.type === "click").handler({ target: { closest: () => title } });
  assert.equal(toggled.has("is-expanded"), true);
});

test("no rendered template or the app shell carries an inline event handler", async () => {
  const files = [
    "../../index.html",
    "./screens/cast/castDetailScreen.js",
    "./screens/detail/metaDetailsScreen.js",
    "./screens/home/homeScreen.js",
    "./screens/search/searchScreen.js",
    "./screens/supporters/supportersContributorsScreen.js"
  ];
  for (const file of files) {
    const text = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(text, /\son[a-z]+="/, file);
  }
  const shell = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /<script(?![^>]*\bsrc=)[^>]*>/, "index.html has an inline <script>");
});
