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
    assert.equal(result.headers, null);
  }
});

test("a header-free request is accepted with no headers", () => {
  for (const headers of [null, undefined, {}, Object.create(null)]) {
    const result = validateRecoveryRequest({ url: "https://fixture.invalid/a.m3u8", headers });
    assert.equal(result.ok, true, JSON.stringify(headers ?? null));
    assert.equal(result.headers, null);
  }
});

test("missing or malformed requests are refused", () => {
  for (const url of [undefined, null, "", "   ", 42, {}, "relative.m3u8", "javascript:alert(1)",
    "data:text/plain,x", "file:///tmp/x", "https://user:private@fixture.invalid/a", "https://" + "x".repeat(8192)]) {
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
  // The options object has a null prototype, so compare fields explicitly.
  assert.equal(result.options.method, "GET");
  assert.equal(result.options.mode, "cors");
  assert.equal(result.options.credentials, "omit");
  assert.equal(result.options.redirect, "error");
  assert.equal(result.options.signal, controller.signal);
  // No headers key at all, and a null prototype so pollution cannot add one.
  assert.equal("headers" in result.options, false);
  assert.equal(Object.getPrototypeOf(result.options), null);

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

test("Headers instances, tuple arrays and inherited headers are refused", () => {
  const fromHeaders = validateRecoveryRequest({
    url: "https://fixture.invalid/a.m3u8",
    headers: new Headers({ Authorization: "synthetic" })
  });
  assert.equal(fromHeaders.ok, false);
  assert.equal(fromHeaders.reason, RECOVERY_REQUEST_REASONS.CALLER_HEADERS_NOT_PERMITTED);

  const fromTuples = validateRecoveryRequest({
    url: "https://fixture.invalid/a.m3u8",
    headers: [["Authorization", "synthetic"]]
  });
  assert.equal(fromTuples.ok, false);

  const inherited = Object.create({ Cookie: "session=1" });
  assert.equal(
    validateRecoveryRequest({ url: "https://fixture.invalid/a", headers: inherited }).ok,
    false
  );

  const nonEnumerable = {};
  Object.defineProperty(nonEnumerable, "Authorization", {
    value: "synthetic",
    enumerable: false
  });
  assert.equal(
    validateRecoveryRequest({ url: "https://fixture.invalid/a", headers: nonEnumerable }).ok,
    false
  );

  // An empty Headers instance carries nothing and is allowed.
  assert.equal(
    validateRecoveryRequest({ url: "https://fixture.invalid/a", headers: new Headers() }).ok,
    true
  );
});

test("accessor-backed and revoked inputs fail closed instead of throwing", () => {
  const throwing = {
    get url() {
      throw new Error("boom");
    }
  };
  assert.doesNotThrow(() => validateRecoveryRequest(throwing));
  assert.equal(validateRecoveryRequest(throwing).reason, RECOVERY_REQUEST_REASONS.INVALID_REQUEST);
  let accessorCalls = 0;
  const changing = { get url() { accessorCalls++; throw new Error("URL getter executed"); } };
  assert.equal(validateRecoveryRequest(changing).ok, false);
  const changingHeaders = { url: "https://fixture.invalid/a", get headers() { accessorCalls++; throw new Error("header getter executed"); } };
  assert.equal(validateRecoveryRequest(changingHeaders).ok, false);
  assert.equal(accessorCalls, 0);
  const valid = validateRecoveryRequest({ url: "https://fixture.invalid/a" });
  assert.equal(valid.url, "https://fixture.invalid/a");

  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  assert.doesNotThrow(() =>
    validateRecoveryRequest({ url: "https://fixture.invalid/a", headers: proxy })
  );
  assert.doesNotThrow(() => buildRecoveryFetchOptions(proxy));
});

test("polluted Object.prototype cannot inject outgoing headers", () => {
  const original = Object.prototype.headers;
  Object.prototype.headers = { Authorization: "synthetic" };
  try {
    const controller = new AbortController();
    const { options } = buildRecoveryFetchOptions({ signal: controller.signal });
    assert.equal("headers" in options, false);
    // The guarantee this module owns: the options object carries no header key
    // and no prototype chain to inherit one from. What a platform Request
    // constructor does with a polluted global prototype is outside this module.
    assert.equal(options.headers, undefined);
    assert.equal(Object.getPrototypeOf(options), null);
  } finally {
    if (original === undefined) delete Object.prototype.headers;
    else Object.prototype.headers = original;
  }
});
