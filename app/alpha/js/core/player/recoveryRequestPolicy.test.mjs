import test from "node:test";
import assert from "node:assert/strict";

import {
  RECOVERY_REQUEST_POLICY,
  RECOVERY_REQUEST_REASONS,
  buildRecoveryFetchOptions,
  validateRecoveryRequest
} from "./recoveryRequestPolicy.js";

test("the policy is anonymous, CORS-only and redirect-free", () => {
  assert.equal(RECOVERY_REQUEST_POLICY.mode, "cors");
  assert.equal(RECOVERY_REQUEST_POLICY.credentials, "omit");
  assert.equal(RECOVERY_REQUEST_POLICY.redirect, "error");
  assert.deepEqual(RECOVERY_REQUEST_POLICY.allowedHeaders, []);
  assert.ok(Object.isFrozen(RECOVERY_REQUEST_POLICY));
});

test("no caller header is ever forwarded", () => {
  for (const headers of [
    { Authorization: "Bearer secret" },
    { Cookie: "session=1" },
    { "X-Api-Key": "k" },
    { authorization: "lowercase" }
  ]) {
    const result = validateRecoveryRequest({ url: "https://fixture.invalid/a.m3u8", headers });
    assert.equal(result.ok, false, JSON.stringify(headers));
    assert.equal(result.reason, RECOVERY_REQUEST_REASONS.CALLER_HEADERS_NOT_PERMITTED);
    assert.deepEqual(result.headers, {});
  }
});

test("a header-free request is accepted with no headers", () => {
  for (const headers of [null, undefined, {}, Object.create(null)]) {
    const result = validateRecoveryRequest({ url: "https://fixture.invalid/a.m3u8", headers });
    assert.equal(result.ok, true, JSON.stringify(headers ?? null));
    assert.deepEqual(result.headers, {});
  }
});

test("missing or malformed requests are refused", () => {
  for (const url of [undefined, null, "", "   ", 42, {}]) {
    const result = validateRecoveryRequest({ url });
    assert.equal(result.ok, false, String(url));
    assert.equal(result.reason, RECOVERY_REQUEST_REASONS.INVALID_REQUEST);
  }
  assert.equal(validateRecoveryRequest().ok, false);
});

test("fetch options are fixed and require an abort signal", () => {
  const controller = new AbortController();
  const result = buildRecoveryFetchOptions({ signal: controller.signal });
  assert.equal(result.ok, true);
  assert.deepEqual(result.options, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    redirect: "error",
    signal: controller.signal
  });
  // No headers key at all: there is no path to attach one.
  assert.equal("headers" in result.options, false);

  for (const signal of [null, undefined, "signal", 42]) {
    assert.equal(buildRecoveryFetchOptions({ signal }).ok, false, String(signal));
  }
});

test("hostile header objects cannot smuggle a value through", () => {
  const proxy = new Proxy(
    {},
    {
      ownKeys() {
        return ["Authorization"];
      },
      getOwnPropertyDescriptor() {
        return { enumerable: true, configurable: true, value: "x" };
      },
      getPrototypeOf() {
        return Object.prototype;
      }
    }
  );
  const result = validateRecoveryRequest({ url: "https://fixture.invalid/a", headers: proxy });
  assert.equal(result.ok, false);
  assert.equal(result.reason, RECOVERY_REQUEST_REASONS.CALLER_HEADERS_NOT_PERMITTED);
});
