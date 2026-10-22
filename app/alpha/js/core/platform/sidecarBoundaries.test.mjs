import test from "node:test";
import assert from "node:assert/strict";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
};
globalThis.__NUVIO_ENV__ = { TRAKT_CLIENT_ID: "fixture-public-client" };
const { TraktAuthService } = await import("../../data/repository/traktAuthService.js");
const { TraktAuthStore } = await import("../../data/local/traktAuthStore.js");
const { DebridApi } = await import("../../data/remote/api/debridApi.js");
const { parseTorboxDeviceTokenResult, parsePremiumizeDeviceTokenResult } = await import("../debrid/debridDeviceAuthService.js");
const { prepareBrowserExternalPlaybackLaunch } =
  await import("../../ui/components/browserExternalPlayer.js");
const {
  beginExternalPlaybackHandoff,
  collectExternalPlaybackReport,
  createExternalPlaybackCallbacks,
  readPendingExternalPlaybackHandoff
} = await import("../../ui/components/browserExternalPlaybackHandoff.js");
const { bindBrowserPushReturn, enableBrowserPushReturn, getBrowserPushReturnState } =
  await import("../../ui/components/browserPushReturn.js");

function runtime(enabled = false) {
  const values = new Map();
  return {
    __NUVIO_ENV__: { NUVIO_ENABLE_EXTERNAL_RETURN_BRIDGE: String(enabled) },
    crypto: globalThis.crypto,
    location: { href: "https://app.fixture.invalid/player" },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key)
    }
  };
}
const context = { itemId: "fixture:original", itemType: "movie" };

test("disabled Trakt cannot probe, start, poll, refresh or expose a saved token", async (t) => {
  // A site with neither a Trakt client id nor a bridge.
  globalThis.__NUVIO_ENV__.TRAKT_CLIENT_ID = "";
  t.after(() => { globalThis.__NUVIO_ENV__.TRAKT_CLIENT_ID = "fixture-public-client"; });
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    throw new Error("unexpected network");
  };
  TraktAuthStore.saveToken({
    access_token: "synthetic-private-access",
    refresh_token: "synthetic-private-refresh",
    expires_in: 3600
  });
  const saved = JSON.stringify(TraktAuthStore.get());
  try {
    assert.equal(await TraktAuthService.refreshBrowserBridgeAvailability(), false);
    await assert.rejects(TraktAuthService.startDeviceAuth(), { code: "SIDECAR_UNAVAILABLE" });
    assert.match((await TraktAuthService.pollDeviceToken()).message, /unavailable on this site/);
    assert.equal(await TraktAuthService.refreshTokenIfNeeded(true), false);
    assert.equal(await TraktAuthService.getValidAccessToken(), null);
    assert.equal(JSON.stringify(TraktAuthStore.get()), saved);
    assert.deepEqual(calls, []);
  } finally {
    globalThis.fetch = original;
  }
});

test("disabled debrid bridge blocks credentials and resolver requests at the API boundary", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    throw new Error("unexpected network");
  };
  try {
    for (const result of await Promise.all([
      DebridApi.startTorboxDeviceAuthorization(),
      DebridApi.redeemTorboxDeviceAuthorization("fixture-device"),
      DebridApi.startPremiumizeDeviceAuthorization("fixture-client"),
      DebridApi.torboxCreateTorrent("synthetic-private-key", "magnet:?xt=urn:btih:fixture"),
      DebridApi.torboxCheckCached("synthetic-private-key", ["fixture-hash"]),
      DebridApi.torboxGetTorrent("synthetic-private-key", "fixture-id"),
      DebridApi.torboxRequestDownloadLink("synthetic-private-key", "fixture-id", "1")
    ])) {
      assert.equal(result.ok, false);
      assert.equal(result.data.error, "SIDECAR_UNAVAILABLE");
      assert.match(result.text, /direct compatible add-on source/);
      assert.doesNotMatch(JSON.stringify(result), /synthetic-private/);
    }
    assert.equal(await DebridApi.validateTorboxApiKey("synthetic-private-key"), false);
    assert.equal(await DebridApi.validatePremiumizeApiKey("synthetic-private-key"), false);
    assert.deepEqual(calls, []);
  } finally {
    globalThis.fetch = original;
  }
});

test("configured but absent bridges retain HTTP evidence and actionable failures", async () => {
  const original = globalThis.fetch;
  globalThis.__NUVIO_ENV__.NUVIO_ENABLE_TRAKT_BRIDGE = "true";
  globalThis.__NUVIO_ENV__.NUVIO_ENABLE_DEBRID_BRIDGE = "true";
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return new Response("<!doctype html><title>Not found</title>", { status: 404 });
  };
  try {
    await assert.rejects(TraktAuthService.startDeviceAuth(), /unavailable on this site/);
    const result = await DebridApi.redeemTorboxDeviceAuthorization("fixture-device");
    assert.equal(result.status, 404);
    assert.equal(parseTorboxDeviceTokenResult(result).status, "failed");
    assert.match(parseTorboxDeviceTokenResult(result).message, /unavailable on this site/);
    assert.equal(parsePremiumizeDeviceTokenResult(result).status, "failed");
    assert.match(parsePremiumizeDeviceTokenResult(result).message, /unavailable on this site/);
    assert.deepEqual(calls, ["/api/trakt/health", "/api/debrid/torbox/device/redeem"]);
  } finally {
    globalThis.fetch = original;
    delete globalThis.__NUVIO_ENV__.NUVIO_ENABLE_TRAKT_BRIDGE;
    delete globalThis.__NUVIO_ENV__.NUVIO_ENABLE_DEBRID_BRIDGE;
  }
});

test("static external launch retains original media but sends no callback and falls back manually", async () => {
  const rt = runtime();
  const prepared = prepareBrowserExternalPlaybackLaunch({
    runtime: rt,
    player: "outplayer",
    platform: "ios",
    mediaUrl: "https://media.fixture.invalid/original.mp4?token=synthetic-private",
    progressContext: context,
    profileId: "1"
  });
  assert.equal(prepared.automatic, false);
  assert.equal(prepared.callbackCapable, false);
  assert.equal(prepared.handoff.manualPromptEligible, true);
  assert.equal(prepared.handoff.progressMode, "manual");
  assert.doesNotMatch(prepared.launch.href, /external-return|x-success|x-cancel/);
  let requests = 0;
  await collectExternalPlaybackReport({
    runtime: rt,
    profileId: "1",
    fetchImpl: async () => {
      requests++;
    }
  });
  assert.equal(requests, 0);
});

test("foreign, expired and cross-profile return state cannot initiate collection", async () => {
  for (const patch of [
    { returnOrigin: "https://other.fixture.invalid" },
    { expiresAt: Date.now() - 1 },
    { expiresAt: Date.now() + 7 * 60 * 60 * 1000 },
    { profileId: "2" }
  ]) {
    const rt = runtime(true);
    const handoff = beginExternalPlaybackHandoff({
      runtime: rt,
      playerMode: "outplayer",
      automatic: true,
      progressContext: context,
      profileId: "1"
    });
    rt.localStorage.setItem(
      "nuvioExternalPlaybackHandoff",
      JSON.stringify({ ...handoff, ...patch })
    );
    let requests = 0;
    const result = await collectExternalPlaybackReport({
      runtime: rt,
      profileId: "1",
      fetchImpl: async () => {
        requests++;
      }
    });
    assert.equal(result.found, false);
    assert.equal(requests, 0);
  }
  for (const returnOrigin of [
    "https://user:password@app.fixture.invalid",
    "https://app.fixture.invalid/redirect",
    "https://app.fixture.invalid?next=evil",
    "http://app.fixture.invalid",
    "not-a-url"
  ]) {
    assert.equal(
      createExternalPlaybackCallbacks({
        token: "a".repeat(32),
        returnOrigin,
        outcomes: { success: "stopped" }
      }),
      null
    );
  }
  const rt = runtime(true);
  beginExternalPlaybackHandoff({
    runtime: rt,
    playerMode: "outplayer",
    automatic: true,
    progressContext: context,
    profileId: "1"
  });
  rt.__NUVIO_ENV__.NUVIO_ENABLE_EXTERNAL_RETURN_BRIDGE = "false";
  const restored = readPendingExternalPlaybackHandoff({ runtime: rt, profileId: "1" });
  assert.equal(restored.automatic, false);
  assert.equal(restored.manualPromptEligible, true);
});

test("disabled push return cannot fetch, prompt or bind a subscription", async () => {
  const rt = runtime();
  let prompts = 0;
  let requests = 0;
  Object.assign(rt, {
    isSecureContext: true,
    PushManager: function () {},
    Notification: {
      requestPermission() {
        prompts++;
      }
    },
    navigator: { serviceWorker: { ready: new Promise(() => {}) } }
  });
  const fetchImpl = async () => {
    requests++;
  };
  assert.equal(
    (await getBrowserPushReturnState({ runtime: rt, fetchImpl })).state,
    "server-not-configured"
  );
  assert.equal(
    (await enableBrowserPushReturn({ runtime: rt, fetchImpl })).state,
    "server-not-configured"
  );
  assert.equal(
    await bindBrowserPushReturn({ runtime: rt, token: "a".repeat(32), fetchImpl }),
    false
  );
  rt.__NUVIO_ENV__.NUVIO_ENABLE_EXTERNAL_RETURN_BRIDGE = "true";
  assert.equal(await bindBrowserPushReturn({ runtime: rt, token: "invalid", fetchImpl }), false);
  assert.equal(prompts, 0);
  assert.equal(requests, 0);
});

test("configured debrid rejects successful HTML and retains genuine provider auth rejection", async () => {
  const original = globalThis.fetch;
  globalThis.__NUVIO_ENV__.NUVIO_ENABLE_DEBRID_BRIDGE = "true";
  try {
    globalThis.fetch = async () =>
      new Response("<!doctype html><title>App shell</title>", { status: 200 });
    const missing = await DebridApi.startTorboxDeviceAuthorization();
    assert.equal(missing.ok, false);
    assert.equal(missing.status, 200);
    assert.equal(missing.data.error, "SIDECAR_UNAVAILABLE");
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: "unauthorized", message: "Fixture credential rejected" }),
        { status: 401 }
      );
    const rejected = await DebridApi.redeemTorboxDeviceAuthorization("fixture-device");
    assert.equal(rejected.ok, false);
    assert.equal(rejected.status, 401);
    assert.equal(rejected.data.error, "unauthorized");
  } finally {
    globalThis.fetch = original;
    delete globalThis.__NUVIO_ENV__.NUVIO_ENABLE_DEBRID_BRIDGE;
  }
});
