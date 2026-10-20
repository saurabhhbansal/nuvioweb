import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

let revision = 0;
const saveChange = (id = "synthetic-item") => [{ kind: "save", item: { contentId: id, contentType: "movie" } }];
const deleteChange = (id = "synthetic-item") => [{ kind: "remove", item: { contentId: id, contentType: "movie" } }];
async function fixture(t) {
  let generation = 1;
  let authenticated = true;
  const calls = [];
  let local = [];
  let syncState = { revision: 0, pending: false };
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  const dependencies = {
    AuthManager: {
      get isAuthenticated() { return authenticated; },
      getSessionGeneration: () => generation,
      isSessionCurrent: (expected) => authenticated && expected === generation
    },
    ProfileManager: { getActiveProfileId: () => "2" },
    savedLibraryRepository: {
      getAll: async () => [...local],
      replaceAll: async (items) => { local = items; },
      getSyncState: () => ({ ...syncState }),
      acknowledgeSync: (_profileId, revision) => { if (syncState.revision === revision) syncState.pending = false; }
    },
    SupabaseApi: { rpc: async (...args) => { calls.push(args); return null; } }
  };
  globalThis.__savedLibrarySyncDeps__ = dependencies;
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./savedLibrarySyncService.js", import.meta.url))],
    bundle: true, format: "esm", platform: "node", write: false,
    plugins: [{ name: "saved-library-boundaries", setup(buildApi) {
      for (const name of Object.keys(dependencies)) {
        buildApi.onResolve({ filter: new RegExp(`${name}\\.js$`, "i") }, () => ({ path: name, namespace: "fixture" }));
      }
      buildApi.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
        contents: `export const ${path} = globalThis.__savedLibrarySyncDeps__.${path};`
      }));
    } }]
  });
  const service = (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}#${revision++}`)).SavedLibrarySyncService;
  t.after(() => { console.warn = originalWarn; delete globalThis.__savedLibrarySyncDeps__; });
  return { service, dependencies, calls, warnings,
    seedLocal: (items) => { local = items; },
    local: () => local,
    markPending: () => { syncState = { revision: syncState.revision + 1, pending: true }; },
    state: () => ({ ...syncState }),
    switchAccount: () => { generation++; }, signOut: () => { generation++; authenticated = false; }
  };
}

test("successful empty remote Library removes clean cached items", async (t) => {
  const f = await fixture(t);
  f.seedLocal([{ contentId: "deleted-remotely" }]);
  f.dependencies.SupabaseApi.rpc = async () => [];
  assert.deepEqual(await f.service.pull(2), []);
  assert.deepEqual(f.local(), []);
});

test("nonempty remote Library replaces clean cache", async (t) => {
  const f = await fixture(t);
  f.seedLocal([{ contentId: "old-cache" }]);
  f.dependencies.SupabaseApi.rpc = async () => [{ content_id: "remote-current", name: "Synthetic" }];
  await f.service.pull(2);
  assert.deepEqual(f.local().map((item) => item.contentId), ["remote-current"]);
});

for (const remote of [[], [{ content_id: "remote-current" }]]) {
  test(`pending local edit survives ${remote.length ? "nonempty" : "empty"} cloud snapshot`, async (t) => {
    const f = await fixture(t);
    f.seedLocal([{ contentId: "pending-local" }]);
    f.markPending();
    f.dependencies.SupabaseApi.rpc = async () => remote;
    assert.deepEqual((await f.service.pull(2)).map((item) => item.contentId), ["pending-local"]);
    assert.deepEqual(f.local().map((item) => item.contentId), ["pending-local"]);
    assert.equal(f.state().pending, true);
  });
}

test("local edit made while cloud pull waits cannot be overwritten or returned as an older snapshot", async (t) => {
  const f = await fixture(t);
  f.seedLocal([{ contentId: "old-cache" }]);
  let release;
  f.dependencies.SupabaseApi.rpc = () => new Promise((resolve) => { release = resolve; });
  const pending = f.service.pull(2);
  await turn();
  f.markPending();
  f.seedLocal([{ contentId: "new-local" }]);
  release([{ content_id: "remote-old" }]);
  assert.deepEqual((await pending).map((item) => item.contentId), ["new-local"]);
  assert.deepEqual(f.local().map((item) => item.contentId), ["new-local"]);
});

for (const malformed of [null, {}, [{ name: "missing content identity" }]]) {
  test(`malformed cloud snapshot ${JSON.stringify(malformed)} is not a deletion`, async (t) => {
    const f = await fixture(t);
    f.seedLocal([{ contentId: "keep-cache" }]);
    f.dependencies.SupabaseApi.rpc = async () => malformed;
    let replacements = 0;
    f.dependencies.savedLibraryRepository.replaceAll = async () => { replacements++; };
    await f.service.pull(2);
    assert.equal(replacements, 0);
    assert.deepEqual(f.local().map((item) => item.contentId), ["keep-cache"]);
    assert.deepEqual(f.warnings, ["Saved library sync pull failed"]);
  });
}

test("successful push acknowledges its current pending revision", async (t) => {
  const f = await fixture(t);
  f.markPending();
  assert.equal(await f.service.push(2, saveChange(), { revision: f.state().revision, acknowledge: true }), true);
  assert.deepEqual(f.state(), { revision: 1, pending: false });
});

test("old successful push cannot acknowledge a newer local edit", async (t) => {
  const f = await fixture(t);
  f.markPending();
  let release;
  f.dependencies.SupabaseApi.rpc = () => new Promise((resolve) => { release = resolve; });
  const pending = f.service.push(2, saveChange(), { revision: f.state().revision, acknowledge: true });
  await turn();
  f.markPending();
  release(null);
  assert.equal(await pending, true);
  assert.deepEqual(f.state(), { revision: 2, pending: true });
});

test("pull started with pending edits cannot publish an older snapshot after those edits are acknowledged", async (t) => {
  const f = await fixture(t);
  f.seedLocal([{ contentId: "local-edit" }]);
  f.markPending();
  let release;
  f.dependencies.SupabaseApi.rpc = (name) => name === "sync_pull_library"
    ? new Promise((resolve) => { release = resolve; }) : Promise.resolve(null);
  const pulling = f.service.pull(2);
  await turn();
  assert.equal(await f.service.push(2, saveChange(), { revision: f.state().revision, acknowledge: true }), true);
  assert.equal(f.state().pending, false);
  release([{ content_id: "cloud-before-push" }]);
  assert.deepEqual((await pulling).map((item) => item.contentId), ["local-edit"]);
  assert.deepEqual(f.local().map((item) => item.contentId), ["local-edit"]);
});

test("failed reads and writes preserve local cache and pending revision", async (t) => {
  const f = await fixture(t);
  f.seedLocal([{ contentId: "offline-local" }]);
  f.markPending();
  f.dependencies.SupabaseApi.rpc = async () => { throw new Error("synthetic offline"); };
  assert.deepEqual(await f.service.pull(2), []);
  assert.equal(await f.service.push(2, saveChange(), { revision: f.state().revision, acknowledge: true }), false);
  assert.deepEqual(f.local().map((item) => item.contentId), ["offline-local"]);
  assert.deepEqual(f.state(), { revision: 1, pending: true });
});

test("old account pull cannot publish into a later session", async (t) => {
  const f = await fixture(t);
  let release;
  f.dependencies.SupabaseApi.rpc = () => new Promise((resolve) => { release = resolve; });
  const pending = f.service.pull(2);
  await turn();
  f.switchAccount();
  f.seedLocal([{ contentId: "new-account-cache" }]);
  release([{ content_id: "old-account-remote" }]);
  assert.deepEqual(await pending, []);
  assert.deepEqual(f.local().map((item) => item.contentId), ["new-account-cache"]);
});

test("explicit final-item deletion sends only its exact identity", async (t) => {
  const f = await fixture(t);
  assert.equal(await f.service.push(2, deleteChange()), true);
  assert.deepEqual(f.calls, [["sync_delete_library_items", { p_profile_id: 2, p_keys: [{ content_id: "synthetic-item", content_type: "movie" }] }, true, { expectedSessionGeneration: 1 }]]);
});

test("explicit upsert keeps profile and remote field mapping", async (t) => {
  const f = await fixture(t);
  assert.equal(await f.service.push(3, [{ kind: "save", item: { contentId: "synthetic-item", contentType: "movie", title: "Synthetic title", updatedAt: 17, posterShape: "square" } }]), true);
  assert.deepEqual(f.calls, [["sync_push_library_items", {
    p_profile_id: 3,
    p_items: [{ content_id: "synthetic-item", content_type: "movie", name: "Synthetic title", poster: null, poster_shape: "SQUARE", background: null, description: "", release_info: "", imdb_rating: null, genres: [], addon_base_url: null, added_at: 17 }]
  }, true, { expectedSessionGeneration: 1 }]]);
});

for (const action of ["switchAccount", "signOut"]) {
  test(`account change between explicit operations stops remaining writes: ${action}`, async (t) => {
    const f = await fixture(t);
    let release;
    f.dependencies.SupabaseApi.rpc = (...args) => { f.calls.push(args); return new Promise(resolve => { release = resolve; }); };
    const pending = f.service.push(1, [...saveChange("first"), ...saveChange("second")]);
    await turn();
    f[action]();
    release(null);
    assert.equal(await pending, false);
    assert.equal(f.calls.length, 1);
  });
}

test("rejected explicit delete returns failure without claiming synchronization", async (t) => {
  const f = await fixture(t);
  f.dependencies.savedLibraryRepository.getAll = async () => [{ contentId: "synthetic-item" }];
  f.dependencies.SupabaseApi.rpc = async () => { throw new Error("synthetic rejection"); };
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    assert.equal(await f.service.push(1, deleteChange()), false);
    assert.deepEqual(warnings, ["Saved library explicit sync failed"]);
  } finally { console.warn = originalWarn; }
});

async function transportFixture(t) {
  let generation = 1;
  const calls = [];
  const session = { accessToken: "fixture-A-access", refreshToken: "fixture-A-refresh" };
  const dependencies = {
    AuthManager: {
      isAuthenticated: true,
      getSessionGeneration: () => generation,
      isSessionCurrent: (expected) => expected === generation,
      isAccessTokenExpired: () => false,
      refreshSessionIfNeeded: async () => true
    },
    SessionStore: session,
    ProfileManager: { getActiveProfileId: () => "1" },
    savedLibraryRepository: { getAll: async () => [], getSyncState: () => ({ revision: 0, pending: false }), acknowledgeSync: () => {} }
  };
  globalThis.__savedLibraryTransportDeps__ = dependencies;
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./savedLibrarySyncService.js", import.meta.url))],
    bundle: true, format: "esm", platform: "node", write: false,
    plugins: [{ name: "real-library-transport", setup(buildApi) {
      for (const name of Object.keys(dependencies)) {
        buildApi.onResolve({ filter: new RegExp(`${name}\\.js$`, "i") }, () => ({ path: name, namespace: "fixture" }));
      }
      buildApi.onResolve({ filter: /config\.js$/ }, () => ({ path: "config", namespace: "fixture" }));
      buildApi.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "config"
        ? 'export const SUPABASE_URL = "https://identity.example.invalid"; export const SUPABASE_ANON_KEY = "fixture-public-key";'
        : `export const ${path} = globalThis.__savedLibraryTransportDeps__.${path};`
      }));
    } }]
  });
  const service = (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}#${revision++}`)).SavedLibrarySyncService;
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  console.warn = () => {};
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response("null", { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    delete globalThis.__savedLibraryTransportDeps__;
  });
  return { service, calls, dependencies, session, switchAccount: () => { generation++; session.accessToken = "fixture-B-access"; session.refreshToken = "fixture-B-refresh"; } };
}

const turn = () => new Promise((resolve) => setImmediate(resolve));

test("real transport never sends an old explicit delete after account switch during token refresh", async (t) => {
  const f = await transportFixture(t);
  let release;
  f.dependencies.AuthManager.isAccessTokenExpired = () => true;
  f.dependencies.AuthManager.refreshSessionIfNeeded = () => new Promise((resolve) => { release = resolve; });
  const pending = f.service.push(1, deleteChange());
  await turn();
  f.switchAccount();
  release(true);
  assert.equal(await pending, false);
  assert.deepEqual(f.calls, []);
});

test("old401 cannot refresh or retry a Library write using the later account", async (t) => {
  const f = await transportFixture(t);
  let release;
  let refreshes = 0;
  f.dependencies.AuthManager.refreshSessionIfNeeded = async () => { refreshes++; return true; };
  globalThis.fetch = async (url, options) => {
    f.calls.push({ url, options });
    return f.calls.length === 1 ? new Promise((resolve) => { release = resolve; }) : new Response("null");
  };
  const pending = f.service.push(1, deleteChange());
  await turn();
  f.switchAccount();
  release(new Response('{"error":"synthetic expired A"}', { status: 401 }));
  assert.equal(await pending, false);
  assert.equal(f.calls.length, 1);
  assert.equal(refreshes, 0);
});

test("same-session transport refresh sends the exact delete with rotated token", async (t) => {
  const f = await transportFixture(t);
  f.dependencies.AuthManager.isAccessTokenExpired = () => true;
  f.dependencies.AuthManager.refreshSessionIfNeeded = async () => { f.session.accessToken = "fixture-A-rotated"; return true; };
  assert.equal(await f.service.push(1, deleteChange()), true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].options.headers.Authorization, "Bearer fixture-A-rotated");
  assert.equal(f.calls[0].options.expectedSessionGeneration, undefined);
  assert.deepEqual(JSON.parse(f.calls[0].options.body), { p_profile_id: 1, p_keys: [{ content_id: "synthetic-item", content_type: "movie" }] });
});

test("account change during401 refresh prevents the retry", async (t) => {
  const f = await transportFixture(t);
  let release;
  globalThis.fetch = async (url, options) => { f.calls.push({ url, options }); return new Response("expired", { status: 401 }); };
  f.dependencies.AuthManager.refreshSessionIfNeeded = () => new Promise((resolve) => { release = resolve; });
  const pending = f.service.push(1, deleteChange());
  await turn();
  f.switchAccount();
  release(true);
  assert.equal(await pending, false);
  assert.equal(f.calls.length, 1);
});

test("same-session401 refresh retries the unchanged exact delete with rotated credentials", async (t) => {
  const f = await transportFixture(t);
  globalThis.fetch = async (url, options) => {
    f.calls.push({ url, options });
    return new Response(f.calls.length === 1 ? "expired" : "null", { status: f.calls.length === 1 ? 401 : 200 });
  };
  f.dependencies.AuthManager.refreshSessionIfNeeded = async () => { f.session.accessToken = "fixture-A-rotated"; return true; };
  assert.equal(await f.service.push(1, deleteChange()), true);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].options.headers.Authorization, "Bearer fixture-A-access");
  assert.equal(f.calls[1].options.headers.Authorization, "Bearer fixture-A-rotated");
  assert.equal(f.calls[0].options.body, f.calls[1].options.body);
});

test("unknown legacy snapshots are refused with no remote operation", async (t) => {
  const f = await fixture(t);
  f.markPending();
  f.seedLocal(Array.from({ length: 1001 }, (_, index) => ({ contentId: `item-${index}` })));
  assert.equal(await f.service.push(2), false);
  assert.equal(f.calls.length, 0);
  assert.equal(f.state().pending, true);
  assert.equal(await f.service.push(2, saveChange("new-explicit-item")), true);
  assert.equal(f.calls[0][0], "sync_push_library_items");
  assert.equal(f.calls[0][1].p_items.length, 1);
  assert.equal(f.state().pending, true);
});

for (const changes of [[], [{ kind: "remove", item: { contentId: "id" } }], [{ kind: "replace", item: { contentId: "id", contentType: "movie" } }]]) {
  test(`invalid explicit change is refused: ${JSON.stringify(changes)}`, async (t) => {
    const f = await fixture(t);
    assert.equal(await f.service.push(2, changes), false);
    assert.equal(f.calls.length, 0);
  });
}

test("two stale clients writing distinct explicit keys preserve both edits and baseline", async (t) => {
  const first = await fixture(t);
  const second = await fixture(t);
  let remote = [{ content_id: "baseline", content_type: "movie" }];
  const rpc = async (name, body) => {
    if (name === "sync_push_library_items") {
      for (const row of body.p_items) remote = remote.filter(item => item.content_id !== row.content_id).concat(row);
    } else if (name === "sync_delete_library_items") {
      remote = remote.filter(item => !body.p_keys.some(key => key.content_id === item.content_id && key.content_type === item.content_type));
    } else if (name === "sync_push_library") remote = body.p_items;
    else throw new Error("Unexpected RPC");
  };
  first.dependencies.SupabaseApi.rpc = rpc;
  second.dependencies.SupabaseApi.rpc = rpc;
  first.seedLocal([{ contentId: "writer-a" }]);
  second.seedLocal([{ contentId: "writer-b" }]);
  assert.equal(await first.service.push(2, [{ kind: "save", item: { contentId: "writer-a", contentType: "movie" } }]), true);
  assert.equal(await second.service.push(2, [{ kind: "save", item: { contentId: "writer-b", contentType: "movie" } }]), true);
  assert.deepEqual(remote.map(row => row.content_id).sort(), ["baseline", "writer-a", "writer-b"]);
  assert.equal(await first.service.push(2, [{ kind: "remove", item: { contentId: "writer-a", contentType: "movie" } }]), true);
  assert.deepEqual(remote.map(row => row.content_id).sort(), ["baseline", "writer-b"]);
});

test("request snapshots cannot be mutated while a preceding operation waits", async (t) => {
  const f = await fixture(t);
  let release;
  const changes = [...saveChange("first"), ...saveChange("second")];
  f.dependencies.SupabaseApi.rpc = (...args) => {
    f.calls.push(args);
    return f.calls.length === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve(null);
  };
  const pending = f.service.push(2, changes);
  changes[1].item.contentId = "changed-later";
  changes[1].item.genres = ["changed-later"];
  release(null);
  assert.equal(await pending, true);
  assert.equal(f.calls[1][1].p_items[0].content_id, "second");
  assert.deepEqual(f.calls[1][1].p_items[0].genres, []);
});

test("missing per-item provider capability fails closed without legacy fallback", async (t) => {
  const f = await fixture(t);
  f.markPending();
  f.dependencies.SupabaseApi.rpc = (...args) => { f.calls.push(args); throw new Error("not found"); };
  assert.equal(await f.service.push(2, saveChange(), { revision: 1, acknowledge: true }), false);
  assert.equal(f.state().pending, true);
  assert.deepEqual(f.calls.map(call => call[0]), ["sync_push_library_items"]);
});
