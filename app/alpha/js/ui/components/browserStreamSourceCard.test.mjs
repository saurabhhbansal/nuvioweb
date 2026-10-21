import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSourceForDisplay, renderBrowserSourceCardContent } from "./browserStreamSourceCard.js";

const options = { badgeSettings: { showAddonLogo: false }, streamBadgesEnabled: false };

test("source cards stay compact and never create video elements", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement() { throw new Error("source cards must not probe"); } };
  try {
    const model = normalizeSourceForDisplay({ name: "Fixture 1080p", url: "https://fixture.invalid/a.mkv" }, options);
    assert.equal(model.sourceHint, null);
    const html = renderBrowserSourceCardContent(model);
    assert.doesNotMatch(html, /unknown|unverified|Provider label/i);
    assert.doesNotMatch(html, /stream-route-source-hint/);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("a header-restricted source shows one Needs headers badge", () => {
  const model = normalizeSourceForDisplay({
    name: "Fixture",
    url: "https://fixture.invalid/a.mp4",
    behaviorHints: { proxyHeaders: { request: { Referer: "fixture" } } }
  }, options);
  const html = renderBrowserSourceCardContent(model);
  assert.equal(html.match(/stream-route-source-hint/g)?.length, 1);
  assert.match(html, /Needs headers/);
});
