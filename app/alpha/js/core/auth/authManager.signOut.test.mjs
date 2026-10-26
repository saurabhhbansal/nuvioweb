import assert from "node:assert/strict";
import test from "node:test";

globalThis.__NUVIO_ENV__ = {
  NUVIO_SUPABASE_URL: "https://identity.fixture.invalid",
  NUVIO_SUPABASE_ANON_KEY: "fixture-public-key",
  NUVIO_SUPABASE_FALLBACK_URL: ""
};
const { AuthManager } = await import("./authManager.js");
const { AuthState } = await import("./authState.js");
const { registerAccountRuntimeResetHandler, resetAccountRuntimeState } = await import(
  "./accountLocalDataReset.js"
);

function storage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    has: (key) => values.has(key)
  };
}

const signedInAccount = () => ({
  access_token: "fixture.access.token",
  refresh_token: "fixture-refresh-b",
  savedLibraryItems: JSON.stringify([{ contentId: "account-b-library" }]),
  watchProgressItems: JSON.stringify([{ contentId: "account-b-progress" }]),
  profiles: JSON.stringify([{ id: "1", name: "Account B" }]),
  nuvioAccountOwnerMarker: "owner-b",
  deviceLanguage: "en"
});

// Sign-out must never touch the network: a hanging or failing server can then
// never keep someone stuck on the way out.
async function withSignedInAccount(fetchImpl, run) {
  const original = { storage: globalThis.localStorage, fetch: globalThis.fetch };
  const local = storage(signedInAccount());
  globalThis.localStorage = local;
  let fetches = 0;
  globalThis.fetch = (...args) => {
    fetches += 1;
    return fetchImpl(...args);
  };
  AuthManager.listeners = [];
  AuthManager.clearSessionRetry();
  AuthManager.setState(AuthState.AUTHENTICATED);
  try {
    await run(local, () => fetches);
  } finally {
    AuthManager.listeners = [];
    AuthManager.clearSessionRetry();
    AuthManager.state = AuthState.LOADING;
    globalThis.localStorage = original.storage;
    globalThis.fetch = original.fetch;
  }
}

function assertAccountDataGone(local) {
  for (const key of ["access_token", "refresh_token", "savedLibraryItems", "watchProgressItems", "profiles", "nuvioAccountOwnerMarker"]) {
    assert.equal(local.getItem(key), null, `${key} survived sign-out`);
  }
  assert.equal(local.getItem("deviceLanguage"), "en", "device settings are not account data");
}

const networkModes = {
  failing: () => Promise.reject(new TypeError("Failed to fetch")),
  hanging: () => new Promise(() => {}),
  working: async () => new Response("null", { status: 200 })
};

for (const [mode, fetchImpl] of Object.entries(networkModes)) {
  test(`sign-out finishes locally with the network ${mode}`, async () => {
    await withSignedInAccount(fetchImpl, async (local, fetchCount) => {
      const seen = [];
      AuthManager.subscribe((state, detail) =>
        seen.push({ state, reason: detail?.reason, wasAuthenticated: detail?.wasAuthenticated })
      );
      await AuthManager.signOut();
      assert.equal(AuthManager.getAuthState(), AuthState.SIGNED_OUT);
      assert.deepEqual(seen.at(-1), { state: AuthState.SIGNED_OUT, reason: "signOut", wasAuthenticated: true });
      assert.equal(fetchCount(), 0);
      assertAccountDataGone(local);
    });
  });
}

test("listeners hear about sign-out only after the old account's data is gone", async () => {
  await withSignedInAccount(networkModes.hanging, async (local) => {
    const seenAtNotify = [];
    AuthManager.subscribe((state) => {
      if (state === AuthState.SIGNED_OUT) {
        seenAtNotify.push(local.getItem("savedLibraryItems"), local.getItem("access_token"));
      }
    });
    await AuthManager.signOut();
    assert.deepEqual(seenAtNotify, [null, null]);
  });
});

test("a throwing listener cannot abort sign-out or silence the listeners after it", async () => {
  await withSignedInAccount(networkModes.failing, async (local) => {
    const later = [];
    AuthManager.subscribe((state) => {
      if (state === AuthState.SIGNED_OUT) throw new Error("listener failure");
    });
    AuthManager.subscribe((state) => later.push(state));
    await AuthManager.signOut();
    assert.equal(AuthManager.getAuthState(), AuthState.SIGNED_OUT);
    assert.equal(later.at(-1), AuthState.SIGNED_OUT);
    assertAccountDataGone(local);
  });
});

test("a runtime reset that never settles cannot hold sign-out open", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const unregister = registerAccountRuntimeResetHandler(() => new Promise(() => {}));
  try {
    await withSignedInAccount(networkModes.hanging, async (local) => {
      let finished = false;
      const signingOut = AuthManager.signOut().then(() => { finished = true; });
      await Promise.resolve();
      assert.equal(AuthManager.getAuthState(), AuthState.SIGNED_OUT);
      assertAccountDataGone(local);
      assert.equal(finished, false);
      t.mock.timers.tick(2000);
      await signingOut;
      assert.equal(finished, true);
    });
  } finally {
    unregister();
  }
});

test("a runtime reset that throws synchronously does not stop the other resets", async () => {
  let ranAfter = false;
  const removeThrowing = registerAccountRuntimeResetHandler(() => {
    throw new Error("reset failure");
  });
  const removeAfter = registerAccountRuntimeResetHandler(() => { ranAfter = true; });
  try {
    await resetAccountRuntimeState({ timeoutMs: 50 });
    assert.equal(ranAfter, true);
  } finally {
    removeThrowing();
    removeAfter();
  }
});

test("a session that simply was never there is not reported as a sign-out", async () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = storage({});
  AuthManager.listeners = [];
  const seen = [];
  try {
    AuthManager.subscribe((state, detail) => seen.push(detail?.reason ?? null));
    await AuthManager.bootstrap();
    assert.equal(AuthManager.getAuthState(), AuthState.SIGNED_OUT);
    assert.equal(seen.at(-1), null);
  } finally {
    AuthManager.listeners = [];
    AuthManager.state = AuthState.LOADING;
    globalThis.localStorage = original;
  }
});
