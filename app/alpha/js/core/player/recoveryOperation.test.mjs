import test from "node:test";
import assert from "node:assert/strict";

import {
  RECOVERY_OPERATION_REASONS,
  RECOVERY_OPERATION_STATE,
  createRecoveryOperation
} from "./recoveryOperation.js";

test("an invalid generation or limit is refused, not guessed at", () => {
  for (const generation of [0, -1, 1.5, Number.NaN, "7", null]) {
    const operation = createRecoveryOperation({ generation });
    const result = operation.begin("en-main");
    assert.equal(result.ok, false, String(generation));
    assert.equal(result.reason, RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
  }
  for (const maxAlternate of [-1, 2.5, 5000]) {
    const operation = createRecoveryOperation({ generation: 3, maxAlternate });
    assert.equal(operation.begin("en-main").ok, false, String(maxAlternate));
  }
});

test("begin records the failed track once and only once", () => {
  const operation = createRecoveryOperation({ generation: 3 });
  assert.deepEqual(operation.begin("en-main"), {
    ok: true,
    reason: RECOVERY_OPERATION_REASONS.NONE
  });
  assert.equal(operation.begin("en-other").reason, RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
  assert.equal(operation.snapshot().failedTrackKey, "en-main");
  assert.equal(operation.begin("").reason, RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
});

test("an alternate is offered at most once and never twice for the same track", () => {
  const operation = createRecoveryOperation({ generation: 3 });
  operation.begin("en-main");
  assert.equal(operation.offerAlternate("en-second").ok, true);
  assert.equal(
    operation.offerAlternate("en-second").reason,
    RECOVERY_OPERATION_REASONS.ALREADY_ATTEMPTED
  );
  assert.equal(
    operation.offerAlternate("en-third").reason,
    RECOVERY_OPERATION_REASONS.ALTERNATE_LIMIT
  );
  assert.equal(operation.snapshot().alternateAttempts, 1);
});

test("the failed track cannot be offered as its own recovery", () => {
  const operation = createRecoveryOperation({ generation: 3 });
  operation.begin("en-main");
  assert.equal(
    operation.offerAlternate("en-main").reason,
    RECOVERY_OPERATION_REASONS.TRACK_NOT_ALLOWED
  );
  // A restore of the failed track is also nonsensical.
  assert.equal(operation.offerRestore("en-main").ok, false);
});

test("an alternate-then-restore of the same track is blocked as already attempted", () => {
  const operation = createRecoveryOperation({ generation: 3 });
  operation.begin("en-main");
  assert.equal(operation.offerAlternate("en-second").ok, true);
  assert.equal(
    operation.offerRestore("en-second").reason,
    RECOVERY_OPERATION_REASONS.ALREADY_ATTEMPTED
  );
  // A different restore target is still allowed once.
  assert.equal(operation.offerRestore("en-third").ok, true);
  assert.equal(
    operation.offerRestore("en-fourth").reason,
    RECOVERY_OPERATION_REASONS.RESTORE_LIMIT
  );
});

test("a zero limit refuses before any attempt is recorded", () => {
  const operation = createRecoveryOperation({ generation: 3, maxAlternate: 0 });
  operation.begin("en-main");
  assert.equal(
    operation.offerAlternate("en-second").reason,
    RECOVERY_OPERATION_REASONS.ALTERNATE_LIMIT
  );
  assert.equal(operation.snapshot().alternateAttempts, 0);
});

test("closing stops every further offer with a true reason", () => {
  const operation = createRecoveryOperation({ generation: 3 });
  operation.begin("en-main");
  assert.equal(operation.close(), true);
  assert.equal(operation.close(), false);
  assert.equal(operation.state, RECOVERY_OPERATION_STATE.CLOSED);
  for (const call of [
    operation.offerAlternate("en-second"),
    operation.offerRestore("en-second"),
    operation.canOffer("en-second")
  ]) {
    assert.equal(call.ok, false);
    assert.equal(call.reason, RECOVERY_OPERATION_REASONS.CLOSED);
  }
  assert.equal(operation.snapshot().closeReason, RECOVERY_OPERATION_REASONS.CLOSED);
});

test("a stale caller cannot close or use the current operation", () => {
  const operation = createRecoveryOperation({ generation: 5 });
  operation.begin("en-main");
  const stale = operation.invalidate(4);
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, RECOVERY_OPERATION_REASONS.STALE_GENERATION);
  assert.equal(operation.state, RECOVERY_OPERATION_STATE.OPEN);
  assert.equal(operation.isCurrent(4), false);
  assert.equal(operation.isCurrent(5), true);
  assert.equal(operation.invalidate(5, "navigation").ok, true);
  assert.equal(operation.state, RECOVERY_OPERATION_STATE.CLOSED);
  assert.equal(operation.isCurrent(5), false);
});

test("snapshots are copies that cannot be used to forge state", () => {
  const operation = createRecoveryOperation({ generation: 3 });
  operation.begin("en-main");
  operation.offerAlternate("en-second");
  const snapshot = operation.snapshot();
  assert.equal(snapshot.alternateAttempts, 1);
  snapshot.alternateAttempts = 0;
  snapshot.attempted.push({ kind: "alternate", trackKey: "forged" });
  const fresh = operation.snapshot();
  assert.equal(fresh.alternateAttempts, 1);
  assert.equal(fresh.attempted.length, 1);
  // The recorded attempt still blocks a replay.
  assert.equal(operation.offerAlternate("en-second").ok, false);
});

test("oversized or non-string keys are refused without truncating", () => {
  const operation = createRecoveryOperation({ generation: 3 });
  const longKey = "k".repeat(161);
  operation.begin("en-main");
  assert.equal(
    operation.offerAlternate(longKey).reason,
    RECOVERY_OPERATION_REASONS.INVALID_REQUEST
  );
  assert.equal(operation.offerAlternate(42).reason, RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
  assert.equal(operation.snapshot().attempted.length, 0);
});

test("attempt records keep their order and kind", () => {
  const operation = createRecoveryOperation({ generation: 9 });
  operation.begin("en-main");
  operation.offerAlternate("en-second");
  operation.offerRestore("en-third");
  assert.deepEqual(operation.snapshot().attempted, [
    { kind: "alternate", trackKey: "en-second" },
    { kind: "restore", trackKey: "en-third" }
  ]);
  assert.deepEqual(operation.snapshot().limits, { alternate: 1, restore: 1 });
});
