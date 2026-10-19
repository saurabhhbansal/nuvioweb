import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AUDIO_AVAILABILITY_KEYS,
  describeAudioTrackAvailability
} from "./audioTrackAvailability.js";

const stringsUrl = new URL("../../../res/values/strings.xml", import.meta.url);

// The module returns inline English fallbacks while the dialog resolves keys via
// t(). Those two copies must not drift: a resource that says something the module
// would not is exactly the kind of unverified claim this copy contract forbids.
async function readStringResources() {
  const xml = await readFile(stringsUrl, "utf8");
  const resources = new Map();
  for (const match of xml.matchAll(/<string name="([^"]+)">([\s\S]*?)<\/string>/g)) {
    resources.set(match[1], match[2]);
  }
  return resources;
}

test("every availability key exists in the string resources", async () => {
  const resources = await readStringResources();
  for (const key of Object.values(AUDIO_AVAILABILITY_KEYS)) {
    assert.ok(resources.has(key), `${key} is missing from strings.xml`);
  }
});

test("resource text matches the module fallback for every branch", async () => {
  const resources = await readStringResources();
  const summaries = [
    { trackCount: 0 },
    { trackCount: 2, ambiguousCount: 1 },
    { trackCount: 2, availableCount: 2 },
    { trackCount: 2, availableCount: 1, predictedCount: 1 },
    { trackCount: 2, unavailableCount: 2 },
    { trackCount: 2, unknownCount: 2 }
  ];
  for (const summary of summaries) {
    const { key, fallback } = describeAudioTrackAvailability(summary);
    assert.equal(
      resources.get(key),
      fallback,
      `${key} drifted from the module fallback (${JSON.stringify(summary)})`
    );
  }
});

test("no resource string makes a support or audibility claim", async () => {
  const resources = await readStringResources();
  for (const key of Object.values(AUDIO_AVAILABILITY_KEYS)) {
    assert.doesNotMatch(resources.get(key), /supported|audible|verified playback|works/i, key);
    assert.ok(resources.get(key).length <= 160, `${key} is longer than the copy bound`);
  }
});
