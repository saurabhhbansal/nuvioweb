import test from "node:test";
import assert from "node:assert/strict";

import {
  AUDIO_AVAILABILITY_KEYS,
  describeAudioTrackAvailability
} from "./audioTrackAvailability.js";

const NO_CLAIM = /supported|audible|verified playback|works/i;

test("a genuine empty list says there are no tracks", () => {
  const result = describeAudioTrackAvailability({
    trackCount: 0,
    ambiguousCount: 0,
    availableCount: 0,
    unavailableCount: 0,
    unknownCount: 0,
    predictedCount: 0
  });
  assert.equal(result.key, AUDIO_AVAILABILITY_KEYS.NO_TRACKS);
  assert.equal(result.tone, "empty");
  assert.match(result.fallback, /No audio tracks/);
});

test("a missing or non-numeric track count is unknown, not empty", () => {
  for (const summary of [
    {},
    [],
    { trackCount: undefined },
    { trackCount: "0" },
    { trackCount: -1 }
  ]) {
    const result = describeAudioTrackAvailability(summary);
    assert.equal(result.key, AUDIO_AVAILABILITY_KEYS.UNKNOWN, JSON.stringify(summary));
  }
});

test("contradictory counts are unknown instead of an action", () => {
  for (const summary of [
    { trackCount: 0, ambiguousCount: 1 },
    { trackCount: 1, availableCount: 2 },
    { trackCount: 1, availableCount: 1, unknownCount: 1 },
    { trackCount: 1, availableCount: 1, predictedCount: 2 }
  ]) {
    const result = describeAudioTrackAvailability(summary);
    assert.equal(result.key, AUDIO_AVAILABILITY_KEYS.UNKNOWN, JSON.stringify(summary));
  }
});

test("malformed secondary counts are unknown even when trackCount is valid", () => {
  for (const field of [
    "ambiguousCount",
    "availableCount",
    "unavailableCount",
    "unknownCount",
    "predictedCount"
  ]) {
    for (const value of ["1", true, 1.5, Number.NaN, Number.POSITIVE_INFINITY, -1, 2 ** 60]) {
      const summary = { trackCount: 2, availableCount: 2, [field]: value };
      const result = describeAudioTrackAvailability(summary);
      assert.equal(result.key, AUDIO_AVAILABILITY_KEYS.UNKNOWN, `${field}=${String(value)}`);
    }
  }
});

test("accessor-backed and exotic counts are unknown without throwing", () => {
  const accessor = { trackCount: 2, availableCount: 2 };
  Object.defineProperty(accessor, "ambiguousCount", {
    get() {
      throw new Error("boom");
    },
    enumerable: true
  });
  assert.doesNotThrow(() => describeAudioTrackAvailability(accessor));
  assert.equal(describeAudioTrackAvailability(accessor).key, AUDIO_AVAILABILITY_KEYS.UNKNOWN);

  const symbolCount = { trackCount: 2, availableCount: 2, ambiguousCount: Symbol("x") };
  assert.equal(describeAudioTrackAvailability(symbolCount).key, AUDIO_AVAILABILITY_KEYS.UNKNOWN);

  const nullProto = Object.create(null);
  nullProto.trackCount = 2;
  nullProto.availableCount = 2;
  assert.equal(describeAudioTrackAvailability(nullProto).key, AUDIO_AVAILABILITY_KEYS.AVAILABLE);

  for (const summary of [null, undefined, "tracks", 42]) {
    assert.equal(describeAudioTrackAvailability(summary).key, AUDIO_AVAILABILITY_KEYS.UNKNOWN);
  }
});

test("ambiguity outranks availability", () => {
  const result = describeAudioTrackAvailability({
    trackCount: 2,
    ambiguousCount: 1,
    availableCount: 1
  });
  assert.equal(result.key, AUDIO_AVAILABILITY_KEYS.AMBIGUOUS);
  assert.equal(result.tone, "warning");
  assert.match(result.fallback, /duplicate audio tracks/);
});

test("unavailable is distinct from unknown compatibility", () => {
  const unavailable = describeAudioTrackAvailability({
    trackCount: 2,
    unavailableCount: 2
  });
  assert.equal(unavailable.key, AUDIO_AVAILABILITY_KEYS.UNAVAILABLE);
  assert.equal(unavailable.tone, "warning");

  const unknown = describeAudioTrackAvailability({ trackCount: 2, unknownCount: 2 });
  assert.equal(unknown.key, AUDIO_AVAILABILITY_KEYS.UNKNOWN);
  assert.equal(unknown.tone, "info");
  assert.match(unknown.fallback, /compatibility is unknown/);
});

test("available copy never claims support, audibility or verified playback", () => {
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
    assert.doesNotMatch(result.fallback, NO_CLAIM);
  }
  // Declared but unclassified tracks are unknown, never an action.
  const unclassified = describeAudioTrackAvailability({ trackCount: 2 });
  assert.equal(unclassified.key, AUDIO_AVAILABILITY_KEYS.UNKNOWN);
});

test("every branch returns a reviewed fallback of bounded size", () => {
  const branches = [
    { trackCount: 0 },
    { trackCount: 2, ambiguousCount: 1 },
    { trackCount: 2, availableCount: 2 },
    { trackCount: 2, availableCount: 1, predictedCount: 1 },
    { trackCount: 2, unavailableCount: 2 },
    { trackCount: 2, unknownCount: 2 },
    {}
  ];
  for (const summary of branches) {
    const result = describeAudioTrackAvailability(summary);
    assert.ok(Object.values(AUDIO_AVAILABILITY_KEYS).includes(result.key));
    assert.equal(typeof result.fallback, "string");
    assert.ok(result.fallback.length > 0 && result.fallback.length <= 160);
    assert.doesNotMatch(result.fallback, /<|>/);
    assert.ok(["empty", "warning", "info", "action"].includes(result.tone));
    assert.doesNotMatch(result.fallback, NO_CLAIM);
  }
});
