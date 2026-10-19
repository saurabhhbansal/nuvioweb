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

test("an unstarted coordinator plans but records nothing", () => {
  const coordinator = createRecoveryCoordinator({ generation: GEN });
  const plan = coordinator.plan({
    tracks: [track("en-main"), track("en-second")],
    failure
  });
  // Without a recorded failed track there is nothing to recover.
  assert.notEqual(plan.recorded, true);
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

test("planning refuses to execute a proposal the operation rejects", () => {
  const coordinator = createRecoveryCoordinator({ generation: GEN });
  coordinator.begin("en-main");
  // The planner proposes en-second; the operation already recorded it.
  assert.equal(
    coordinator.plan({ tracks: [track("en-main"), track("en-second")], failure }).recorded,
    true
  );
  const second = coordinator.plan({ tracks: [track("en-main"), track("en-second")], failure });
  assert.equal(second.recorded, false);
  // Nothing was executed twice, and the snapshot still shows one attempt.
  assert.equal(coordinator.snapshot().attempted.length, 1);
});
