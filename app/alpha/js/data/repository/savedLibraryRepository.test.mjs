import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

let revision = 0;
const turn = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

async function fixture(t, { guest = false } = {}) {
  let generation = 1;
  let authenticated = !guest;
  const calls = [];
  const values = new Map();
  const dependencies = {
    AuthManager: {
      get isAuthenticated() { return authenticated; },
      getSessionGeneration: () => generation,
      isSessionCurrent: (expected) => authenticated && expected === generation
    },
    ProfileManager: { getActiveProfileId: () => "1" },
    LocalStore: { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => values.set(key, value) },
    SavedLibrarySyncService: { push: async (profileId) => { calls.push({ profileId, generation }); return true; } }
  };
  globalThis.__savedLibraryRepoDeps__ = dependencies;
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./savedLibraryRepository.js", import.meta.url))],
    bundle: true, format: "esm", platform: "node", write: false,
    plugins: [{ name: "saved-library-repository-boundaries", setup(buildApi) {
      for (const name of Object.keys(dependencies)) {
        buildApi.onResolve({ filter: new RegExp(`${name}\\.js$`, "i") }, () => ({ path: name, namespace: "fixture" }));
      }
      buildApi.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
        contents: `export const ${path} = globalThis.__savedLibraryRepoDeps__.${path};`
      }));
    } }]
  });
  const repository = (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}#${revision++}`)).savedLibraryRepository;
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const timers = new Map();
  let nextId = 0;
  globalThis.setTimeout = (callback) => { timers.set(++nextId, callback); return nextId; };
  globalThis.clearTimeout = (id) => timers.delete(id);
  t.after(() => {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    delete globalThis.__savedLibraryRepoDeps__;
  });
  return {
    repository, dependencies, calls, timers,
    switchAccount: () => { generation++; authenticated = true; values.clear(); },
    signOut: () => { generation++; authenticated = false; values.clear(); },
    flush: async () => { await turn(); await turn(); },
    runTimers: async () => {
      const callbacks = [...timers.values()]; timers.clear();
      for (const callback of callbacks) callback();
      await turn(); await turn();
    }
  };
}

test("save then final remove retains local semantics and debounces one snapshot push", async (t) => {
  const f = await fixture(t);
  await f.repository.save({ contentId: "synthetic" });
  await f.repository.remove("synthetic");
  assert.deepEqual(await f.repository.getAll(), []);
  assert.equal(f.timers.size, 1);
  await f.runTimers();
  assert.deepEqual(f.calls, [{ profileId: "1", generation: 1 }]);
});

for (const action of ["switchAccount", "signOut"]) {
  test(`queued mutation is discarded after ${action}`, async (t) => {
    const f = await fixture(t);
    await f.repository.save({ contentId: "old-account" });
    f[action]();
    await f.runTimers();
    assert.deepEqual(f.calls, []);
  });
}

test("guest local save never becomes an authenticated cloud write after login", async (t) => {
  const f = await fixture(t, { guest: true });
  await f.repository.save({ contentId: "guest-only" });
  f.switchAccount();
  await f.runTimers();
  assert.deepEqual(f.calls, []);
});

test("toggle keeps same-session local membership and queues current profile", async (t) => {
  const f = await fixture(t);
  assert.equal(await f.repository.toggle({ contentId: "synthetic" }, "2"), true);
  assert.equal(await f.repository.toggle({ contentId: "synthetic" }, "2"), false);
  await f.runTimers();
  assert.deepEqual(await f.repository.getAll(200, "2"), []);
  assert.deepEqual(f.calls, [{ profileId: "2", generation: 1 }]);
});

test("new account same-profile queue runs without waiting for old account push", async (t) => {
  const f = await fixture(t);
  const old = deferred();
  f.dependencies.SavedLibrarySyncService.push = async (profileId) => {
    f.calls.push(profileId);
    return f.calls.length === 1 ? old.promise : true;
  };
  await f.repository.save({ contentId: "old" });
  await f.runTimers();
  f.switchAccount();
  await f.repository.save({ contentId: "new" });
  try {
    await f.runTimers();
    assert.deepEqual(f.calls, ["1", "1"]);
  } finally {
    old.resolve(true);
    await f.flush();
  }
});

test("obsolete queued continuation cannot adopt new account after waiting on an old push", async (t) => {
  const f = await fixture(t);
  const old = deferred();
  f.dependencies.SavedLibrarySyncService.push = async () => { f.calls.push("push"); return old.promise; };
  await f.repository.save({ contentId: "old-first" });
  await f.runTimers();
  await f.repository.save({ contentId: "old-second" });
  await f.runTimers();
  f.switchAccount();
  old.resolve(true);
  await f.flush();
  assert.deepEqual(f.calls, ["push"]);
});

test("three same-session mutations serialize behind each queued push", async (t) => {
  const f = await fixture(t);
  const pending = [deferred(), deferred(), deferred()];
  f.dependencies.SavedLibrarySyncService.push = async () => {
    const index = f.calls.length;
    f.calls.push(index);
    return pending[index].promise;
  };
  try {
    for (const contentId of ["one", "two", "three"]) {
      await f.repository.save({ contentId });
      await f.runTimers();
    }
    assert.deepEqual(f.calls, [0]);
    pending[0].resolve(true);
    await f.flush();
    assert.deepEqual(f.calls, [0, 1]);
    pending[1].resolve(true);
    await f.flush();
    assert.deepEqual(f.calls, [0, 1, 2]);
  } finally {
    for (const task of pending) task.resolve(true);
    await f.flush();
  }
});

test("old account completion cannot detach the new account's pending push", async (t) => {
  const f = await fixture(t);
  const old = deferred();
  const current = deferred();
  f.dependencies.SavedLibrarySyncService.push = async () => {
    f.calls.push("push");
    return f.calls.length === 1 ? old.promise : current.promise;
  };
  try {
    await f.repository.save({ contentId: "old" });
    await f.runTimers();
    f.switchAccount();
    await f.repository.save({ contentId: "new" });
    await f.runTimers();
    old.resolve(true);
    await f.flush();
    await f.repository.save({ contentId: "newer" });
    await f.runTimers();
    assert.deepEqual(f.calls, ["push", "push"]);
    current.resolve(true);
    await f.flush();
    assert.deepEqual(f.calls, ["push", "push", "push"]);
  } finally {
    old.resolve(true);
    current.resolve(true);
    await f.flush();
  }
});
