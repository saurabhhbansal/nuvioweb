import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSourceForDisplay } from "./browserStreamSourceCard.js";

const options = { badgeSettings: { showAddonLogo: false }, streamBadgesEnabled: false };

test("source cards isolate conflicting declarations from MIME prediction caches in either order", () => {
  const previousDocument = globalThis.document;
  let calls = 0;
  globalThis.document = {
    createElement() { return { canPlayType() { calls++; return "probably"; } }; }
  };
  try {
    for (const [mimeType, conflictFirst] of [
      ['video/webm; codecs="vp8,opus"', false],
      ['video/webm; codecs="vp8"', true]
    ]) {
      const make = (codec) => ({
        url: "https://fixture.invalid/original.webm",
        mimeType,
        video: { codec }
      });
      const clean = make("vp8");
      const conflict = make("vp09.00.10.08");
      for (const source of conflictFirst ? [conflict, clean] : [clean, conflict]) {
        const model = normalizeSourceForDisplay(source, options);
        assert.ok(model.evidenceLines.includes(source === conflict
          ? "Browser support unknown"
          : "Browser predicts native support; playback unverified"));
      }
    }
    assert.equal(calls, 2);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
