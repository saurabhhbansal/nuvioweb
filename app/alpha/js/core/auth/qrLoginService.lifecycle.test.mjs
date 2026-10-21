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
const tokenEpoch = Math.floor(Date.now() / 1000);
function token(subject, expiresIn = 3600) {
  const payload = Buffer.from(JSON.stringify({
    sub: subject,
    exp: tokenEpoch + expiresIn
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

test("a signed-out device holding an old account pair starts QR from a fresh anonymous session", async () => {
  const calls = [];
  await withSession({ access_token: token("old-account"), refresh_token: "old-refresh" }, async (url, options) => {
    calls.push({ url, authorization: options?.headers?.Authorization });
    if (url.endsWith("/auth/v1/signup")) return json({ access_token: token("anonymous"), refresh_token: "fixture-anonymous-refresh" });
    if (url.endsWith("/functions/v1/tv-logins-exchange")) return json({ access_token: token("qr-account"), refresh_token: "qr-refresh" });
    if (url.endsWith("/rest/v1/rpc/get_sync_owner")) return json("owner-qr");
    throw new Error(`unexpected request ${url}`);
  }, async () => {
    AuthManager.setState(AuthState.SIGNED_OUT);
    const attemptId = QrLoginService.beginAttempt();
    assert.ok(await QrLoginService.exchange("synthetic-code", "synthetic-nonce", attemptId));
    assert.equal(AuthManager.getAuthState(), AuthState.AUTHENTICATED);
    assert.equal(SessionStore.accessToken, token("qr-account"));
    assert.equal(calls.some((call) => call.url.includes("grant_type=refresh_token")), false);
    const exchange = calls.find((call) => call.url.endsWith("/functions/v1/tv-logins-exchange"));
    assert.equal(exchange.authorization, `Bearer ${token("anonymous")}`);
  });
});

test("a later authentication attempt is not signed out by a stale QR establishment", async () => {
  const ownerResponse = deferred();
  const ownerStarted = deferred();
  await withSession(anonymousSession(), async (url) => {
    if (url.endsWith("/functions/v1/tv-logins-exchange")) {
      return json({ access_token: token("qr-account"), refresh_token: "qr-refresh" });
    }
    if (url.endsWith("/rest/v1/rpc/get_sync_owner")) {
      ownerStarted.resolve();
      return ownerResponse.promise;
    }
    throw new Error(`unexpected request ${url}`);
  }, async () => {
    const attemptId = QrLoginService.beginAttempt();
    const pending = QrLoginService.exchange("synthetic-code", "synthetic-nonce", attemptId);
    await ownerStarted.promise;
    AuthManager.beginAuthenticationAttempt();
    SessionStore.accessToken = token("later-account");
    SessionStore.refreshToken = "later-refresh";
    SessionStore.isAnonymousSession = false;
    AuthManager.setState(AuthState.AUTHENTICATED);
    ownerResponse.resolve(json("owner-qr"));
    assert.equal(await pending, false);
    assert.equal(SessionStore.accessToken, token("later-account"));
    assert.equal(SessionStore.refreshToken, "later-refresh");
    assert.equal(AuthManager.getAuthState(), AuthState.AUTHENTICATED);
    assert.equal(globalThis.localStorage.getItem("nuvioAccountOwnerMarker"), null);
  });
});

test("cancelling during owner resolution prevents publication", async () => {
  const ownerResponse = deferred();
  const ownerStarted = deferred();
  await withSession(anonymousSession(), async (url) => {
    if (url.endsWith("/functions/v1/tv-logins-exchange")) {
      return json({ access_token: token("qr-account"), refresh_token: "qr-refresh" });
    }
    if (url.endsWith("/rest/v1/rpc/get_sync_owner")) {
      ownerStarted.resolve();
      return ownerResponse.promise;
    }
    throw new Error(`unexpected request ${url}`);
  }, async () => {
    const attemptId = QrLoginService.beginAttempt();
    const pending = QrLoginService.exchange("synthetic-code", "synthetic-nonce", attemptId);
    await ownerStarted.promise;
    QrLoginService.cancelAttempt(attemptId);
    assert.equal(SessionStore.accessToken, null);
    assert.equal(SessionStore.refreshToken, null);
    assert.equal(globalThis.localStorage.getItem("nuvioAccountOwnerMarker"), null);
    ownerResponse.resolve(json("owner-qr"));
    assert.equal(await pending, false);
    assert.equal(SessionStore.accessToken, null);
    assert.equal(SessionStore.refreshToken, null);
    assert.notEqual(AuthManager.getAuthState(), AuthState.AUTHENTICATED);
    assert.equal(AuthManager.cachedEffectiveUserId, null);
    await assert.rejects(AuthManager.getEffectiveUserId(), /Missing valid session token/);
    assert.equal(globalThis.localStorage.getItem("nuvioAccountOwnerMarker"), null);
    assert.equal(QrLoginService.isAttemptActive(attemptId), false);
  });
});

test("a new QR attempt during owner resolution does not publish or clear the new attempt", async () => {
  const ownerResponse = deferred();
  const ownerStarted = deferred();
  await withSession(anonymousSession(), async (url) => {
    if (url.endsWith("/functions/v1/tv-logins-exchange")) {
      return json({ access_token: token("qr-account"), refresh_token: "qr-refresh" });
    }
    if (url.endsWith("/rest/v1/rpc/get_sync_owner")) {
      ownerStarted.resolve();
      return ownerResponse.promise;
    }
    throw new Error(`unexpected request ${url}`);
  }, async () => {
    const first = QrLoginService.beginAttempt();
    const pending = QrLoginService.exchange("synthetic-code", "synthetic-nonce", first);
    await ownerStarted.promise;
    const second = QrLoginService.beginAttempt();
    assert.equal(SessionStore.accessToken, null);
    assert.equal(SessionStore.refreshToken, null);
    ownerResponse.resolve(json("owner-qr"));
    assert.equal(await pending, false);
    assert.equal(QrLoginService.isAttemptActive(first), false);
    assert.equal(QrLoginService.isAttemptActive(second), true);
    assert.equal(AuthManager.getAuthState(), AuthState.LOADING);
    assert.equal(globalThis.localStorage.getItem("nuvioAccountOwnerMarker"), null);
    assert.equal(SessionStore.accessToken, null);
    await AuthManager.bootstrap();
    assert.equal(AuthManager.getAuthState(), AuthState.SIGNED_OUT);
    assert.equal(globalThis.localStorage.getItem("nuvioAccountOwnerMarker"), null);
  });
});

test("a start error is redacted for the device nonce", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const originalWindow = globalThis.window;
  globalThis.window = { location: { protocol: "https:", origin: "https://nuvioweb.example.invalid" } };
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => "fixture-nonce-1234" },
    configurable: true
  });
  try {
    await withSession(anonymousSession(), async (url) => {
      if (url.endsWith("/rest/v1/rpc/start_tv_login_session")) {
        return json({ message: "bad device nonce fixture-nonce-1234" }, 400);
      }
      throw new Error(`unexpected request ${url}`);
    }, async () => {
      assert.equal(await QrLoginService.start(), null);
      const error = QrLoginService.getLastError();
      assert.doesNotMatch(error, /fixture-nonce-1234/);
      assert.match(error, /\[redacted\]/);
    });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else delete globalThis.crypto;
    globalThis.window = originalWindow;
  }
});

test("a stale poll from a superseded attempt is refused before any request", async () => {
  const calls = [];
  await withSession(anonymousSession(), async (url) => {
    calls.push(url);
    throw new Error(`unexpected request ${url}`);
  }, async () => {
    const first = QrLoginService.beginAttempt();
    QrLoginService.beginAttempt();
    assert.equal(await QrLoginService.poll("synthetic-code", "synthetic-nonce", first), null);
    assert.match(QrLoginService.getLastError(), /not active/);
    assert.equal(calls.length, 0);
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
  assert.equal(isSafeQrImageUrl("https://evil.example.invalid/qr.png"), false);
});


test("overlapping approved exchanges share one publication and retain the valid session", async () => {
  const ownerResponse = deferred();
  const ownerStarted = deferred();
  let exchangeCalls = 0;
  await withSession(anonymousSession(), async (url) => {
    if (url.endsWith("/functions/v1/tv-logins-exchange")) {
      exchangeCalls += 1;
      return json({ access_token: token("qr-account"), refresh_token: "qr-refresh" });
    }
    if (url.endsWith("/rest/v1/rpc/get_sync_owner")) {
      ownerStarted.resolve();
      return ownerResponse.promise;
    }
    throw new Error(`unexpected request ${url}`);
  }, async () => {
    const attempt = QrLoginService.beginAttempt();
    const first = QrLoginService.exchange("synthetic-code", "synthetic-nonce", attempt);
    await ownerStarted.promise;
    const second = QrLoginService.exchange("synthetic-code", "synthetic-nonce", attempt);
    ownerResponse.resolve(json("owner-qr"));
    const results = await Promise.all([first, second]);
    assert.ok(results.every(Boolean));
    assert.equal(exchangeCalls, 1);
    assert.equal(SessionStore.accessToken, token("qr-account"));
    assert.equal(AuthManager.cachedEffectiveUserId, "owner-qr");
    assert.equal(AuthManager.getAuthState(), AuthState.AUTHENTICATED);
  });
});


for (const failureStatus of [401, 403]) {
  test(`cancelled owner HTTP ${failureStatus} cannot retry, refresh or sign out a later session`, async () => {
    const response = deferred();
    const started = deferred();
    const calls = [];
    await withSession(anonymousSession(), async (url) => {
      calls.push(url);
      if (url.endsWith("/functions/v1/tv-logins-exchange")) return json({ access_token: token("qr"), refresh_token: "qr-refresh" });
      if (url.endsWith("/rest/v1/rpc/get_sync_owner")) { started.resolve(); return response.promise; }
      throw new Error("unexpected request");
    }, async () => {
      const attempt = QrLoginService.beginAttempt();
      const pending = QrLoginService.exchange("synthetic-code", "synthetic-nonce", attempt);
      await started.promise;
      QrLoginService.cancelAttempt(attempt);
      AuthManager.beginAuthenticationAttempt();
      SessionStore.accessToken = token("later");
      SessionStore.refreshToken = "later-refresh";
      AuthManager.setState(AuthState.AUTHENTICATED);
      response.resolve(json({ error: "rejected" }, failureStatus));
      assert.equal(await pending, false);
      assert.equal(calls.length, 2);
      assert.equal(SessionStore.accessToken, token("later"));
      assert.equal(AuthManager.cachedEffectiveUserId, null);
      assert.equal(AuthManager.getAuthState(), AuthState.AUTHENTICATED);
    });
  });
}
