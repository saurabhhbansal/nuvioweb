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
  attempts: null
};

test("no failure means no recovery action", () => {
  assert.deepEqual(planAudioRecovery({ ...base, tracks: [track("en-main")], failure: null }), {
    action: RECOVERY_ACTIONS.NONE,
    trackKey: null,
    reason: RECOVERY_REASONS.NO_FAILURE
  });
});

test("a generic failure is never treated as an audio failure", () => {
  const tracks = [track("en-main"), track("en-second")];
  for (const failure of [
    { kind: RECOVERY_FAILURE_KIND.GENERIC, stage: "playback", audioAttributable: false }
  ]) {
    const result = planAudioRecovery({
      ...base,
      tracks,
      failedTrackKey: "en-main",
      failure,
      // Exhausted budgets must not turn a generic failure into an offer.
      attempts: { alternate: 1, restore: 1 }
    });
    assert.equal(result.action, RECOVERY_ACTIONS.NONE);
    assert.equal(result.reason, RECOVERY_REASONS.AUDIO_NOT_ATTRIBUTABLE);
    assert.equal(result.trackKey, null);
  }
  // Non-boolean attribution flags are malformed state, not attributable audio.
  for (const audioAttributable of ["true", 1]) {
    const malformed = planAudioRecovery({
      ...base,
      tracks,
      failedTrackKey: "en-main",
      failure: { kind: RECOVERY_FAILURE_KIND.AUDIO, stage: "playback", audioAttributable }
    });
    assert.equal(malformed.action, RECOVERY_ACTIONS.NONE);
    assert.equal(malformed.reason, RECOVERY_REASONS.INVALID_STATE);
  }
  // A missing attribution flag is also malformed, never "attributable".
  const missing = planAudioRecovery({
    ...base,
    tracks,
    failedTrackKey: "en-main",
    failure: { kind: RECOVERY_FAILURE_KIND.AUDIO, stage: "playback" }
  });
  assert.equal(missing.action, RECOVERY_ACTIONS.NONE);
  assert.equal(missing.reason, RECOVERY_REASONS.INVALID_STATE);
});

test("a stale generation or stale snapshot yields no action", () => {
  const stale = planAudioRecovery({
    ...base,
    generation: 6,
    currentGeneration: 7,
    tracks: [track("en-main"), track("en-second")],
    failedTrackKey: "en-main",
    failure: audioFailure()
  });
  assert.equal(stale.reason, RECOVERY_REASONS.GENERATION_CHANGED);

  const staleFailed = planAudioRecovery({
    ...base,
    tracks: [track("en-main", { generation: 6 }), track("en-second")],
    failedTrackKey: "en-main",
    failure: audioFailure()
  });
  assert.equal(staleFailed.reason, RECOVERY_REASONS.GENERATION_CHANGED);

  // A stale candidate is not eligible even though the failed track is current.
  const staleCandidate = planAudioRecovery({
    ...base,
    tracks: [track("en-main"), track("en-second", { generation: 6 })],
    failedTrackKey: "en-main",
    lastConfirmedTrackKey: "",
    failure: audioFailure()
  });
  assert.equal(staleCandidate.action, RECOVERY_ACTIONS.UNSUPPORTED);
  assert.equal(staleCandidate.reason, RECOVERY_REASONS.NO_ALTERNATE);
});

test("a playback failure on a main track offers a same-language main alternate", () => {
  const result = planAudioRecovery({
    ...base,
    tracks: [track("en-main"), track("en-second"), track("fr-main", { language: "fr" })],
    failedTrackKey: "en-main",
    failure: audioFailure()
  });
  assert.equal(result.action, RECOVERY_ACTIONS.OFFER_TRACK);
  assert.equal(result.reason, RECOVERY_REASONS.ALTERNATE_ELIGIBLE);
  assert.equal(result.trackKey, "en-second");
});

test("another language is never substituted automatically", () => {
  const result = planAudioRecovery({
    ...base,
    tracks: [track("en-main"), track("fr-main", { language: "fr" })],
    failedTrackKey: "en-main",
    lastConfirmedTrackKey: "fr-main",
    failure: audioFailure()
  });
  // Not even a "restore" may switch to French during a playback failure.
  assert.equal(result.action, RECOVERY_ACTIONS.UNSUPPORTED);
  assert.equal(result.reason, RECOVERY_REASONS.NO_ALTERNATE);
});

test("an unspecified language only matches another unspecified language", () => {
  const match = planAudioRecovery({
    ...base,
    tracks: [
      track("unknown-main", { language: null }),
      track("unknown-second", { language: null }),
      track("en-main")
    ],
    failedTrackKey: "unknown-main",
    lastConfirmedTrackKey: "",
    failure: audioFailure()
  });
  assert.equal(match.action, RECOVERY_ACTIONS.OFFER_TRACK);
  assert.equal(match.trackKey, "unknown-second");

  const noMatch = planAudioRecovery({
    ...base,
    tracks: [track("unknown-main", { language: null }), track("en-main")],
    failedTrackKey: "unknown-main",
    lastConfirmedTrackKey: "",
    failure: audioFailure()
  });
  assert.equal(noMatch.action, RECOVERY_ACTIONS.UNSUPPORTED);
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

  // The documented selection-restore exception is still capped at one.
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

test("a failed playback offers the alternate first, then a compatible restore", () => {
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
  assert.equal(exhausted.reason, RECOVERY_REASONS.RESTORE_TRIED);
});

test("a container failure is unsupported rather than an audio recovery", () => {
  const result = planAudioRecovery({
    ...base,
    tracks: [track("en-main"), track("en-second")],
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

test("ambiguous identities fail closed", () => {
  const duplicateFailed = planAudioRecovery({
    ...base,
    tracks: [track("en-main"), track("en-main", { engineTrackId: "dup" })],
    failedTrackKey: "en-main",
    failure: audioFailure()
  });
  assert.equal(duplicateFailed.action, RECOVERY_ACTIONS.NONE);
  assert.equal(duplicateFailed.reason, RECOVERY_REASONS.AMBIGUOUS_FAILED_TRACK);

  const flagged = planAudioRecovery({
    ...base,
    tracks: [track("en-main", { ambiguous: true }), track("en-second")],
    failedTrackKey: "en-main",
    failure: audioFailure()
  });
  assert.equal(flagged.reason, RECOVERY_REASONS.AMBIGUOUS_FAILED_TRACK);

  const duplicateCandidate = planAudioRecovery({
    ...base,
    tracks: [track("en-main"), track("en-second"), track("en-second", { engineTrackId: "dup" })],
    failedTrackKey: "en-main",
    lastConfirmedTrackKey: "",
    failure: audioFailure()
  });
  assert.equal(duplicateCandidate.action, RECOVERY_ACTIONS.NONE);
  assert.equal(duplicateCandidate.reason, RECOVERY_REASONS.AMBIGUOUS_CANDIDATE);

  const duplicateRestore = planAudioRecovery({
    ...base,
    tracks: [track("en-main"), track("en-second"), track("en-second", { engineTrackId: "dup" })],
    failedTrackKey: "en-main",
    lastConfirmedTrackKey: "en-second",
    failure: audioFailure({ stage: "selection" })
  });
  assert.equal(duplicateRestore.action, RECOVERY_ACTIONS.NONE);
  assert.equal(duplicateRestore.reason, RECOVERY_REASONS.AMBIGUOUS_CANDIDATE);
});

test("oversized keys are rejected instead of truncating into a match", () => {
  const prefix = "k".repeat(160);
  const result = planAudioRecovery({
    ...base,
    tracks: [track(prefix), track(`${prefix}-extended`), track("en-second")],
    failedTrackKey: `${prefix}-extended`,
    lastConfirmedTrackKey: "",
    failure: audioFailure()
  });
  assert.equal(result.action, RECOVERY_ACTIONS.NONE);
  assert.equal(result.reason, RECOVERY_REASONS.INVALID_KEY);

  const emptyKey = planAudioRecovery({
    ...base,
    tracks: [track("en-main")],
    failedTrackKey: "",
    failure: audioFailure()
  });
  assert.equal(emptyKey.reason, RECOVERY_REASONS.INVALID_KEY);
});

test("malformed state fails closed instead of re-opening the budget", () => {
  const tracks = [track("en-main"), track("en-second")];
  for (const attempts of [
    { alternate: -1, restore: 0 },
    { alternate: 0.5, restore: 0 },
    { alternate: Number.NaN, restore: 0 },
    { alternate: Number.POSITIVE_INFINITY, restore: 0 },
    { alternate: "1", restore: 0 },
    { alternate: true, restore: 0 },
    { alternate: 0, restore: 5000 },
    { alternate: {} },
    "attempts"
  ]) {
    const result = planAudioRecovery({
      ...base,
      tracks,
      failedTrackKey: "en-main",
      failure: audioFailure(),
      attempts
    });
    assert.equal(result.action, RECOVERY_ACTIONS.NONE, JSON.stringify(attempts));
    assert.equal(result.reason, RECOVERY_REASONS.INVALID_STATE, JSON.stringify(attempts));
  }
});

test("accessor-backed tracks and failures are not trusted", () => {
  const getterTrack = track("en-main");
  Object.defineProperty(getterTrack, "key", { get: () => "en-main", enumerable: true });
  const accessor = planAudioRecovery({
    ...base,
    tracks: [getterTrack, track("en-second")],
    failedTrackKey: "en-main",
    failure: audioFailure()
  });
  assert.equal(accessor.action, RECOVERY_ACTIONS.NONE);
  assert.equal(accessor.reason, RECOVERY_REASONS.INVALID_STATE);

  const inherited = Object.create({ audioAttributable: true });
  inherited.kind = RECOVERY_FAILURE_KIND.AUDIO;
  inherited.stage = "playback";
  const inheritedResult = planAudioRecovery({
    ...base,
    tracks: [track("en-main"), track("en-second")],
    failedTrackKey: "en-main",
    failure: inherited
  });
  assert.equal(inheritedResult.action, RECOVERY_ACTIONS.NONE);
  assert.equal(inheritedResult.reason, RECOVERY_REASONS.INVALID_STATE);

  const throwing = track("en-main");
  Object.defineProperty(throwing, "role", {
    get() {
      throw new Error("boom");
    },
    enumerable: true
  });
  assert.doesNotThrow(() =>
    planAudioRecovery({
      ...base,
      tracks: [throwing, track("en-second")],
      failedTrackKey: "en-main",
      failure: audioFailure()
    })
  );
});

test("the plan is pure and bounds hostile input", () => {
  const tracks = Object.freeze([
    Object.freeze(track("en-main")),
    Object.freeze(track("en-second"))
  ]);
  const attempts = Object.freeze({ alternate: 0, restore: 0 });
  const failure = Object.freeze(audioFailure());
  const result = planAudioRecovery({
    ...base,
    tracks,
    failedTrackKey: "en-main",
    failure,
    attempts
  });
  assert.equal(result.action, RECOVERY_ACTIONS.OFFER_TRACK);
  assert.equal(attempts.alternate, 0);

  for (const value of [
    null,
    "tracks",
    42,
    {},
    Array.from({ length: 33 }, (_, index) => track(`t-${index}`))
  ]) {
    const hostile = planAudioRecovery({
      ...base,
      tracks: value,
      failedTrackKey: "en-main",
      failure: audioFailure()
    });
    assert.equal(hostile.action, RECOVERY_ACTIONS.NONE, String(value));
    assert.equal(hostile.reason, RECOVERY_REASONS.INVALID_STATE, String(value));
  }

  // An omitted track list is the empty-list case, not invalid state.
  const omitted = planAudioRecovery({
    ...base,
    tracks: undefined,
    failedTrackKey: "en-main",
    failure: audioFailure()
  });
  assert.equal(omitted.action, RECOVERY_ACTIONS.UNSUPPORTED);
  assert.equal(omitted.reason, RECOVERY_REASONS.NO_TRACKS);

  // The 32-track bound is a real limit: the 32nd track is still addressable.
  const bounded = planAudioRecovery({
    ...base,
    tracks: Array.from({ length: 32 }, (_, index) => track(`t-${index}`)),
    failedTrackKey: "t-0",
    lastConfirmedTrackKey: "",
    failure: audioFailure()
  });
  assert.equal(bounded.action, RECOVERY_ACTIONS.OFFER_TRACK);
  assert.equal(bounded.trackKey, "t-1");
});
