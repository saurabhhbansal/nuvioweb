import assert from "node:assert/strict";
import test from "node:test";

// Simkl sign-in through its OAuth 2.0 device flow, with the network stubbed.
const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); }
};
globalThis.__NUVIO_PLATFORM__ = "browser";
globalThis.__NUVIO_ENV__ = { SIMKL_CLIENT_ID: "fixture-simkl-public-client" };

const { Platform } = await import("../../platform/index.js");
Platform.current = null;
const { SimklAuthStore } = await import("../local/simklAuthStore.js");
const { SimklAuthService, parseSimklUserSettings } = await import("./simklAuthService.js");

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function useNetwork(t, handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const call = { url: new URL(String(url)), method: options.method, headers: options.headers || {}, body: options.body ? JSON.parse(options.body) : null };
    calls.push(call);
    return handler(call);
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

const deviceResponse = {
  device_code: "fixture-device-code",
  user_code: "ABCD-1234",
  verification_uri: "https://simkl.com/pin",
  verification_uri_complete: "https://simkl.com/pin?user_code=ABCD-1234",
  expires_in: 900,
  interval: 5
};

test("starting sign-in asks the OAuth 2.0 device endpoint, not the old PIN one", async (t) => {
  storage.clear();
  const calls = useNetwork(t, () => json(deviceResponse));
  const state = await SimklAuthService.startPinAuth();
  assert.equal(calls[0].url.pathname, "/oauth2/device");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body.client_id, "fixture-simkl-public-client");
  assert.equal(state.userCode, "ABCD-1234");
  assert.equal(state.deviceCode, "fixture-device-code");
  assert.equal(state.verificationUrl, "https://simkl.com/pin?user_code=ABCD-1234");
});

test("polling waits while pending, backs off when told to, and saves the token on approval", async (t) => {
  storage.clear();
  let answer = json({ error: "authorization_pending" }, 400);
  const calls = useNetwork(t, ({ url }) => {
    if (url.pathname === "/oauth2/device") return json(deviceResponse);
    if (url.pathname === "/users/settings") return json({ user: { name: "fixture-user" }, account: { id: 7 } });
    return answer;
  });
  await SimklAuthService.startPinAuth();

  assert.deepEqual(await SimklAuthService.pollPin(), { type: "pending" });
  const poll = calls.find((call) => call.url.pathname === "/oauth2/token");
  assert.equal(poll.body.device_code, "fixture-device-code");
  assert.equal(poll.body.grant_type, "urn:ietf:params:oauth:grant-type:device_code");
  assert.equal(poll.body.client_secret, undefined);

  answer = json({ error: "slow_down" }, 400);
  assert.deepEqual(await SimklAuthService.pollPin(), { type: "pending" });
  assert.equal(SimklAuthStore.get().pollInterval, 10);

  answer = json({ access_token: "fixture-access", token_type: "bearer" });
  const result = await SimklAuthService.pollPin();
  assert.equal(result.type, "approved");
  assert.equal(result.username, "fixture-user");
  assert.equal(SimklAuthService.isAuthenticated(), true);
  assert.equal(SimklAuthStore.get().deviceCode, null);
});

test("an expired or refused code ends the attempt", async (t) => {
  storage.clear();
  let answer = json({ error: "expired_token" }, 400);
  useNetwork(t, ({ url }) => (url.pathname === "/oauth2/device" ? json(deviceResponse) : answer));
  await SimklAuthService.startPinAuth();
  assert.deepEqual(await SimklAuthService.pollPin(), { type: "expired" });
  assert.equal(SimklAuthStore.get().userCode, null);

  await SimklAuthService.startPinAuth();
  answer = json({ error: "access_denied" }, 400);
  assert.deepEqual(await SimklAuthService.pollPin(), { type: "invalidated" });
  assert.equal(SimklAuthService.isAuthenticated(), false);
});

test("a code left over from the old PIN flow is dropped instead of polled", async (t) => {
  storage.clear();
  const calls = useNetwork(t, () => json({}));
  SimklAuthStore.savePinSession({ user_code: "OLD1", verification_url: "https://simkl.com/pin", expires_in: 900 });
  assert.deepEqual(await SimklAuthService.pollPin(), { type: "invalidated" });
  assert.equal(calls.length, 0);
});

test("the account name is read from user.name in Simkl's settings answer", () => {
  assert.deepEqual(
    parseSimklUserSettings({ user: { name: "  Fixture Person  ", joined_at: "2020-01-01" }, account: { id: "42", type: "free" } }),
    { username: "Fixture Person", accountId: 42 }
  );
  assert.deepEqual(parseSimklUserSettings({ user: { name: "" }, account: {} }), { username: null, accountId: null });
  assert.deepEqual(parseSimklUserSettings({ user: { name: 7 }, account: { id: "x" } }), { username: null, accountId: null });
  assert.deepEqual(parseSimklUserSettings(null), { username: null, accountId: null });
});

test("the settings lookup sends the token and the documented simkl-api-key header", async (t) => {
  storage.clear();
  SimklAuthStore.saveToken("fixture-access");
  const calls = useNetwork(t, () => json({ user: { name: "fixture-user" }, account: { id: 7 } }));
  assert.equal(await SimklAuthService.fetchUserSettings(), "fixture-user");
  assert.equal(calls[0].url.pathname, "/users/settings");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.Authorization, "Bearer fixture-access");
  assert.equal(calls[0].headers["simkl-api-key"], "fixture-simkl-public-client");
  assert.equal(calls[0].headers["Content-Type"], "application/json");
  assert.deepEqual(calls[0].body, {});
  assert.equal(SimklAuthStore.get().username, "fixture-user");
  assert.equal(SimklAuthStore.get().accountId, 7);
});

test("sign-in calls do not carry the simkl-api-key header", async (t) => {
  storage.clear();
  const calls = useNetwork(t, () => json(deviceResponse));
  await SimklAuthService.startPinAuth();
  assert.equal(calls[0].headers["simkl-api-key"], undefined);
  assert.equal(calls[0].headers.Authorization, undefined);
});

test("a new token forgets the previous account's name", () => {
  storage.clear();
  SimklAuthStore.saveToken("fixture-access");
  SimklAuthStore.saveIdentity({ username: "fixture-user", accountId: 7 });
  SimklAuthStore.saveToken("fixture-access");
  assert.equal(SimklAuthStore.get().username, "fixture-user");
  SimklAuthStore.saveToken("fixture-other-access");
  assert.equal(SimklAuthStore.get().username, null);
  assert.equal(SimklAuthStore.get().accountId, null);
});

test("an answer for a token that has since changed is dropped", async (t) => {
  storage.clear();
  SimklAuthStore.saveToken("fixture-access");
  useNetwork(t, () => {
    SimklAuthStore.saveToken("fixture-other-access");
    return json({ user: { name: "fixture-user" }, account: { id: 7 } });
  });
  assert.equal(await SimklAuthService.fetchUserSettings(), null);
  assert.equal(SimklAuthStore.get().username, null);
});

test("a failing name lookup is not retried on every refresh", async (t) => {
  storage.clear();
  const profileId = "fixture-cooldown";
  SimklAuthStore.saveToken("fixture-access", profileId);
  const calls = useNetwork(t, () => json({ error: "not_found" }, 404));
  assert.equal(await SimklAuthService.ensureIdentity(profileId), null);
  assert.equal(await SimklAuthService.ensureIdentity(profileId), null);
  assert.equal(calls.filter((call) => call.url.pathname === "/users/settings").length, 1);
});

test("an answer without a name keeps the name already known", async (t) => {
  storage.clear();
  SimklAuthStore.saveToken("fixture-access");
  SimklAuthStore.saveIdentity({ username: "fixture-user", accountId: 7 });
  useNetwork(t, () => json({ user: {}, account: {} }));
  assert.equal(await SimklAuthService.fetchUserSettings(), "fixture-user");
  assert.equal(SimklAuthStore.get().username, "fixture-user");
  assert.equal(SimklAuthStore.get().accountId, 7);
});

test("a connection restored without a name looks the name up once", async (t) => {
  storage.clear();
  SimklAuthStore.saveToken("fixture-access");
  const calls = useNetwork(t, () => json({ user: { name: "fixture-user" }, account: { id: 7 } }));
  assert.equal(await SimklAuthService.ensureIdentity(), "fixture-user");
  assert.equal(await SimklAuthService.ensureIdentity(), "fixture-user");
  assert.equal(calls.filter((call) => call.url.pathname === "/users/settings").length, 1);
});
