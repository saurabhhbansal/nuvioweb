import test from "node:test";
import assert from "node:assert/strict";

import {
  AUDIO_AVAILABILITY_KEYS,
  describeAudioTrackAvailability
} from "./audioTrackAvailability.js";

test("an empty track list says so plainly", () => {
  const result = describeAudioTrackAvailability({ trackCount: 0 });
  assert.equal(result.key, AUDIO_AVAILABILITY_KEYS.NO_TRACKS);
  assert.equal(result.tone, "empty");
  assert.match(result.fallback, /No audio tracks/);
});

test("duplicate identities are reported instead of offering a guess", () => {
  const result = describeAudioTrackAvailability({
    trackCount: 2,
    ambiguousCount: 2,
    availableCount: 0,
    unavailableCount: 2
  });
  assert.equal(result.key, AUDIO_AVAILABILITY_KEYS.AMBIGUOUS);
  assert.equal(result.tone, "warning");
  assert.match(result.fallback, /duplicate audio tracks/);
});

test("an unavailable player is distinguished from unknown compatibility", () => {
  const unavailable = describeAudioTrackAvailability({
    trackCount: 2,
    availableCount: 0,
    unavailableCount: 2
  });
  assert.equal(unavailable.key, AUDIO_AVAILABILITY_KEYS.UNAVAILABLE);
  assert.equal(unavailable.tone, "warning");

  const unknown = describeAudioTrackAvailability({
    trackCount: 2,
    availableCount: 0,
    unavailableCount: 0,
    unknownCount: 2
  });
  assert.equal(unknown.key, AUDIO_AVAILABILITY_KEYS.UNKNOWN);
  assert.equal(unknown.tone, "info");
  assert.match(unknown.fallback, /compatibility is unknown/);
});

test("available tracks never imply verified support", () => {
  const plain = describeAudioTrackAvailability({ trackCount: 2, availableCount: 2 });
  assert.equal(plain.key, AUDIO_AVAILABILITY_KEYS.AVAILABLE);
  assert.equal(plain.tone, "action");

  const predicted = describeAudioTrackAvailability({
    trackCount: 2,
    availableCount: 2,
    predictedCount: 1
  });
  assert.equal(predicted.key, AUDIO_AVAILABILITY_KEYS.AVAILABLE_WITH_PREDICTED);
  assert.match(predicted.fallback, /predicted, not verified/);
  for (const result of [plain, predicted]) {
    assert.doesNotMatch(result.fallback, /supported|verified playback|works/i);
  }
});

test("hostile or missing summaries stay bounded and honest", () => {
  // Missing or malformed state is "unknown", never "no tracks".
  for (const summary of [undefined, null, "tracks", 42, { trackCount: -1 }, { trackCount: "2" }]) {
    const result = describeAudioTrackAvailability(summary);
    assert.equal(result.key, AUDIO_AVAILABILITY_KEYS.UNKNOWN, String(summary));
  }
  // A genuine empty list is still "no tracks".
  assert.equal(
    describeAudioTrackAvailability({}).key,
    AUDIO_AVAILABILITY_KEYS.NO_TRACKS
  );
  const hostile = describeAudioTrackAvailability({
    trackCount: "<script>",
    ambiguousCount: Number.NaN,
    availableCount: 1.5,
    unknownCount: Infinity
  });
  assert.equal(hostile.key, AUDIO_AVAILABILITY_KEYS.UNKNOWN);
  assert.equal(typeof hostile.fallback, "string");
  assert.doesNotMatch(hostile.fallback, /<script/);
});
