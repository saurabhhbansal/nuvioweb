import assert from "node:assert/strict";
import test from "node:test";

const fixtureOrigin = "https://identity.fixture.invalid";
globalThis.__NUVIO_ENV__ = {
  NUVIO_SUPABASE_URL: fixtureOrigin,
  NUVIO_SUPABASE_ANON_KEY: "fixture-public-key",
  NUVIO_SUPABASE_FALLBACK_URL: ""
};
const { AuthManager } = await import("./authManager.js");
const { AuthState } = await import("./authState.js");
const { SessionStore } = await import("../storage/sessionStore.js");

// Unsigned synthetic input for expiry/control-flow tests, never identity proof.
function token(subject, expiresIn = 3600) {
  const payload = Buffer.from(JSON.stringify({
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + expiresIn
  })).toString("base64url");
  return `fixture.${payload}.fixture-signature`;
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function storage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}
function reset() {
  AuthManager.state = AuthState.LOADING;
  AuthManager.listeners = [];
  AuthManager.cachedEffectiveUserId = null;
  AuthManager.cachedEffectiveUserSourceUserId = null;
  AuthManager.refreshPromise = null;
  AuthManager.lastRefreshFailureKind = null;
  AuthManager.sessionGeneration = 0;
}
async function withSession(entries, fetchImpl, run) {
  const original = { storage: globalThis.localStorage, fetch: globalThis.fetch };
  globalThis.localStorage = storage(entries);
  globalThis.fetch = fetchImpl;
  reset();
  try { await run(); }
  finally {
    reset();
    globalThis.localStorage = original.storage;
    globalThis.fetch = original.fetch;
  }
}

test("existing password exchange uses the configured Nuvio contract and resolves its sync owner", async () => {
  const calls = [];
  const access = token("account-a");
  await withSession({}, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("grant_type=password")) return json({ access_token: access, refresh_token: "fixture-refresh-a" });
    return json("owner-a");
  }, async () => {
    await AuthManager.signInWithEmail("account-a@example.invalid", "fixture-password");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, `${fixtureOrigin}/auth/v1/token?grant_type=password`);
    assert.equal(calls[0].options.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].options.body), { email: "account-a@example.invalid", password: "fixture-password" });
    assert.equal(calls[0].options.headers.apikey, "fixture-public-key");
    assert.equal(calls[1].url, `${fixtureOrigin}/rest/v1/rpc/get_sync_owner`);
    assert.equal(calls[1].options.headers.Authorization, `Bearer ${access}`);
    assert.equal(AuthManager.getAuthState(), AuthState.AUTHENTICATED);
    assert.equal(await AuthManager.getEffectiveUserId(), "owner-a");
    assert.equal(SessionStore.refreshToken, "fixture-refresh-a");
    assert.equal(globalThis.localStorage.getItem("password"), null);
  });
});

test("fresh access skips refresh, expired access without a refresh token cannot continue", async () => {
  await withSession({ access_token: token("account-a") }, async () => assert.fail("unexpected network"), async () => {
    assert.equal(await AuthManager.refreshSessionIfNeeded(), true);
    SessionStore.accessToken = token("account-a", -60);
    assert.equal(await AuthManager.refreshSessionIfNeeded(), false);
  });
});

test("anonymous bootstrap remains signed out without a network request", async () => {
  await withSession({ access_token: token("anonymous"), is_anonymous_session: "1" }, async () => assert.fail("unexpected network"), async () => {
    await AuthManager.bootstrap();
    assert.equal(AuthManager.getAuthState(), AuthState.SIGNED_OUT);
  });
});

test("concurrent forced refreshes share one exchange and retain the rotated token pair", async () => {
  const response = deferred();
  const started = deferred();
  const calls = [];
  await withSession({ access_token: token("account-a", -60), refresh_token: "fixture-refresh-a" }, async (url, options) => {
    calls.push({ url, options }); started.resolve(); return response.promise;
  }, async () => {
    const first = AuthManager.refreshSessionIfNeeded({ force: true });
    await started.promise;
    const second = AuthManager.refreshSessionIfNeeded({ force: true });
    const rotated = token("account-a");
    response.resolve(json({ access_token: rotated, refresh_token: "fixture-refresh-rotated" }));
    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${fixtureOrigin}/auth/v1/token?grant_type=refresh_token`);
    assert.deepEqual(JSON.parse(calls[0].options.body), { refresh_token: "fixture-refresh-a" });
    assert.equal(SessionStore.accessToken, rotated);
    assert.equal(SessionStore.refreshToken, "fixture-refresh-rotated");
    assert.equal(AuthManager.refreshPromise, null);
  });
});

test("rejected and malformed refreshes return failure without inventing a replacement session", async () => {
  for (const [response, expected] of [[json({ error: "invalid_grant" }, 401), "rejected"], [json({}), "invalid"]]) {
    await withSession({ access_token: token("account-a", -60), refresh_token: "fixture-refresh-a" }, async () => response, async () => {
      const before = SessionStore.accessToken;
      assert.equal(await AuthManager.refreshSessionIfNeeded({ force: true }), false);
      assert.equal(AuthManager.lastRefreshFailureKind, expected);
      assert.equal(SessionStore.accessToken, before);
      assert.equal(AuthManager.refreshPromise, null);
      assert.notEqual(AuthManager.getAuthState(), AuthState.AUTHENTICATED);
    });
  }
});

test("bootstrap clears credentials and private stores only on authoritative refresh rejection", async () => {
  for (const status of [400, 401, 403, 429, 500, 503]) {
    await withSession({
      access_token: token("account-a", -60), refresh_token: "fixture-refresh-a",
      nuvioAccountOwnerMarker: "owner-a", activeProfileId: '"1"',
      savedLibraryItems: '[{"contentId":"private-a"}]',
      watchedItems: '[{"contentId":"watched-a"}]',
      watchProgressItems: '[{"contentId":"progress-a"}]',
      unrelatedDevicePreference: "preserve"
    }, async () => json({ error: "fixture-refresh-failure" }, status), async () => {
      await AuthManager.bootstrap();
      assert.equal(AuthManager.getAuthState(), AuthState.SIGNED_OUT);
      const rejected = [400, 401, 403].includes(status);
      assert.equal(SessionStore.accessToken === null, rejected, `access token status ${status}`);
      assert.equal(SessionStore.refreshToken === null, rejected, `refresh token status ${status}`);
      for (const key of ["savedLibraryItems", "watchedItems", "watchProgressItems", "activeProfileId"]) {
        assert.equal(globalThis.localStorage.getItem(key) === null, rejected, `${key} status ${status}`);
      }
      assert.equal(globalThis.localStorage.getItem("unrelatedDevicePreference"), "preserve");
    });
  }
});

test("obsolete rejected bootstrap cannot clear a completed newer login or its private stores", async () => {
  const response = deferred();
  const accessB = token("account-b");
  await withSession({ access_token: token("account-a", -60), refresh_token: "fixture-refresh-a" }, async url => {
    if (url.endsWith("grant_type=refresh_token")) return response.promise;
    if (url.endsWith("grant_type=password")) return json({ access_token: accessB, refresh_token: "fixture-refresh-b" });
    return json("owner-b");
  }, async () => {
    const obsolete = AuthManager.bootstrap();
    await AuthManager.signOut();
    await AuthManager.signInWithEmail("account-b@example.invalid", "fixture-password-b");
    globalThis.localStorage.setItem("savedLibraryItems", '[{"contentId":"private-b"}]');
    response.resolve(json({ error: "invalid_grant" }, 401));
    await obsolete;
    assert.equal(AuthManager.getAuthState(), AuthState.AUTHENTICATED);
    assert.equal(SessionStore.accessToken, accessB);
    assert.equal(SessionStore.refreshToken, "fixture-refresh-b");
    assert.equal(globalThis.localStorage.getItem("savedLibraryItems"), '[{"contentId":"private-b"}]');
  });
});

test("a delayed sync-owner response cannot authenticate after logout", async () => {
  const response = deferred();
  const started = deferred();
  await withSession({ access_token: token("account-a") }, async () => { started.resolve(); return response.promise; }, async () => {
    const pending = AuthManager.getEffectiveUserId();
    await started.promise;
    await AuthManager.signOut();
    response.resolve(json("owner-a"));
    await assert.rejects(pending, /Session changed/);
    assert.equal(AuthManager.getAuthState(), AuthState.SIGNED_OUT);
    assert.equal(AuthManager.cachedEffectiveUserId, null);
    assert.equal(SessionStore.accessToken, null);
  });
});

test("a delayed refresh cannot restore credentials after logout", async () => {
  const response = deferred();
  const started = deferred();
  await withSession({ access_token: token("account-a", -60), refresh_token: "fixture-refresh-a" }, async () => { started.resolve(); return response.promise; }, async () => {
    const pending = AuthManager.refreshSessionIfNeeded({ force: true });
    await started.promise;
    await AuthManager.signOut();
    response.resolve(json({ access_token: token("account-a"), refresh_token: "fixture-late-refresh-a" }));
    assert.equal(await pending, false);
    assert.equal(SessionStore.accessToken, null);
    assert.equal(SessionStore.refreshToken, null);
    assert.equal(AuthManager.getAuthState(), AuthState.SIGNED_OUT);
  });
});

test("a delayed A refresh cannot overwrite the completed B sign-in", async () => {
  const response = deferred();
  const started = deferred();
  const accessB = token("account-b");
  await withSession({ access_token: token("account-a", -60), refresh_token: "fixture-refresh-a" }, async (url) => {
    if (url.endsWith("grant_type=refresh_token")) { started.resolve(); return response.promise; }
    if (url.endsWith("grant_type=password")) return json({ access_token: accessB, refresh_token: "fixture-refresh-b" });
    return json("owner-b");
  }, async () => {
    const pending = AuthManager.refreshSessionIfNeeded({ force: true });
    await started.promise;
    await AuthManager.signOut();
    await AuthManager.signInWithEmail("account-b@example.invalid", "fixture-password-b");
    response.resolve(json({ access_token: token("account-a"), refresh_token: "fixture-late-refresh-a" }));
    assert.equal(await pending, false);
    assert.equal(SessionStore.accessToken, accessB);
    assert.equal(SessionStore.refreshToken, "fixture-refresh-b");
    assert.equal(AuthManager.getAuthState(), AuthState.AUTHENTICATED);
    assert.equal(await AuthManager.getEffectiveUserId(), "owner-b");
  });
});

test("logout during refresh JSON parsing also discards the late token pair", async () => {
  const body = deferred();
  const parsing = deferred();
  await withSession({ access_token: token("account-a", -60), refresh_token: "fixture-refresh-a" }, async () => ({
    ok: true,
    json: () => { parsing.resolve(); return body.promise; }
  }), async () => {
    const pending = AuthManager.refreshSessionIfNeeded({ force: true });
    await parsing.promise;
    await AuthManager.signOut();
    assert.equal(SessionStore.accessToken, null);
    body.resolve({ access_token: token("account-a"), refresh_token: "fixture-late-refresh-a" });
    assert.equal(await pending, false);
    assert.equal(SessionStore.accessToken, null);
    assert.equal(SessionStore.refreshToken, null);
  });
});

test("a new session refresh is independent and an old completion cannot clear its pending slot", async () => {
  const oldResponse = deferred();
  const newResponse = deferred();
  let oldCalls = 0;
  let newCalls = 0;
  const accessB = token("account-b");
  await withSession({ access_token: token("account-a", -60), refresh_token: "fixture-refresh-a" }, async (url, options) => {
    if (url.endsWith("grant_type=password")) return json({ access_token: accessB, refresh_token: "fixture-refresh-b" });
    if (url.endsWith("get_sync_owner")) return json("owner-b");
    const body = JSON.parse(options.body);
    if (body.refresh_token === "fixture-refresh-a") { oldCalls++; return oldResponse.promise; }
    newCalls++;
    return newResponse.promise;
  }, async () => {
    const oldPending = AuthManager.refreshSessionIfNeeded({ force: true });
    assert.equal(oldCalls, 1);
    await AuthManager.signOut();
    await AuthManager.signInWithEmail("account-b@example.invalid", "fixture-password-b");
    assert.equal(SessionStore.accessToken, accessB);
    const newPending = AuthManager.refreshSessionIfNeeded({ force: true });
    try {
      assert.equal(newCalls, 1);
      oldResponse.resolve(json({ access_token: token("account-a"), refresh_token: "fixture-late-refresh-a" }));
      assert.equal(await oldPending, false);
      assert.notEqual(AuthManager.refreshPromise, null);
      const duplicate = AuthManager.refreshSessionIfNeeded({ force: true });
      assert.equal(newCalls, 1);
      const rotatedB = token("account-b", 7200);
      newResponse.resolve(json({ access_token: rotatedB, refresh_token: "fixture-refresh-b-rotated" }));
      assert.deepEqual(await Promise.all([newPending, duplicate]), [true, true]);
      assert.equal(SessionStore.accessToken, rotatedB);
      assert.equal(SessionStore.refreshToken, "fixture-refresh-b-rotated");
      assert.equal(AuthManager.refreshPromise, null);
    } finally {
      oldResponse.resolve(json({ access_token: token("account-a"), refresh_token: "fixture-late-refresh-a" }));
      newResponse.resolve(json({ access_token: accessB, refresh_token: "fixture-refresh-b" }));
      await Promise.allSettled([oldPending, newPending]);
    }
  });
});

test("obsolete bootstrap waiting for A refresh cannot sign out a completed B session", async () => {
  const response = deferred();
  const accessB = token("account-b");
  await withSession({ access_token: token("account-a", -60), refresh_token: "fixture-refresh-a" }, async (url) => {
    if (url.endsWith("grant_type=refresh_token")) return response.promise;
    if (url.endsWith("grant_type=password")) return json({ access_token: accessB, refresh_token: "fixture-refresh-b" });
    return json("owner-b");
  }, async () => {
    const bootstrap = AuthManager.bootstrap();
    await AuthManager.signOut();
    await AuthManager.signInWithEmail("account-b@example.invalid", "fixture-password-b");
    assert.equal(AuthManager.getAuthState(), AuthState.AUTHENTICATED);
    response.resolve(json({ access_token: token("account-a"), refresh_token: "fixture-late-refresh-a" }));
    await bootstrap;
    assert.equal(SessionStore.accessToken, accessB);
    assert.equal(SessionStore.refreshToken, "fixture-refresh-b");
    assert.equal(AuthManager.getAuthState(), AuthState.AUTHENTICATED);
  });
});
