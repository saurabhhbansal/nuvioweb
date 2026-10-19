import test from "node:test";
import assert from "node:assert/strict";

import {
  RECOVERY_DEADLINE_MS,
  RECOVERY_DEADLINE_OUTCOMES,
  createDeadline,
  deadlineMsFor
} from "./recoveryDeadlines.js";

function harness(options = {}) {
  const timers = [];
  const cleared = [];
  const deadline = createDeadline({
    now: () => 1000,
    setTimer: (callback, ms) => {
      const handle = { callback, ms, unref() {} };
      timers.push(handle);
      return handle;
    },
    clearTimer: (handle) => cleared.push(handle),
    ...options
  });
  return { deadline, timers, cleared };
}

test("deadlines follow the plan's manifest and fragment budgets", () => {
  assert.equal(deadlineMsFor("playlist"), 5000);
  assert.equal(deadlineMsFor("fragment"), 10000);
  assert.equal(deadlineMsFor("init"), 10000);
  assert.equal(deadlineMsFor(undefined), 10000);
  assert.deepEqual(RECOVERY_DEADLINE_MS, { playlist: 5000, fragment: 10000 });
});

test("a timeout fires once and reports the elapsed time", () => {
  let fired = 0;
  let detail = null;
  const { deadline, timers } = harness({
    kind: "playlist",
    onTimeout: (value) => {
      fired += 1;
      detail = value;
    }
  });
  assert.equal(deadline.arm(), true);
  assert.equal(deadline.pending, true);
  timers[0].callback();
  assert.equal(fired, 1);
  assert.equal(deadline.outcome, RECOVERY_DEADLINE_OUTCOMES.TIMEOUT);
  assert.deepEqual(detail, { kind: "playlist", ms: 5000, elapsedMs: 0 });
  // Firing again must not call back a second time.
  timers[0].callback();
  assert.equal(fired, 1);
});

test("success, error and cancel before the deadline suppress the notification", () => {
  for (const outcome of [
    RECOVERY_DEADLINE_OUTCOMES.SUCCESS,
    RECOVERY_DEADLINE_OUTCOMES.ERROR,
    RECOVERY_DEADLINE_OUTCOMES.CANCELLED
  ]) {
    let notified = 0;
    const { deadline, timers, cleared } = harness({ onTimeout: () => (notified += 1) });
    deadline.arm();
    const settle =
      outcome === RECOVERY_DEADLINE_OUTCOMES.CANCELLED
        ? deadline.cancel()
        : deadline.settle(outcome);
    assert.equal(settle, true, outcome);
    assert.equal(deadline.outcome, outcome);
    assert.equal(cleared.length, 1);
    timers[0].callback();
    assert.equal(deadline.outcome, outcome, outcome);
    assert.equal(notified, 0, outcome);
  }
});

test("settling twice is refused, so a request cannot be completed twice", () => {
  const { deadline } = harness();
  deadline.arm();
  assert.equal(deadline.settle(RECOVERY_DEADLINE_OUTCOMES.ERROR), true);
  assert.equal(deadline.settle(RECOVERY_DEADLINE_OUTCOMES.SUCCESS), false);
  assert.equal(deadline.cancel(), false);
  assert.equal(deadline.outcome, RECOVERY_DEADLINE_OUTCOMES.ERROR);
});

test("cancel is a settlement with its own outcome", () => {
  const { deadline, cleared } = harness();
  deadline.arm();
  assert.equal(deadline.cancel(), true);
  assert.equal(deadline.outcome, RECOVERY_DEADLINE_OUTCOMES.CANCELLED);
  assert.equal(cleared.length, 1);
  assert.equal(deadline.pending, false);
});

test("an unknown outcome is refused without settling", () => {
  const { deadline } = harness();
  deadline.arm();
  assert.equal(deadline.settle("forged"), false);
  assert.equal(deadline.pending, true);
  deadline.cancel();
});

test("arming twice does not schedule two timers", () => {
  const { deadline, timers } = harness();
  assert.equal(deadline.arm(), true);
  assert.equal(deadline.arm(), false);
  assert.equal(timers.length, 1);
  deadline.cancel();
});

test("a throwing timeout callback cannot escape or restore the request", () => {
  const { deadline, timers } = harness({
    onTimeout: () => {
      throw new Error("boom");
    }
  });
  deadline.arm();
  assert.doesNotThrow(() => timers[0].callback());
  assert.equal(deadline.outcome, RECOVERY_DEADLINE_OUTCOMES.TIMEOUT);
  assert.equal(deadline.pending, false);
});

test("dispose is terminal: no resurrection, no late notification, no settle", () => {
  let notified = 0;
  const { deadline, timers, cleared } = harness({ onTimeout: () => (notified += 1) });
  deadline.arm();
  deadline.dispose();
  assert.equal(cleared.length, 1);
  assert.equal(deadline.settled, false);
  assert.equal(deadline.disposed, true);
  assert.equal(deadline.pending, false);
  // A delivered stale callback changes nothing and does not notify.
  timers[0].callback();
  assert.equal(deadline.outcome, null);
  assert.equal(notified, 0);
  // Re-arming after disposal is refused, so no timer can overwrite a newer one.
  assert.equal(deadline.arm(), false);
  assert.equal(timers.length, 1);
  // Settling a disposed deadline is refused too.
  assert.equal(deadline.settle(RECOVERY_DEADLINE_OUTCOMES.SUCCESS), false);
  assert.equal(deadline.outcome, null);
});
