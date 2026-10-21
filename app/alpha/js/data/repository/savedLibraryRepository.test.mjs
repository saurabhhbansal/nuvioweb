import assert from "node:assert/strict";
import test from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Library sync end to end: the real repository, store, outbox and sync service
// against an in-memory cloud. Only auth, the active profile and the API call
// are stubbed.
let revision = 0;
const turn = () => new Promise((resolve) => setImmediate(resolve));

function memoryStorage() {
  const values = new Map();
  const storage = {
    failWrites: false,
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (storage.failWrites === true || storage.failWrites === key) throw new Error("Synthetic quota exceeded");
      values.set(key, String(value));
    },
    removeItem: (key) => values.delete(key),
    clear: () => values.clear()
  };
  return storage;
}

async function fixture(t) {
  let generation = 1;
  let authenticated = true;
  const cloud = new Map(); // `${profileId}::${type}::${id}` -> row
  const calls = [];
  const api = { offline: false, hold: null, rpc: null };
  const dependencies = {
    AuthManager: {
      get isAuthenticated() { return authenticated; },
      getSessionGeneration: () => generation,
      isSessionCurrent: (expected) => authenticated && expected === generation
    },
    ProfileManager: { getActiveProfileId: () => "1" },
    SupabaseApi: {
      async rpc(name, body) {
        calls.push({ name, body: structuredClone(body) });
        if (api.hold) await api.hold;
        if (api.offline) throw new TypeError("Failed to fetch");
        const pid = body.p_profile_id;
        if (name === "sync_pull_library") {
          return [...cloud.entries()].filter(([key]) => key.startsWith(`${pid}::`)).map(([, row]) => row)
            .slice(body.p_offset, body.p_offset + body.p_limit);
        }
        if (name === "sync_push_library_items" && body.p_items.some((row) => row.content_id === "rejected-by-server")) {
          throw Object.assign(new Error("HTTP 400"), { status: 400 });
        }
        if (name === "sync_push_library_items") {
          body.p_items.forEach((row) => cloud.set(`${pid}::${row.content_type}::${row.content_id}`, row));
        }
        if (name === "sync_delete_library_items") {
          body.p_keys.forEach((key) => cloud.delete(`${pid}::${key.content_type}::${key.content_id}`));
        }
        return null;
      }
    }
  };
  api.rpc = dependencies.SupabaseApi;
  globalThis.__libraryFixture__ = dependencies;
  const result = await build({
    stdin: {
      contents: [
        'export { savedLibraryRepository } from "./savedLibraryRepository.js";',
        'export { SavedLibrarySyncService } from "../../core/profile/savedLibrarySyncService.js";',
        'export { SavedLibraryOutbox } from "../local/savedLibraryOutbox.js";',
        'export { clearAccountLocalData, resetAccountRuntimeState } from "../../core/auth/accountLocalDataReset.js";'
      ].join("\n"),
      resolveDir: dirname(fileURLToPath(import.meta.url)),
      sourcefile: "library-sync-fixture.mjs"
    },
    bundle: true, format: "esm", platform: "node", write: false,
    plugins: [{ name: "library-sync-boundaries", setup(buildApi) {
      for (const name of Object.keys(dependencies)) {
        buildApi.onResolve({ filter: new RegExp(`/${name}\\.js$`, "i") }, () => ({ path: name, namespace: "fixture" }));
      }
      buildApi.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
        contents: `export const ${path} = globalThis.__libraryFixture__.${path};`
      }));
    } }]
  });
  const loaded = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}#${revision++}`);

  const originals = { localStorage: globalThis.localStorage, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, warn: console.warn };
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  const timers = new Map();
  let nextTimer = 0;
  globalThis.setTimeout = (callback) => { timers.set(++nextTimer, callback); return nextTimer; };
  globalThis.clearTimeout = (id) => timers.delete(id);
  console.warn = () => {};
  t.after(() => {
    globalThis.localStorage = originals.localStorage;
    globalThis.setTimeout = originals.setTimeout;
    globalThis.clearTimeout = originals.clearTimeout;
    console.warn = originals.warn;
    delete globalThis.__libraryFixture__;
  });

  return {
    ...loaded,
    repository: loaded.savedLibraryRepository,
    service: loaded.SavedLibrarySyncService,
    outbox: loaded.SavedLibraryOutbox,
    api, calls, cloud, storage, timers,
    cloudIds: (profileId = 1) => [...cloud.keys()].filter((key) => key.startsWith(`${profileId}::`)).map((key) => key.split("::")[2]).sort(),
    localIds: async () => (await loaded.savedLibraryRepository.getAll(5000)).map((item) => item.contentId).sort(),
    async runTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
      for (let index = 0; index < 5; index += 1) await turn();
    },
    async signOut() {
      generation += 1;
      authenticated = false;
      loaded.clearAccountLocalData(storage, null);
      await loaded.resetAccountRuntimeState();
    }
  };
}

const movie = (id, extra = {}) => ({ contentId: id, contentType: "movie", title: `Synthetic ${id}`, ...extra });

test("a save syncs after the debounce and leaves the outbox empty", async (t) => {
  const f = await fixture(t);
  await f.repository.save(movie("a"));
  assert.equal(f.repository.hasPendingChanges(), true);
  assert.equal(f.calls.length, 0);
  await f.runTimers();
  assert.deepEqual(f.cloudIds(), ["a"]);
  assert.equal(f.repository.hasPendingChanges(), false);
});

test("an offline save is kept and syncs once the browser is back online", async (t) => {
  const f = await fixture(t);
  f.api.offline = true;
  await f.repository.save(movie("offline"));
  await f.runTimers();
  assert.deepEqual(f.cloudIds(), []);
  assert.equal(f.repository.hasPendingChanges(), true);
  f.api.offline = false;
  assert.equal(await f.repository.flushAll(), true);
  assert.deepEqual(f.cloudIds(), ["offline"]);
  assert.equal(f.repository.hasPendingChanges(), false);
});

test("a failed push is retried on the next pull and cloud items from other devices still appear", async (t) => {
  const f = await fixture(t);
  f.cloud.set("1::series::other-device", { content_id: "other-device", content_type: "series", name: "Other" });
  f.api.offline = true;
  await f.repository.save(movie("local"));
  await f.runTimers();
  assert.deepEqual(await f.service.pull(1), []);
  // A server error on the push does not block the pull.
  let failPushOnce = true;
  f.api.offline = false;
  const realRpc = f.api.rpc.rpc;
  f.api.rpc.rpc = async (name, body) => {
    if (name === "sync_push_library_items" && failPushOnce) { failPushOnce = false; throw new Error("HTTP 503"); }
    return realRpc(name, body);
  };
  await f.service.pull(1);
  assert.deepEqual(await f.localIds(), ["local", "other-device"]);
  assert.deepEqual(f.cloudIds(), ["other-device"]);
  assert.equal(f.repository.hasPendingChanges(), true);
  await f.service.pull(1);
  assert.deepEqual(f.cloudIds(), ["local", "other-device"]);
  assert.deepEqual(await f.localIds(), ["local", "other-device"]);
  assert.equal(f.repository.hasPendingChanges(), false);
});

test("a pull applies cloud removals and keeps a pending removal removed", async (t) => {
  const f = await fixture(t);
  f.cloud.set("1::movie::keep", { content_id: "keep", content_type: "movie" });
  f.cloud.set("1::movie::removed-here", { content_id: "removed-here", content_type: "movie" });
  await f.service.pull(1);
  assert.deepEqual(await f.localIds(), ["keep", "removed-here"]);
  f.api.offline = true;
  await f.repository.remove("removed-here");
  f.cloud.delete("1::movie::keep"); // removed on another device
  f.api.offline = false;
  const originalRpc = f.api.rpc.rpc;
  f.api.rpc.rpc = async (name, body) => {
    if (name === "sync_delete_library_items") throw new Error("HTTP 500");
    return originalRpc(name, body);
  };
  await f.service.pull(1);
  assert.deepEqual(await f.localIds(), []);
  assert.equal(f.repository.hasPendingChanges(), true);
});

test("an item with an unknown content type syncs with its own type", async (t) => {
  const f = await fixture(t);
  await f.repository.save({ contentId: "custom-1", contentType: "anime", title: "Synthetic" });
  await f.repository.save(movie("plain"));
  await f.runTimers();
  const push = f.calls.find((call) => call.name === "sync_push_library_items");
  assert.deepEqual(push.body.p_items.map((row) => row.content_type).sort(), ["anime", "movie"]);
  assert.equal(f.repository.hasPendingChanges(), false);
  await f.repository.remove("custom-1");
  await f.runTimers();
  const remove = f.calls.find((call) => call.name === "sync_delete_library_items");
  assert.deepEqual(remove.body, { p_profile_id: 1, p_keys: [{ content_id: "custom-1", content_type: "anime" }] });
});

test("the last change to an item wins and a change made during a push is not lost", async (t) => {
  const f = await fixture(t);
  await f.repository.save(movie("x"));
  await f.repository.remove("x");
  await f.runTimers();
  assert.deepEqual(f.calls.map((call) => call.name), ["sync_delete_library_items"]);

  let release;
  f.api.hold = new Promise((resolve) => { release = resolve; });
  await f.repository.save(movie("y"));
  const flushing = f.repository.flush();
  await turn();
  await f.repository.save(movie("y", { title: "Renamed while sending" }));
  f.api.hold = null;
  release();
  assert.equal(await flushing, true);
  assert.equal(f.repository.hasPendingChanges(), true);
  await f.repository.flush();
  assert.equal(f.cloud.get("1::movie::y").name, "Renamed while sending");
  assert.equal(f.repository.hasPendingChanges(), false);
});

test("upsert keeps the profile and remote field mapping", async (t) => {
  const f = await fixture(t);
  await f.repository.save({ contentId: "mapped", contentType: "movie", title: "Synthetic title", updatedAt: 17, posterShape: "square" }, "3");
  await f.repository.flush("3");
  assert.deepEqual(f.calls, [{ name: "sync_push_library_items", body: {
    p_profile_id: 3,
    p_items: [{ content_id: "mapped", content_type: "movie", name: "Synthetic title", poster: null, poster_shape: "SQUARE", background: null, description: "", release_info: "", imdb_rating: null, genres: [], addon_base_url: null, added_at: 17 }]
  } }]);
});

test("sign-out clears the outbox and stops queued pushes", async (t) => {
  const f = await fixture(t);
  f.api.offline = true;
  await f.repository.save(movie("private"));
  await f.runTimers();
  await f.repository.save(movie("queued"));
  assert.equal(f.timers.size, 1);
  await f.signOut();
  assert.equal(f.timers.size, 0);
  assert.equal(f.storage.getItem("savedLibrarySyncOutbox"), null);
  assert.equal(f.storage.getItem("savedLibraryItems"), null);
  assert.equal(f.repository.hasPendingChanges(), false);
  f.api.offline = false;
  assert.equal(await f.repository.flushAll(), false);
  assert.deepEqual(f.cloudIds(), []);
});

test("guest edits stay local and never reach the outbox", async (t) => {
  const f = await fixture(t);
  await f.signOut();
  await f.repository.toggle(movie("guest"));
  assert.deepEqual(await f.localIds(), ["guest"]);
  assert.equal(f.repository.hasPendingChanges(), false);
  assert.equal(f.timers.size, 0);
});

for (const failing of [true, "savedLibraryItems"]) {
  test(`a storage write failure (${failing === true ? "all keys" : failing}) is reported and nothing reaches the cloud`, async (t) => {
    const f = await fixture(t);
    await f.repository.save(movie("kept"));
    await f.runTimers();
    f.storage.failWrites = failing;
    await assert.rejects(f.repository.save(movie("no-space")), { code: "LIBRARY_STORAGE_UNAVAILABLE" });
    await assert.rejects(f.repository.remove("kept"), { code: "LIBRARY_STORAGE_UNAVAILABLE" });
    f.storage.failWrites = false;
    await f.runTimers();
    assert.equal(f.repository.hasPendingChanges(), false);
    assert.deepEqual(await f.localIds(), ["kept"]);
    assert.deepEqual(f.cloudIds(), ["kept"]);
    assert.deepEqual(f.calls.map((call) => call.name), ["sync_push_library_items"]);
  });
}

test("the device keeps at most 1000 items per profile, dropping the oldest locally", async (t) => {
  const f = await fixture(t);
  const items = Array.from({ length: 1000 }, (_, index) => ({ content_id: `old-${index}`, content_type: "movie", added_at: index + 1 }));
  items.forEach((row) => f.cloud.set(`1::movie::${row.content_id}`, row));
  await f.service.pull(1);
  assert.equal((await f.localIds()).length, 1000);
  await f.repository.save(movie("newest", { updatedAt: 5000 }));
  const ids = await f.localIds();
  assert.equal(ids.length, 1000);
  assert.equal(ids.includes("newest"), true);
  assert.equal(ids.includes("old-0"), false);
});

test("one item the server rejects does not block the other saves", async (t) => {
  const f = await fixture(t);
  await f.repository.save(movie("good-1"));
  await f.repository.save(movie("rejected-by-server"));
  await f.repository.save(movie("good-2"));
  assert.equal(await f.repository.flush(), false);
  assert.deepEqual(f.cloudIds(), ["good-1", "good-2"]);
  assert.deepEqual(f.outbox.list("1").map((op) => op.item.contentId), ["rejected-by-server"]);
});

test("an unreadable outbox refuses edits instead of overwriting queued changes", async (t) => {
  const f = await fixture(t);
  f.api.offline = true;
  await f.repository.save(movie("queued"));
  const saved = f.storage.getItem("savedLibrarySyncOutbox");
  f.storage.setItem("savedLibrarySyncOutbox", "{not json");
  await assert.rejects(f.repository.save(movie("next")), { code: "LIBRARY_STORAGE_UNAVAILABLE" });
  assert.equal(f.storage.getItem("savedLibrarySyncOutbox"), "{not json");
  f.storage.setItem("savedLibrarySyncOutbox", saved);
  assert.deepEqual(f.outbox.list("1").map((op) => op.item.contentId), ["queued"]);
});
