import test from "node:test";
import assert from "node:assert/strict";

import {
  RECOVERY_ACTIONS,
  RECOVERY_FAILURE_KIND,
  RECOVERY_REASONS,
  planAudioRecovery
} from "./playbackRecoveryPolicy.js";

const GENERATION = 7;

function track(key, overrides = {}) {
  return {
    generation: GENERATION,
    key,
    engine: "hls.js",
    engineTrackId: key,
    language: "en",
    role: "main",
    selectability: "available",
    ambiguous: false,
    ...overrides
  };
}

function audioFailure(overrides = {}) {
  return {
    kind: RECOVERY_FAILURE_KIND.AUDIO,
    stage: "playback",
    audioAttributable: true,
    ...overrides
  };
}

const base = {
  generation: GENERATION,
  currentGeneration: GENERATION,
  lastConfirmedTrackKey: "en-main",
  attempts: null,
  userChoice: null
};

test("no failure means no recovery action", () => {
  const result = planAudioRecovery({ ...base, tracks: [track("en-main")], failure: null });
  assert.deepEqual(result, {
    action: RECOVERY_ACTIONS.NONE,
    trackKey: null,
    reason: RECOVERY_REASONS.NO_FAILURE
  });
});

test("a generic failure is never treated as an audio failure", () => {
  const tracks = [track("en-main"), track("en-alt", { role: "alternate" })];
  for (const failure of [
    { kind: RECOVERY_FAILURE_KIND.GENERIC, stage: "playback", audioAttributable: false },
    { kind: RECOVERY_FAILURE_KIND.UNKNOWN, stage: "playback" },
    { kind: RECOVERY_FAILURE_KIND.AUDIO, stage: "playback", audioAttributable: "true" }
  ]) {
    const result = planAudioRecovery({ ...base, tracks, failedTrackKey: "en-main", failure });
    assert.equal(result.action, RECOVERY_ACTIONS.NONE);
    assert.equal(result.reason, RECOVERY_REASONS.AUDIO_NOT_ATTRIBUTABLE);
    assert.equal(result.trackKey, null);
  }
});

test("a stale generation yields no action even with an eligible alternate", () => {
  const tracks = [track("en-main"), track("en-alt", { role: "alternate" })];
  const result = planAudioRecovery({
    ...base,
    generation: 6,
    currentGeneration: 7,
    tracks,
    failedTrackKey: "en-main",
    failure: audioFailure()
  });
  assert.equal(result.action, RECOVERY_ACTIONS.NONE);
  assert.equal(result.reason, RECOVERY_REASONS.GENERATION_CHANGED);
});

test("a playback failure on a main track offers a same-language main alternate", () => {
  const tracks = [
    track("en-main"),
    track("en-second", { engineTrackId: "en-second" }),
    track("fr-main", { language: "fr" })
  ];
  const result = planAudioRecovery({
    ...base,
    tracks,
    failedTrackKey: "en-main",
    failure: audioFailure()
  });
  assert.equal(result.action, RECOVERY_ACTIONS.OFFER_TRACK);
  assert.equal(result.reason, RECOVERY_REASONS.ALTERNATE_ELIGIBLE);
  assert.equal(result.trackKey, "en-second");
});

test("another language is never substituted automatically", () => {
  const tracks = [track("en-main"), track("fr-main", { language: "fr" })];
  const result = planAudioRecovery({
    ...base,
    tracks,
    failedTrackKey: "en-main",
    lastConfirmedTrackKey: "",
    failure: audioFailure()
  });
  assert.equal(result.action, RECOVERY_ACTIONS.UNSUPPORTED);
  assert.equal(result.reason, RECOVERY_REASONS.NO_ALTERNATE);
  assert.equal(result.trackKey, null);
});

test("commentary is not offered for a main track and vice versa", () => {
  const mainFailed = planAudioRecovery({
    ...base,
    tracks: [track("en-main"), track("en-commentary", { role: "commentary" })],
    failedTrackKey: "en-main",
    lastConfirmedTrackKey: "",
    failure: audioFailure()
  });
  assert.equal(mainFailed.action, RECOVERY_ACTIONS.UNSUPPORTED);

  const commentaryFailed = planAudioRecovery({
    ...base,
    tracks: [track("en-commentary", { role: "commentary" }), track("en-main")],
    failedTrackKey: "en-commentary",
    lastConfirmedTrackKey: "",
    failure: audioFailure({ stage: "selection" })
  });
  assert.equal(commentaryFailed.action, RECOVERY_ACTIONS.UNSUPPORTED);
});

test("an unspecified language only matches another unspecified language", () => {
  const tracks = [track("unknown-main", { language: null }), track("en-main", { language: "en" })];
  const result = planAudioRecovery({
    ...base,
    tracks,
    failedTrackKey: "unknown-main",
    lastConfirmedTrackKey: "",
    failure: audioFailure()
  });
  assert.equal(result.action, RECOVERY_ACTIONS.UNSUPPORTED);
});

test("a failed selection restores the previous rendition once, then stops", () => {
  const tracks = [track("en-main"), track("en-alt", { role: "alternate" })];
  const first = planAudioRecovery({
    ...base,
    tracks,
    failedTrackKey: "en-alt",
    lastConfirmedTrackKey: "en-main",
    failure: audioFailure({ stage: "selection" })
  });
  assert.equal(first.action, RECOVERY_ACTIONS.RESTORE_TRACK);
  assert.equal(first.reason, RECOVERY_REASONS.RESTORE_ELIGIBLE);
  assert.equal(first.trackKey, "en-main");

  // A failed restore must not loop or substitute a different role.
  const second = planAudioRecovery({
    ...base,
    tracks,
    failedTrackKey: "en-alt",
    lastConfirmedTrackKey: "en-main",
    failure: audioFailure({ stage: "selection" }),
    attempts: { restore: 1 }
  });
  assert.equal(second.action, RECOVERY_ACTIONS.UNSUPPORTED);
  assert.equal(second.reason, RECOVERY_REASONS.RESTORE_TRIED);
  assert.equal(second.trackKey, null);
});

test("a failed playback offers the alternate first, then a restore once", () => {
  const tracks = [track("en-main"), track("en-second")];
  const offer = planAudioRecovery({
    ...base,
    tracks,
    failedTrackKey: "en-main",
    lastConfirmedTrackKey: "en-main",
    failure: audioFailure()
  });
  assert.equal(offer.action, RECOVERY_ACTIONS.OFFER_TRACK);
  assert.equal(offer.trackKey, "en-second");

  const restore = planAudioRecovery({
    ...base,
    tracks,
    failedTrackKey: "en-main",
    lastConfirmedTrackKey: "en-second",
    failure: audioFailure(),
    attempts: { alternate: 1 }
  });
  assert.equal(restore.action, RECOVERY_ACTIONS.RESTORE_TRACK);
  assert.equal(restore.trackKey, "en-second");

  const exhausted = planAudioRecovery({
    ...base,
    tracks,
    failedTrackKey: "en-main",
    lastConfirmedTrackKey: "en-second",
    failure: audioFailure(),
    attempts: { alternate: 1, restore: 1 }
  });
  assert.equal(exhausted.action, RECOVERY_ACTIONS.UNSUPPORTED);
});

test("a container failure is unsupported rather than an audio recovery", () => {
  const tracks = [track("en-main"), track("en-second")];
  const result = planAudioRecovery({
    ...base,
    tracks,
    failedTrackKey: "en-main",
    failure: { kind: RECOVERY_FAILURE_KIND.CONTAINER, stage: "playback", audioAttributable: true }
  });
  assert.equal(result.action, RECOVERY_ACTIONS.UNSUPPORTED);
  assert.equal(result.reason, RECOVERY_REASONS.UNSUPPORTED_FORMAT);
});

test("an empty track list is unsupported, not a silent no-op", () => {
  const result = planAudioRecovery({
    ...base,
    tracks: [],
    failedTrackKey: "en-main",
    failure: audioFailure()
  });
  assert.equal(result.action, RECOVERY_ACTIONS.UNSUPPORTED);
  assert.equal(result.reason, RECOVERY_REASONS.NO_TRACKS);
});

test("an ambiguous failed identity is never guessed at", () => {
  const tracks = [track("en-main"), { ...track("en-main"), engineTrackId: "dup" }];
  const result = planAudioRecovery({
    ...base,
    tracks,
    failedTrackKey: "en-main",
    failure: audioFailure()
  });
  assert.equal(result.action, RECOVERY_ACTIONS.NONE);
  assert.equal(result.reason, RECOVERY_REASONS.AMBIGUOUS_FAILED_TRACK);
});

test("an explicit user choice wins, but only for an addressable track", () => {
  const tracks = [
    track("en-main"),
    track("fr-main", { language: "fr" }),
    track("en-alt", { role: "alternate" })
  ];
  const chosen = planAudioRecovery({
    ...base,
    tracks,
    failedTrackKey: "en-main",
    failure: audioFailure(),
    userChoice: "fr-main"
  });
  assert.equal(chosen.action, RECOVERY_ACTIONS.OFFER_TRACK);
  assert.equal(chosen.reason, RECOVERY_REASONS.USER_CHOICE);
  assert.equal(chosen.trackKey, "fr-main");

  for (const choice of ["missing", "en-main"]) {
    const rejected = planAudioRecovery({
      ...base,
      tracks,
      failedTrackKey: "en-main",
      failure: audioFailure(),
      userChoice: choice
    });
    assert.equal(rejected.action, RECOVERY_ACTIONS.NONE, choice);
    assert.equal(rejected.reason, RECOVERY_REASONS.USER_CHOICE_UNAVAILABLE, choice);
  }

  const unavailable = planAudioRecovery({
    ...base,
    tracks: [...tracks, track("fr-alt", { language: "fr", selectability: "unavailable" })],
    failedTrackKey: "en-main",
    failure: audioFailure(),
    userChoice: "fr-alt"
  });
  assert.equal(unavailable.action, RECOVERY_ACTIONS.NONE);
  assert.equal(unavailable.reason, RECOVERY_REASONS.USER_CHOICE_UNAVAILABLE);
});

test("the plan is pure: inputs are not mutated and hostile input is bounded", () => {
  const tracks = Object.freeze([
    Object.freeze(track("en-main")),
    Object.freeze(track("en-second"))
  ]);
  const attempts = Object.freeze({ alternate: 0, restore: 0 });
  const failure = Object.freeze(audioFailure());
  assert.doesNotThrow(() =>
    planAudioRecovery({
      generation: GENERATION,
      currentGeneration: GENERATION,
      tracks,
      failedTrackKey: "en-main",
      lastConfirmedTrackKey: "en-main",
      failure,
      attempts,
      userChoice: null
    })
  );
  assert.equal(attempts.alternate, 0);

  // Hostile values must not throw or invent an action.
  for (const value of [null, undefined, "tracks", 42, {}]) {
    const result = planAudioRecovery({
      ...base,
      tracks: value,
      failedTrackKey: "en-main",
      failure: audioFailure()
    });
    assert.equal(typeof result.action, "string");
    assert.equal(result.trackKey, null);
  }
  const huge = Array.from({ length: 200 }, (_, index) => track(`t-${index}`));
  const bounded = planAudioRecovery({
    ...base,
    tracks: huge,
    failedTrackKey: "t-0",
    failure: audioFailure()
  });
  assert.equal(bounded.action, RECOVERY_ACTIONS.OFFER_TRACK);
  assert.equal(bounded.trackKey, "t-1");

  // Oversized keys are rejected rather than matched against a truncated value.
  const longKey = "k".repeat(500);
  const longResult = planAudioRecovery({
    ...base,
    tracks: [track(longKey), track("en-second")],
    failedTrackKey: longKey,
    failure: audioFailure()
  });
  assert.equal(longResult.action, RECOVERY_ACTIONS.UNSUPPORTED);
  assert.equal(longResult.trackKey, null);
});
