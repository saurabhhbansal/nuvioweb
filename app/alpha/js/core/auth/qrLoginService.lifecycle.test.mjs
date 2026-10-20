import assert from "node:assert/strict";
import test from "node:test";

const fixtureOrigin = "https://identity.fixture.invalid";
globalThis.__NUVIO_ENV__ = {
  NUVIO_SUPABASE_URL: fixtureOrigin,
  NUVIO_SUPABASE_ANON_KEY: "fixture-public-key",
  NUVIO_SUPABASE_FALLBACK_URL: ""
};
const { QrLoginService, isSafeQrImageUrl } = await import("./qrLoginService.js");
const { AuthManager } = await import("./authManager.js");
const { SessionStore } = await import("../storage/sessionStore.js");
const { AuthState } = await import("./authState.js");

// Unsigned synthetic input for control-flow tests, never identity proof.
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
  AuthManager.authAttemptSequence = 0;
  QrLoginService.cancelAttempt();
}
async function withSession(entries, fetchImpl, run) {
  const original = { storage: globalThis.localStorage, fetch: globalThis.fetch };
  globalThis.localStorage = storage({});
  reset();
  globalThis.localStorage = storage(entries);
  globalThis.fetch = fetchImpl;
  try { await run(); }
  finally {
    reset();
    globalThis.localStorage = original.storage;
    globalThis.fetch = original.fetch;
  }
}
function anonymousSession(subject = "anonymous") {
  return {
    access_token: token(subject),
    refresh_token: "fixture-anonymous-refresh",
    is_anonymous_session: "1"
  };
}

test("a delayed QR exchange cannot overwrite a later session", async () => {
  const response = deferred();
  const started = deferred();
  const calls = [];
  await withSession(anonymousSession(), async (url, options) => {
    calls.push({ url, options });
    started.resolve();
    return response.promise;
  }, async () => {
    const attemptId = QrLoginService.beginAttempt();
    const pending = QrLoginService.exchange("synthetic-code", "synthetic-nonce", attemptId);
    await started.promise;
    await AuthManager.signOut();
    SessionStore.accessToken = token("later-account");
    SessionStore.refreshToken = "later-refresh";
    AuthManager.setState(AuthState.AUTHENTICATED);
    response.resolve(json({
      access_token: token("stale-account"),
      refresh_token: "stale-refresh"
    }));
    assert.equal(await pending, false);
    assert.equal(SessionStore.accessToken, token("later-account"));
    assert.equal(SessionStore.refreshToken, "later-refresh");
    assert.equal(AuthManager.getAuthState(), AuthState.AUTHENTICATED);
    assert.equal(QrLoginService.isAttemptActive(attemptId), false);
    assert.equal(calls.length, 1);
  });
});

test("a delayed anonymous bootstrap cannot publish after logout and a later login", async () => {
  const response = deferred();
  const started = deferred();
  const calls = [];
  await withSession({}, async (url) => {
    calls.push(url);
    if (url.endsWith("/auth/v1/signup")) {
      started.resolve();
      return response.promise;
    }
    throw new Error(`unexpected request ${url}`);
  }, async () => {
    const attemptId = QrLoginService.beginAttempt();
    const pending = QrLoginService.start(attemptId);
    await started.promise;
    await AuthManager.signOut();
    SessionStore.accessToken = token("later-account");
    SessionStore.refreshToken = "later-refresh";
    AuthManager.setState(AuthState.AUTHENTICATED);
    response.resolve(json({
      access_token: token("anonymous"),
      refresh_token: "anonymous-refresh"
    }));
    assert.equal(await pending, null);
    assert.equal(SessionStore.accessToken, token("later-account"));
    assert.equal(SessionStore.refreshToken, "later-refresh");
    assert.equal(calls.length, 1);
  });
});

test("cancelling an attempt prevents a held exchange from publishing", async () => {
  const response = deferred();
  const started = deferred();
  await withSession(anonymousSession(), async () => {
    started.resolve();
    return response.promise;
  }, async () => {
    const attemptId = QrLoginService.beginAttempt();
    const pending = QrLoginService.exchange("synthetic-code", "synthetic-nonce", attemptId);
    await started.promise;
    QrLoginService.cancelAttempt(attemptId);
    response.resolve(json({ access_token: token("stale"), refresh_token: "stale" }));
    assert.equal(await pending, false);
    assert.equal(SessionStore.accessToken, null);
    assert.equal(SessionStore.isAnonymousSession, false);
    assert.equal(QrLoginService.isAttemptActive(attemptId), false);
  });
});

test("a rejected exchange redacts the code and nonce and keeps the anonymous session", async () => {
  await withSession(anonymousSession(), async () => json({
    message: "bad code synthetic-code for nonce synthetic-nonce"
  }, 400), async () => {
    const attemptId = QrLoginService.beginAttempt();
    assert.equal(await QrLoginService.exchange("synthetic-code", "synthetic-nonce", attemptId), false);
    const error = QrLoginService.getLastError();
    assert.doesNotMatch(error, /synthetic-code|synthetic-nonce/);
    assert.match(error, /\[redacted\]/);
    assert.equal(SessionStore.accessToken, token("anonymous"));
    assert.equal(SessionStore.isAnonymousSession, true);
  });
});

test("a malformed exchange response is rejected without publishing", async () => {
  await withSession(anonymousSession(), async () => json({}), async () => {
    const attemptId = QrLoginService.beginAttempt();
    assert.equal(await QrLoginService.exchange("synthetic-code", "synthetic-nonce", attemptId), false);
    assert.match(QrLoginService.getLastError(), /missing session tokens/);
    assert.equal(SessionStore.accessToken, token("anonymous"));
  });
});

test("a current valid exchange establishes the account through the common path", async () => {
  const calls = [];
  await withSession(anonymousSession(), async (url) => {
    calls.push(url);
    if (url.endsWith("/functions/v1/tv-logins-exchange")) {
      return json({ access_token: token("qr-account"), refresh_token: "qr-refresh" });
    }
    if (url.endsWith("/rest/v1/rpc/get_sync_owner")) return json("owner-qr");
    throw new Error(`unexpected request ${url}`);
  }, async () => {
    const attemptId = QrLoginService.beginAttempt();
    const result = await QrLoginService.exchange("synthetic-code", "synthetic-nonce", attemptId);
    assert.ok(result);
    assert.equal(AuthManager.getAuthState(), AuthState.AUTHENTICATED);
    assert.equal(SessionStore.isAnonymousSession, false);
    assert.equal(SessionStore.accessToken, token("qr-account"));
    assert.equal(globalThis.localStorage.getItem("nuvioAccountOwnerMarker"), "owner-qr");
    assert.equal(QrLoginService.isAttemptActive(attemptId), false);
    assert.equal(calls.filter((url) => url.endsWith("/functions/v1/tv-logins-exchange")).length, 1);
  });
});

test("a delayed AuthManager TV exchange cannot publish over a later session", async () => {
  const response = deferred();
  const started = deferred();
  await withSession({ access_token: token("anonymous") }, async () => {
    started.resolve();
    return response.promise;
  }, async () => {
    const pending = AuthManager.exchangeTvLoginSession("synthetic-code", "synthetic-nonce");
    await started.promise;
    await AuthManager.signOut();
    SessionStore.accessToken = token("later-account");
    SessionStore.refreshToken = "later-refresh";
    AuthManager.setState(AuthState.AUTHENTICATED);
    response.resolve(json({ accessToken: token("stale"), refreshToken: "stale" }));
    await assert.rejects(pending, /Session changed during TV login exchange/);
    assert.equal(SessionStore.accessToken, token("later-account"));
    assert.equal(SessionStore.refreshToken, "later-refresh");
  });
});

test("a delayed email sign-in cannot publish over a later session", async () => {
  const response = deferred();
  const started = deferred();
  await withSession({}, async () => {
    started.resolve();
    return response.promise;
  }, async () => {
    const pending = AuthManager.signInWithEmail("synthetic@example.invalid", "fixture-password");
    await started.promise;
    await AuthManager.signOut();
    SessionStore.accessToken = token("later-account");
    SessionStore.refreshToken = "later-refresh";
    AuthManager.setState(AuthState.AUTHENTICATED);
    response.resolve(json({ access_token: token("stale"), refresh_token: "stale" }));
    await assert.rejects(pending, /Session changed during sign-in/);
    assert.equal(SessionStore.accessToken, token("later-account"));
    assert.equal(SessionStore.refreshToken, "later-refresh");
  });
});

test("the QR image URL policy accepts only local, same-origin or image-data destinations", () => {
  const originalLocation = globalThis.location;
  globalThis.location = { href: "https://nuvioweb.example.invalid/" };
  try {
    assert.equal(isSafeQrImageUrl("/assets/brand/app_logo_wordmark.png"), true);
    assert.equal(isSafeQrImageUrl("https://nuvioweb.example.invalid/qr.png"), true);
    assert.equal(isSafeQrImageUrl("https://evil.example.invalid/qr.png"), false);
    assert.equal(isSafeQrImageUrl("https://nuvioweb.example.invalid.evil/qr.png"), false);
    assert.equal(isSafeQrImageUrl("javascript:globalThis.__qrXss=1"), false);
    assert.equal(isSafeQrImageUrl('https://nuvioweb.example.invalid/x" onerror="globalThis.__qrXss=1'), false);
    assert.equal(isSafeQrImageUrl("data:image/png;base64,AAAA"), true);
    assert.equal(isSafeQrImageUrl("data:text/html;base64,AAAA"), false);
    assert.equal(isSafeQrImageUrl(""), false);
  } finally {
    globalThis.location = originalLocation;
  }
});
