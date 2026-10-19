import test from "node:test";
import assert from "node:assert/strict";

import {
  RECOVERY_OPERATION_ACTION,
  RECOVERY_OPERATION_REASONS,
  RECOVERY_OPERATION_STATE,
  createRecoveryOperation
} from "./recoveryOperation.js";

const GEN = 5;

function started(overrides = {}) {
  const operation = createRecoveryOperation({ generation: GEN, ...overrides });
  operation.begin("en-main");
  return operation;
}

test("invalid generations are refused without coercion", () => {
  for (const generation of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "5", null, 2 ** 60]) {
    const operation = createRecoveryOperation({ generation });
    const result = operation.begin("en-main");
    assert.equal(result.ok, false, String(generation));
    assert.equal(result.reason, RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
    // An invalid operation can never claim to be current or close itself.
    assert.equal(operation.isCurrent(GEN), false);
    assert.equal(operation.invalidate(GEN).ok, false);
    assert.equal(operation.state, RECOVERY_OPERATION_STATE.OPEN);
  }
});

test("begin records the failed track exactly once", () => {
  const operation = createRecoveryOperation({ generation: GEN });
  assert.deepEqual(operation.begin("en-main"), {
    ok: true,
    reason: RECOVERY_OPERATION_REASONS.NONE
  });
  assert.equal(operation.begin("en-other").reason, RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
  assert.equal(operation.snapshot().failedTrackKey, "en-main");
});

test("an empty key is refused on a fresh operation, not masked by repeat-begin", () => {
  const operation = createRecoveryOperation({ generation: GEN });
  assert.equal(operation.begin("").reason, RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
  assert.equal(operation.snapshot().failedTrackKey, null);
  assert.equal(operation.begin("en-main").ok, true);
});

test("nothing is offerable before begin", () => {
  const operation = createRecoveryOperation({ generation: GEN });
  assert.equal(
    operation.offerAlternate("en-second").reason,
    RECOVERY_OPERATION_REASONS.NOT_STARTED
  );
  assert.equal(operation.offerRestore("en-second").reason, RECOVERY_OPERATION_REASONS.NOT_STARTED);
  assert.equal(
    operation.canOffer("alternate", "en-second").reason,
    RECOVERY_OPERATION_REASONS.NOT_STARTED
  );
  assert.equal(operation.snapshot().alternateAttempts, 0);
  assert.equal(operation.snapshot().restoreAttempts, 0);
});

test("an alternate is offered once and never for the same track twice", () => {
  const operation = started();
  assert.equal(operation.offerAlternate("en-second").ok, true);
  assert.equal(
    operation.offerAlternate("en-second").reason,
    RECOVERY_OPERATION_REASONS.ALREADY_ATTEMPTED
  );
  assert.equal(
    operation.offerAlternate("en-third").reason,
    RECOVERY_OPERATION_REASONS.ALTERNATE_LIMIT
  );
});

test("the failed track is never a recovery target", () => {
  const operation = started();
  assert.equal(
    operation.offerAlternate("en-main").reason,
    RECOVERY_OPERATION_REASONS.TRACK_NOT_ALLOWED
  );
  assert.equal(
    operation.offerRestore("en-main").reason,
    RECOVERY_OPERATION_REASONS.TRACK_NOT_ALLOWED
  );
});

test("offer-then-restore of the same track is refused with the real reason", () => {
  const operation = started();
  assert.equal(operation.offerAlternate("en-second").ok, true);
  assert.equal(
    operation.offerRestore("en-second").reason,
    RECOVERY_OPERATION_REASONS.ALREADY_ATTEMPTED
  );
  assert.equal(operation.offerRestore("en-third").ok, true);
  assert.equal(
    operation.offerRestore("en-fourth").reason,
    RECOVERY_OPERATION_REASONS.RESTORE_LIMIT
  );
});

test("canOffer never reports permission the offer would refuse", () => {
  const operation = started();
  operation.offerAlternate("en-second");
  assert.equal(
    operation.canOffer("alternate", "en-second").reason,
    RECOVERY_OPERATION_REASONS.ALREADY_ATTEMPTED
  );
  assert.equal(
    operation.canOffer("alternate", "en-third").reason,
    RECOVERY_OPERATION_REASONS.ALTERNATE_LIMIT
  );
  assert.equal(
    operation.canOffer("restore", "en-second").reason,
    RECOVERY_OPERATION_REASONS.ALREADY_ATTEMPTED
  );
  assert.equal(operation.canOffer("restore", "en-third").ok, true);
  assert.equal(
    operation.canOffer("sideways", "en-third").reason,
    RECOVERY_OPERATION_REASONS.UNKNOWN_ACTION
  );
  // Reporting permission does not consume it.
  assert.equal(operation.snapshot().restoreAttempts, 0);
});

test("a stale caller cannot act on the current operation", () => {
  const operation = started();
  for (const result of [
    operation.offerAlternate("en-second", 4),
    operation.offerRestore("en-second", 4),
    operation.canOffer("alternate", "en-second", 4),
    operation.begin("en-third", 4)
  ]) {
    assert.equal(result.ok, false);
    assert.equal(result.reason, RECOVERY_OPERATION_REASONS.STALE_GENERATION);
  }
  assert.equal(operation.snapshot().attempted.length, 0);
  assert.equal(operation.offerAlternate("en-second", GEN).ok, true);
});

test("closing is idempotent and returns honest reasons", () => {
  const operation = started();
  operation.offerAlternate("en-second");
  assert.equal(operation.close(), true);
  assert.equal(operation.close(), false);
  for (const result of [
    operation.offerAlternate("en-third"),
    operation.offerRestore("en-third"),
    operation.canOffer("restore", "en-third")
  ]) {
    assert.equal(result.ok, false);
    assert.equal(result.reason, RECOVERY_OPERATION_REASONS.CLOSED);
  }
  assert.equal(operation.snapshot().closeReason, RECOVERY_OPERATION_REASONS.CLOSED);
});

test("invalidate refuses stale callers and reports what it stored", () => {
  const operation = started();
  assert.equal(operation.invalidate(4).reason, RECOVERY_OPERATION_REASONS.STALE_GENERATION);
  assert.equal(operation.isCurrent(4), false);
  assert.equal(operation.isCurrent(GEN), true);

  const closed = operation.invalidate(GEN, RECOVERY_OPERATION_REASONS.NAVIGATION);
  assert.equal(closed.ok, true);
  assert.equal(closed.reason, RECOVERY_OPERATION_REASONS.NAVIGATION);
  assert.equal(operation.snapshot().closeReason, RECOVERY_OPERATION_REASONS.NAVIGATION);

  // Already closed: the newly supplied reason must not be reported as if it happened.
  assert.equal(
    operation.invalidate(GEN, RECOVERY_OPERATION_REASONS.CANCELLED).reason,
    RECOVERY_OPERATION_REASONS.CLOSED
  );
  assert.equal(operation.snapshot().closeReason, RECOVERY_OPERATION_REASONS.NAVIGATION);
  // Unknown or malformed reasons are normalized to the stored default.
  const other = started();
  assert.equal(other.invalidate(GEN, {}).reason, RECOVERY_OPERATION_REASONS.CLOSED);
});

test("snapshots are deep copies that cannot forge state", () => {
  const operation = started();
  operation.offerAlternate("en-second");
  const snapshot = operation.snapshot();
  snapshot.alternateAttempts = 0;
  snapshot.attempted[0].trackKey = "forged";
  snapshot.attempted.push({ kind: "alternate", trackKey: "forged" });
  const fresh = operation.snapshot();
  assert.equal(fresh.alternateAttempts, 1);
  assert.equal(fresh.attempted.length, 1);
  assert.equal(fresh.attempted[0].trackKey, "en-second");
  assert.equal(operation.offerAlternate("en-second").ok, false);
});

test("oversized or non-string keys never consume an attempt", () => {
  const operation = started();
  assert.equal(
    operation.offerAlternate("k".repeat(161)).reason,
    RECOVERY_OPERATION_REASONS.INVALID_REQUEST
  );
  assert.equal(operation.offerAlternate(42).reason, RECOVERY_OPERATION_REASONS.INVALID_REQUEST);
  assert.equal(operation.snapshot().attempted.length, 0);
  assert.equal(operation.snapshot().alternateAttempts, 0);
});

test("attempts keep their order and kind, and caps are fixed at one", () => {
  const operation = started();
  operation.offerAlternate("en-second");
  operation.offerRestore("en-third");
  assert.deepEqual(operation.snapshot().attempted, [
    { kind: RECOVERY_OPERATION_ACTION.ALTERNATE, trackKey: "en-second" },
    { kind: RECOVERY_OPERATION_ACTION.RESTORE, trackKey: "en-third" }
  ]);
  assert.deepEqual(operation.snapshot().limits, { alternate: 1, restore: 1 });
  // Limits are not configurable: passing them cannot widen the invariant.
  const widened = createRecoveryOperation({ generation: GEN, maxAlternate: 2, maxRestore: 2 });
  widened.begin("en-main");
  assert.equal(widened.offerAlternate("a").ok, true);
  assert.equal(widened.offerAlternate("b").reason, RECOVERY_OPERATION_REASONS.ALTERNATE_LIMIT);
});
