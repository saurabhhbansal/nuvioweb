import test from "node:test";
import assert from "node:assert/strict";

import {
  RECOVERY_RESPONSE_REASONS,
  classifyRecoveryResponse,
  mayConsumeRecoveryBody
} from "./recoveryResponsePolicy.js";

test("successful statuses allow body consumption", () => {
  for (const status of [200, 204, 206, 299]) {
    const result = classifyRecoveryResponse({ status });
    assert.equal(result.ok, true, String(status));
    assert.equal(result.reason, RECOVERY_RESPONSE_REASONS.OK);
    assert.equal(result.status, status);
    assert.equal(mayConsumeRecoveryBody(result), true);
  }
});

test("access, availability, retry and server failures are distinct refusals", () => {
  const cases = [
    [401, RECOVERY_RESPONSE_REASONS.ACCESS_DENIED],
    [403, RECOVERY_RESPONSE_REASONS.ACCESS_DENIED],
    [407, RECOVERY_RESPONSE_REASONS.ACCESS_DENIED],
    [404, RECOVERY_RESPONSE_REASONS.UNAVAILABLE],
    [410, RECOVERY_RESPONSE_REASONS.UNAVAILABLE],
    [408, RECOVERY_RESPONSE_REASONS.RETRY_NOT_PERMITTED],
    [429, RECOVERY_RESPONSE_REASONS.RETRY_NOT_PERMITTED],
    [500, RECOVERY_RESPONSE_REASONS.SERVER_ERROR],
    [503, RECOVERY_RESPONSE_REASONS.SERVER_ERROR],
    [400, RECOVERY_RESPONSE_REASONS.INVALID_STATUS],
    [418, RECOVERY_RESPONSE_REASONS.INVALID_STATUS]
  ];
  for (const [status, reason] of cases) {
    const result = classifyRecoveryResponse({ status });
    assert.equal(result.ok, false, String(status));
    assert.equal(result.reason, reason, String(status));
    assert.equal(result.status, status);
    assert.equal(mayConsumeRecoveryBody(result), false);
  }
});

test("redirects are refused even if flagged or reported", () => {
  for (const status of [301, 302, 307, 308]) {
    const result = classifyRecoveryResponse({ status });
    assert.equal(result.reason, RECOVERY_RESPONSE_REASONS.REDIRECT_NOT_PERMITTED, String(status));
  }
  const flagged = classifyRecoveryResponse({ status: 200, redirected: true });
  assert.equal(flagged.ok, false);
  assert.equal(flagged.reason, RECOVERY_RESPONSE_REASONS.REDIRECT_NOT_PERMITTED);
});

test("the refusal carries a numeric status only, never a URL", () => {
  const hostile = {
    status: 403,
    url: "https://fixture.invalid/a.m3u8?token=synthetic-secret",
    headers: { Authorization: "Bearer synthetic" }
  };
  const serialized = JSON.stringify(classifyRecoveryResponse(hostile));
  assert.doesNotMatch(serialized, /token|synthetic|authorization|fixture\.invalid/i);
  assert.match(serialized, /403/);
});

test("malformed inputs are refused without throwing", () => {
  for (const input of [
    undefined,
    null,
    42,
    "200",
    {},
    { status: "200" },
    { status: 99 },
    { status: 600 },
    { status: 200.5 },
    { status: Number.NaN }
  ]) {
    assert.doesNotThrow(() => classifyRecoveryResponse(input));
    const result = classifyRecoveryResponse(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.equal(result.reason, RECOVERY_RESPONSE_REASONS.INVALID_STATUS);
    assert.equal(result.status, null);
  }
});

test("a throwing accessor fails closed", () => {
  const hostile = {
    get status() {
      throw new Error("boom");
    }
  };
  assert.doesNotThrow(() => classifyRecoveryResponse(hostile));
  assert.equal(classifyRecoveryResponse(hostile).reason, RECOVERY_RESPONSE_REASONS.INVALID_STATUS);
});

test("only an explicit ok classification permits consuming a body", () => {
  for (const value of [null, undefined, {}, { ok: "true" }, { ok: 1 }, "ok"]) {
    assert.equal(mayConsumeRecoveryBody(value), false, JSON.stringify(value));
  }
});

test("the body guard fails closed on throwing or revoked inputs", () => {
  const throwing = {
    get ok() {
      throw new Error("boom");
    }
  };
  assert.doesNotThrow(() => mayConsumeRecoveryBody(throwing));
  assert.equal(mayConsumeRecoveryBody(throwing), false);

  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  assert.doesNotThrow(() => mayConsumeRecoveryBody(proxy));
  assert.equal(mayConsumeRecoveryBody(proxy), false);
});
