import assert from "node:assert/strict";
import test from "node:test";

// A reconnect sync retries pull-then-push for about half a minute. Signing out
// and in as another account inside that window used to let the old run's push go
// out under the new session, carrying the new account's freshly reset, empty
// watched store -- which replaced that account's cloud history with nothing.

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear()
  };
}

globalThis.localStorage = createStorage();

const { WatchProgressSyncService } = await import("./watchProgressSyncService.js");
const { WatchedItemsSyncService } = await import("./watchedItemsSyncService.js");
const { AuthManager } = await import("../auth/authManager.js");
const { AuthState } = await import("../auth/authState.js");
const { ProfileManager } = await import("./profileManager.js");

const watchedRow = {
  content_id: "tt-watched",
  content_type: "movie",
  title: "Watched",
  season: null,
  episode: null,
  watched_at: 1700000000000
};

function installCloud(onRequest) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const procedure = String(url).split("/rpc/")[1] || "";
    const body = init?.body ? JSON.parse(init.body) : {};
    calls.push({ procedure, body, generation: AuthManager.getSessionGeneration() });
    const result = (await onRequest?.(procedure, body)) ?? [];
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => result,
      text: async () => JSON.stringify(result)
    };
  };
  return calls;
}

// What a sign-out followed by another account's sign-in leaves behind: a new
// session generation, still authenticated, with this device's account data gone.
function switchAccount() {
  AuthManager.sessionGeneration += 1;
  globalThis.localStorage.clear();
  AuthManager.setState(AuthState.AUTHENTICATED);
}

test("a reconnect run that outlives its session pushes nothing under the next one", async () => {
  globalThis.localStorage.clear();
  AuthManager.setState(AuthState.AUTHENTICATED);
  let switched = false;
  const calls = installCloud((procedure) => {
    if (procedure === "sync_pull_watched_items" && !switched) {
      switched = true;
      switchAccount();
      return [watchedRow];
    }
    return [];
  });

  await WatchProgressSyncService.syncAfterReconnect("test");

  assert.equal(switched, true, "the watched pull reached the cloud");
  const afterSwitch = calls.filter((call) => call.generation !== calls[0].generation);
  assert.deepEqual(
    afterSwitch.filter((call) => call.procedure.startsWith("sync_push_")).map((call) => call.procedure),
    []
  );
});

test("a reconnect run whose profile changes mid-pull pushes nothing for the new profile", async () => {
  globalThis.localStorage.clear();
  AuthManager.setState(AuthState.AUTHENTICATED);
  await ProfileManager.setActiveProfile("1");
  let switched = false;
  const calls = installCloud(async (procedure) => {
    if (procedure === "sync_pull_watched_items" && !switched) {
      switched = true;
      await ProfileManager.setActiveProfile("2");
      return [watchedRow];
    }
    return [];
  });

  await WatchProgressSyncService.syncAfterReconnect("test");

  assert.equal(switched, true, "the watched pull reached the cloud");
  const pullIndex = calls.findIndex((call) => call.procedure === "sync_pull_watched_items");
  assert.deepEqual(
    calls.slice(pullIndex + 1).filter((call) => call.procedure.startsWith("sync_push_")).map((call) => call.procedure),
    []
  );
  await ProfileManager.setActiveProfile("1");
});

test("a watched push pinned to an earlier session is refused before it is sent", async () => {
  globalThis.localStorage.clear();
  AuthManager.setState(AuthState.AUTHENTICATED);
  const calls = installCloud();
  const sessionGeneration = AuthManager.getSessionGeneration();
  switchAccount();

  assert.equal(await WatchedItemsSyncService.push({ sessionGeneration, profileId: 1 }), false);
  assert.deepEqual(calls, []);
});

test("a watched push pinned to another profile is refused", async () => {
  globalThis.localStorage.clear();
  AuthManager.setState(AuthState.AUTHENTICATED);
  const calls = installCloud();

  assert.equal(
    await WatchedItemsSyncService.push({
      sessionGeneration: AuthManager.getSessionGeneration(),
      profileId: 2
    }),
    false
  );
  assert.deepEqual(calls, []);
});
