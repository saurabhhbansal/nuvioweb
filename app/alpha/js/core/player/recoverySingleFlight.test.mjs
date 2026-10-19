import test from "node:test";
import assert from "node:assert/strict";

import { SINGLE_FLIGHT_REASONS, createSingleFlight } from "./recoverySingleFlight.js";

test("one request owns the guard at a time", () => {
  const guard = createSingleFlight();
  assert.equal(guard.busy, false);
  const first = guard.begin();
  assert.equal(first.ok, true);
  assert.equal(first.reason, SINGLE_FLIGHT_REASONS.OK);
  assert.equal(guard.busy, true);
  assert.equal(guard.current(), first.token);

  const second = guard.begin();
  assert.equal(second.ok, false);
  assert.equal(second.reason, SINGLE_FLIGHT_REASONS.BUSY);
  assert.equal(second.token, null);
  // The refusal must not disturb the live owner.
  assert.equal(guard.current(), first.token);
});

test("only the owning token releases, and only once", () => {
  const guard = createSingleFlight();
  const first = guard.begin();
  assert.equal(guard.end(first.token + 1), false);
  assert.equal(guard.busy, true);
  assert.equal(guard.end(first.token), true);
  assert.equal(guard.busy, false);
  // Releasing twice is refused.
  assert.equal(guard.end(first.token), false);
  assert.equal(guard.end(null), false);
});

test("a stale token cannot release a newer request", () => {
  const guard = createSingleFlight();
  const first = guard.begin();
  guard.end(first.token);
  const second = guard.begin();
  assert.notEqual(second.token, first.token);
  assert.equal(guard.end(first.token), false);
  assert.equal(guard.busy, true);
  assert.equal(guard.end(second.token), true);
});

test("tokens are never reused, so identity is stable across requests", () => {
  const guard = createSingleFlight();
  const tokens = [];
  for (let index = 0; index < 5; index += 1) {
    const started = guard.begin();
    assert.equal(started.ok, true);
    tokens.push(started.token);
    guard.end(started.token);
  }
  assert.equal(new Set(tokens).size, tokens.length);
  for (const token of tokens) {
    assert.equal(typeof token, "number");
    assert.ok(token > 0);
  }
});

test("hostile tokens are refused without disturbing the owner", () => {
  const guard = createSingleFlight();
  const owner = guard.begin();
  for (const token of [null, undefined, "1", {}, [], Number.NaN]) {
    assert.equal(guard.end(token), false, JSON.stringify(token));
  }
  assert.equal(guard.current(), owner.token);
  assert.equal(guard.end(owner.token), true);
});
