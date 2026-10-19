import test from "node:test";
import assert from "node:assert/strict";

import { RECOVERY_ACTIONS, RECOVERY_REASONS } from "./playbackRecoveryPolicy.js";
import { COORDINATOR_REASONS, createRecoveryCoordinator } from "./recoveryCoordinator.js";

const GEN = 5;

function track(key, overrides = {}) {
  return {
    generation: GEN,
    key,
    language: "en",
    role: "main",
    selectability: "available",
    ambiguous: false,
    ...overrides
  };
}

const failure = { kind: "audio", stage: "playback", audioAttributable: true };

test("an invalid generation refuses to start or plan", () => {
  const coordinator = createRecoveryCoordinator({ generation: "5" });
  assert.equal(coordinator.begin("en-main").reason, COORDINATOR_REASONS.INVALID_REQUEST);
  const plan = coordinator.plan({
    tracks: [track("en-main"), track("en-second")],
    failure
  });
  assert.equal(plan.action, RECOVERY_ACTIONS.NONE);
  assert.equal(plan.reason, COORDINATOR_REASONS.INVALID_REQUEST);
  assert.equal(plan.recorded, false);
});

test("an unstarted coordinator reports not-started instead of a misleading plan", () => {
  const coordinator = createRecoveryCoordinator({ generation: GEN });
  const plan = coordinator.plan({
    tracks: [track("en-main"), track("en-second")],
    failure
  });
  assert.deepEqual(plan, {
    action: RECOVERY_ACTIONS.NONE,
    trackKey: null,
    reason: COORDINATOR_REASONS.NOT_STARTED,
    recorded: false
  });
  assert.equal(coordinator.snapshot().attempted.length, 0);
});

test("the first plan offers and records the alternate atomically", () => {
  const coordinator = createRecoveryCoordinator({ generation: GEN });
  coordinator.begin("en-main");
  const plan = coordinator.plan({
    tracks: [track("en-main"), track("en-second")],
    failure
  });
  assert.equal(plan.action, RECOVERY_ACTIONS.OFFER_TRACK);
  assert.equal(plan.trackKey, "en-second");
  assert.equal(plan.recorded, true);
  assert.deepEqual(coordinator.snapshot().attempted, [
    { kind: "alternate", trackKey: "en-second" }
  ]);
});

test("re-planning the same failure cannot repeat the offer", () => {
  const coordinator = createRecoveryCoordinator({ generation: GEN });
  coordinator.begin("en-main");
  const tracks = [track("en-main"), track("en-second")];
  assert.equal(coordinator.plan({ tracks, failure }).recorded, true);
  const again = coordinator.plan({ tracks, failure });
  assert.equal(again.recorded, false);
  assert.notEqual(again.trackKey, "en-second");
  assert.equal(coordinator.snapshot().attempted.length, 1);
});

test("a failed selection restores once, and a replay is refused", () => {
  const coordinator = createRecoveryCoordinator({ generation: GEN });
  coordinator.begin("en-alt");
  const tracks = [track("en-main"), track("en-alt", { role: "alternate" })];
  const first = coordinator.plan({
    tracks,
    lastConfirmedTrackKey: "en-main",
    failure: { kind: "audio", stage: "selection", audioAttributable: true }
  });
  assert.equal(first.action, RECOVERY_ACTIONS.RESTORE_TRACK);
  assert.equal(first.trackKey, "en-main");
  assert.equal(first.recorded, true);

  const replay = coordinator.plan({
    tracks,
    lastConfirmedTrackKey: "en-main",
    failure: { kind: "audio", stage: "selection", audioAttributable: true }
  });
  assert.equal(replay.recorded, false);
  assert.equal(replay.trackKey, null);
  assert.equal(coordinator.snapshot().restoreAttempts, 1);
});

test("a non-audio failure is reported without consuming an attempt", () => {
  const coordinator = createRecoveryCoordinator({ generation: GEN });
  coordinator.begin("en-main");
  const plan = coordinator.plan({
    tracks: [track("en-main"), track("en-second")],
    failure: { kind: "generic", stage: "playback", audioAttributable: false }
  });
  assert.equal(plan.action, RECOVERY_ACTIONS.NONE);
  assert.equal(plan.reason, RECOVERY_REASONS.AUDIO_NOT_ATTRIBUTABLE);
  assert.equal(plan.recorded, false);
  assert.equal(coordinator.snapshot().attempted.length, 0);
});

test("a closed coordinator refuses further plans", () => {
  const coordinator = createRecoveryCoordinator({ generation: GEN });
  coordinator.begin("en-main");
  assert.equal(coordinator.close("navigation"), true);
  const plan = coordinator.plan({
    tracks: [track("en-main"), track("en-second")],
    failure
  });
  assert.equal(plan.action, RECOVERY_ACTIONS.NONE);
  assert.equal(plan.reason, COORDINATOR_REASONS.CLOSED);
  assert.equal(plan.recorded, false);
});

test("a stale generation cannot invalidate the live coordinator", () => {
  const coordinator = createRecoveryCoordinator({ generation: GEN });
  coordinator.begin("en-main");
  assert.equal(coordinator.isCurrent(4), false);
  assert.equal(coordinator.invalidate(4).reason, "stale-generation");
  assert.equal(coordinator.isCurrent(GEN), true);
});

test("a record refusal replaces the proposal, even across kinds", () => {
  // Alternate en-second is attempted first; a later selection failure then
  // proposes restoring en-second, which the operation refuses as already
  // attempted. The coordinator must report that refusal, not the proposal.
  const coordinator = createRecoveryCoordinator({ generation: GEN });
  coordinator.begin("en-main");
  const tracks = [track("en-main"), track("en-second")];
  const alternate = coordinator.plan({ tracks, failure });
  assert.equal(alternate.action, RECOVERY_ACTIONS.OFFER_TRACK);
  assert.equal(alternate.trackKey, "en-second");
  assert.equal(alternate.recorded, true);

  const before = coordinator.snapshot();
  const restoreOfAttempted = coordinator.plan({
    tracks,
    lastConfirmedTrackKey: "en-second",
    failure: { kind: "audio", stage: "selection", audioAttributable: true }
  });
  assert.equal(restoreOfAttempted.action, RECOVERY_ACTIONS.UNSUPPORTED);
  assert.equal(restoreOfAttempted.reason, "already-attempted");
  assert.equal(restoreOfAttempted.trackKey, null);
  assert.equal(restoreOfAttempted.recorded, false);
  assert.deepEqual(coordinator.snapshot(), before);
});

test("restore-then-alternate replay is also refused", () => {
  const coordinator = createRecoveryCoordinator({ generation: GEN });
  coordinator.begin("en-alt");
  const tracks = [track("en-main"), track("en-alt", { role: "alternate" }), track("en-second")];
  const restore = coordinator.plan({
    tracks,
    lastConfirmedTrackKey: "en-main",
    failure: { kind: "audio", stage: "selection", audioAttributable: true }
  });
  assert.equal(restore.action, RECOVERY_ACTIONS.RESTORE_TRACK);
  assert.equal(restore.trackKey, "en-main");
  assert.equal(restore.recorded, true);

  const alternateOfAttempted = coordinator.plan({
    tracks,
    lastConfirmedTrackKey: "",
    // A playback failure proposes en-main as the compatible alternate.
    failure
  });
  assert.equal(alternateOfAttempted.recorded, false);
  assert.equal(alternateOfAttempted.trackKey, null);
  assert.deepEqual(coordinator.snapshot().attempted, [{ kind: "restore", trackKey: "en-main" }]);
});

test("planner counts are synchronized with the operation", () => {
  const coordinator = createRecoveryCoordinator({ generation: GEN });
  coordinator.begin("en-main");
  const tracks = [track("en-main"), track("en-second"), track("en-third")];
  assert.equal(coordinator.plan({ tracks, failure }).recorded, true);
  // With the alternate budget spent the planner itself reports alternate-tried.
  const afterAlternate = coordinator.plan({ tracks, failure });
  assert.equal(afterAlternate.reason, "alternate-tried");
  assert.equal(afterAlternate.recorded, false);
  assert.equal(coordinator.snapshot().alternateAttempts, 1);

  const second = createRecoveryCoordinator({ generation: GEN });
  second.begin("en-alt");
  const selectionTracks = [track("en-main"), track("en-alt", { role: "alternate" })];
  assert.equal(
    second.plan({
      tracks: selectionTracks,
      lastConfirmedTrackKey: "en-main",
      failure: { kind: "audio", stage: "selection", audioAttributable: true }
    }).recorded,
    true
  );
  const afterRestore = second.plan({
    tracks: selectionTracks,
    lastConfirmedTrackKey: "en-main",
    failure: { kind: "audio", stage: "selection", audioAttributable: true }
  });
  assert.equal(afterRestore.reason, "restore-tried");
  assert.equal(second.snapshot().restoreAttempts, 1);
});

test("every invalid generation shape is refused consistently", () => {
  for (const generation of [
    undefined,
    null,
    "5",
    0,
    2.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    2 ** 60
  ]) {
    const coordinator = createRecoveryCoordinator({ generation });
    assert.equal(
      coordinator.begin("en-main").reason,
      COORDINATOR_REASONS.INVALID_REQUEST,
      String(generation)
    );
    const plan = coordinator.plan({ tracks: [track("en-main")], failure });
    assert.equal(plan.reason, COORDINATOR_REASONS.INVALID_REQUEST, String(generation));
    assert.equal(plan.recorded, false);
    assert.equal(coordinator.isCurrent(GEN), false);
    assert.equal(coordinator.invalidate(GEN).ok, false);
  }
});

test("frozen inputs and snapshots cannot corrupt the coordinator", () => {
  const coordinator = createRecoveryCoordinator({ generation: GEN });
  coordinator.begin("en-main");
  const tracks = Object.freeze([
    Object.freeze(track("en-main")),
    Object.freeze(track("en-second"))
  ]);
  const plan = coordinator.plan({ tracks, failure });
  assert.equal(plan.recorded, true);
  const snapshot = coordinator.snapshot();
  snapshot.attempted.push({ kind: "alternate", trackKey: "forged" });
  snapshot.alternateAttempts = 0;
  assert.equal(coordinator.snapshot().attempted.length, 1);
  assert.equal(coordinator.snapshot().alternateAttempts, 1);
  // A stale invalidation leaves it usable; a current one closes it.
  assert.equal(coordinator.invalidate(4).reason, "stale-generation");
  assert.equal(coordinator.plan({ tracks, failure }).recorded, false);
  assert.equal(coordinator.invalidate(GEN).ok, true);
  assert.equal(coordinator.plan({ tracks, failure }).reason, COORDINATOR_REASONS.CLOSED);
});
