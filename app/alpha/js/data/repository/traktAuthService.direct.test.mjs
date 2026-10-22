import assert from "node:assert/strict";
import test from "node:test";

// A static site: a public Trakt client id and no bridge. Sign-in goes straight
// to Trakt from the browser.
const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); }
};
globalThis.__NUVIO_PLATFORM__ = "browser";
globalThis.__NUVIO_ENV__ = { TRAKT_CLIENT_ID: "direct-public-client" };

const { Platform } = await import("../../platform/index.js");
Platform.current = null;
const { TraktAuthStore } = await import("../local/traktAuthStore.js");
const { TraktAuthService } = await import("./traktAuthService.js");

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function mockFetch(t, handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), body: options.body ? JSON.parse(options.body) : null };
    calls.push(call);
    return handler(call);
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

test("direct sign-in asks Trakt for a code with the client id alone", async (t) => {
  storage.clear();
  const calls = mockFetch(t, ({ url }) => {
    if (url === "https://api.trakt.tv/oauth/device/code") {
      return json({ device_code: "dev", user_code: "ABCD", verification_url: "https://trakt.tv/activate", expires_in: 600, interval: 5 });
    }
    assert.fail(`Unexpected request: ${url}`);
  });
  assert.equal(TraktAuthService.hasRequiredCredentials(), true);
  const state = await TraktAuthService.startDeviceAuth();
  assert.equal(state.userCode, "ABCD");
  assert.deepEqual(calls, [{ url: "https://api.trakt.tv/oauth/device/code", body: { client_id: "direct-public-client" } }]);
});

test("direct polling maps Trakt's statuses and never sends a secret or touches a bridge", async (t) => {
  storage.clear();
  TraktAuthStore.saveDeviceFlow({ device_code: "dev", user_code: "ABCD", verification_url: "https://trakt.tv/activate", expires_in: 600, interval: 5 });
  let status = 400;
  const calls = mockFetch(t, ({ url }) => {
    if (url === "https://api.trakt.tv/oauth/device/token") {
      return status === 200
        ? json({ access_token: "access-one", refresh_token: "refresh-one", expires_in: 3600, created_at: Math.floor(Date.now() / 1000) })
        : json({}, status);
    }
    if (url.endsWith("/users/settings")) return json({ user: { username: "tester", ids: { slug: "tester" } } });
    assert.fail(`Unexpected request: ${url}`);
  });
  assert.equal((await TraktAuthService.pollDeviceToken()).type, "pending");
  status = 429;
  assert.equal((await TraktAuthService.pollDeviceToken()).type, "slow_down");
  status = 200;
  const approved = await TraktAuthService.pollDeviceToken();
  assert.equal(approved.type, "approved");
  assert.equal(TraktAuthStore.get().accessToken, "access-one");
  const tokenCalls = calls.filter((call) => call.url.endsWith("/oauth/device/token"));
  assert.ok(tokenCalls.length === 3);
  for (const call of tokenCalls) {
    assert.deepEqual(call.body, { code: "dev", client_id: "direct-public-client" });
  }
  assert.ok(calls.every((call) => !call.url.startsWith("/api/")));
  assert.ok(calls.every((call) => !JSON.stringify(call.body || {}).includes("secret")));
});

test("direct sign-in reports denial and expiry and clears the code", async (t) => {
  for (const [status, type] of [[418, "denied"], [410, "expired"], [409, "already_used"]]) {
    storage.clear();
    TraktAuthStore.saveDeviceFlow({ device_code: "dev", user_code: "ABCD", verification_url: "https://trakt.tv/activate", expires_in: 600, interval: 5 });
    const original = globalThis.fetch;
    globalThis.fetch = async () => json({}, status);
    try {
      assert.equal((await TraktAuthService.pollDeviceToken()).type, type);
      assert.equal(TraktAuthStore.get().deviceCode || null, null);
    } finally {
      globalThis.fetch = original;
    }
  }
  t.diagnostic("denied, expired and reused codes all end the flow");
});

test("direct refresh rotates the token, and a revoked refresh signs out on this device only", async (t) => {
  storage.clear();
  TraktAuthStore.saveToken({ access_token: "old", refresh_token: "refresh-one", expires_in: 1, created_at: 1 });
  let refreshStatus = 200;
  const calls = mockFetch(t, ({ url }) => {
    if (url === "https://api.trakt.tv/oauth/token") {
      return refreshStatus === 200
        ? json({ access_token: "new", refresh_token: "refresh-two", expires_in: 3600, created_at: Math.floor(Date.now() / 1000) })
        : json({ error: "invalid_grant" }, refreshStatus);
    }
    if (url.endsWith("/users/settings")) return json({ user: { username: "tester", ids: { slug: "tester" } } });
    assert.fail(`Unexpected request: ${url}`);
  });
  assert.equal(await TraktAuthService.getValidAccessToken(), "new");
  assert.deepEqual(calls[0].body, {
    refresh_token: "refresh-one",
    client_id: "direct-public-client",
    redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
    grant_type: "refresh_token"
  });
  assert.equal(TraktAuthStore.get().refreshToken, "refresh-two");

  refreshStatus = 401;
  assert.equal(await TraktAuthService.refreshTokenIfNeeded(true), false);
  assert.equal(TraktAuthStore.isAuthenticated(), false);
  assert.ok(calls.every((call) => !call.url.startsWith("/api/")));
});
