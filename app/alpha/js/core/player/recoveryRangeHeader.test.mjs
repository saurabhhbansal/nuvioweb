import test from "node:test";
import assert from "node:assert/strict";

import { RECOVERY_RANGE_REASONS, buildRecoveryRangeHeader } from "./recoveryRangeHeader.js";

test("a valid range becomes a fixed bytes header", () => {
  assert.deepEqual(buildRecoveryRangeHeader({ rangeStart: 0, rangeEnd: 1023 }), {
    ok: true,
    reason: RECOVERY_RANGE_REASONS.OK,
    value: "bytes=0-1023"
  });
  assert.equal(
    buildRecoveryRangeHeader({ rangeStart: 2048, rangeEnd: 4095 }).value,
    "bytes=2048-4095"
  );
});

test("no range means no header at all", () => {
  for (const input of [{}, { rangeStart: null, rangeEnd: null }, { rangeStart: undefined }]) {
    const result = buildRecoveryRangeHeader(input);
    assert.equal(result.ok, true, JSON.stringify(input));
    assert.equal(result.reason, RECOVERY_RANGE_REASONS.NO_RANGE);
    assert.equal(result.value, null);
  }
});

test("invalid offsets are refused instead of being stringified into a header", () => {
  const cases = [
    { rangeStart: -1, rangeEnd: 10 },
    { rangeStart: 10, rangeEnd: -1 },
    { rangeStart: 2.5, rangeEnd: 10 },
    { rangeStart: 0, rangeEnd: Number.NaN },
    { rangeStart: 0, rangeEnd: Number.POSITIVE_INFINITY },
    { rangeStart: 20, rangeEnd: 10 },
    { rangeStart: "0", rangeEnd: "10" },
    { rangeStart: 0, rangeEnd: "10" },
    { rangeStart: 0, rangeEnd: 2 ** 60 },
    { rangeStart: null, rangeEnd: 10 },
    { rangeStart: 0, rangeEnd: null }
  ];
  for (const input of cases) {
    const result = buildRecoveryRangeHeader(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.equal(result.reason, RECOVERY_RANGE_REASONS.INVALID_RANGE);
    assert.equal(result.value, null);
  }
});

test("header injection through string offsets is impossible", () => {
  const attempts = [
    "0\r\nX-Injected: 1",
    "0-10\r\nX-Injected: 1",
    "bytes=0-10",
    { toString: () => "0\r\nX-Injected: 1" }
  ];
  for (const rangeStart of attempts) {
    const result = buildRecoveryRangeHeader({ rangeStart, rangeEnd: 10 });
    assert.equal(result.ok, false, String(rangeStart));
    assert.equal(result.value, null);
  }
});

test("equal endpoints request exactly one byte", () => {
  assert.equal(buildRecoveryRangeHeader({ rangeStart: 0, rangeEnd: 0 }).value, "bytes=0-0");
  assert.equal(buildRecoveryRangeHeader({ rangeStart: 5, rangeEnd: 5 }).value, "bytes=5-5");
});

test("throwing or revoked inputs fail closed", () => {
  const throwing = {
    get rangeStart() {
      throw new Error("boom");
    }
  };
  assert.doesNotThrow(() => buildRecoveryRangeHeader(throwing));
  assert.equal(buildRecoveryRangeHeader(throwing).reason, RECOVERY_RANGE_REASONS.INVALID_RANGE);

  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  assert.doesNotThrow(() => buildRecoveryRangeHeader(proxy));
  assert.equal(buildRecoveryRangeHeader(proxy).ok, false);

  for (const input of [undefined, null, 42, "range"]) {
    assert.equal(buildRecoveryRangeHeader(input).reason, RECOVERY_RANGE_REASONS.INVALID_RANGE);
  }
});
