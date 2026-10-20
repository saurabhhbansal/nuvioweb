import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

let revision = 0;
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
  assert.equal(await f.service.push(2), true);
  assert.deepEqual(f.state(), { revision: 1, pending: false });
});

test("old successful push cannot acknowledge a newer local edit", async (t) => {
  const f = await fixture(t);
  f.markPending();
  let release;
  f.dependencies.SupabaseApi.rpc = () => new Promise((resolve) => { release = resolve; });
  const pending = f.service.push(2);
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
  assert.equal(await f.service.push(2), true);
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
  assert.equal(await f.service.push(2), false);
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

test("empty explicit Library snapshot reaches the existing API to remove the final remote item", async (t) => {
  const f = await fixture(t);
  assert.equal(await f.service.push(), true);
  assert.deepEqual(f.calls, [["sync_push_library", { p_profile_id: 2, p_items: [] }, true, { expectedSessionGeneration: 1 }]]);
});

test("nonempty snapshot keeps profile and remote field mapping", async (t) => {
  const f = await fixture(t);
  f.dependencies.savedLibraryRepository.getAll = async () => [{ contentId: "synthetic-item", title: "Synthetic title", updatedAt: 17, posterShape: "square" }];
  assert.equal(await f.service.push(3), true);
  assert.deepEqual(f.calls, [["sync_push_library", {
    p_profile_id: 3,
    p_items: [{ content_id: "synthetic-item", content_type: "movie", name: "Synthetic title", poster: null, poster_shape: "SQUARE", background: null, description: "", release_info: "", imdb_rating: null, genres: [], addon_base_url: null, added_at: 17 }]
  }, true, { expectedSessionGeneration: 1 }]]);
});

for (const action of ["switchAccount", "signOut"]) {
  test(`snapshot preparation crossing ${action} never dispatches a Library write`, async (t) => {
    const f = await fixture(t);
    let release;
    f.dependencies.savedLibraryRepository.getAll = () => new Promise((resolve) => { release = resolve; });
    const pending = f.service.push(1);
    f[action]();
    release([{ contentId: "old-account-item" }]);
    assert.equal(await pending, false);
    assert.deepEqual(f.calls, []);
  });
}

test("rejected snapshot returns failure without claiming synchronization", async (t) => {
  const f = await fixture(t);
  f.dependencies.savedLibraryRepository.getAll = async () => [{ contentId: "synthetic-item" }];
  f.dependencies.SupabaseApi.rpc = async () => { throw new Error("synthetic rejection"); };
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    assert.equal(await f.service.push(1), false);
    assert.deepEqual(warnings, ["Saved library sync push failed"]);
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

test("real transport never publishes an old snapshot after account switch during token refresh", async (t) => {
  const f = await transportFixture(t);
  let release;
  f.dependencies.AuthManager.isAccessTokenExpired = () => true;
  f.dependencies.AuthManager.refreshSessionIfNeeded = () => new Promise((resolve) => { release = resolve; });
  const pending = f.service.push(1);
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
  const pending = f.service.push(1);
  await turn();
  f.switchAccount();
  release(new Response('{"error":"synthetic expired A"}', { status: 401 }));
  assert.equal(await pending, false);
  assert.equal(f.calls.length, 1);
  assert.equal(refreshes, 0);
});

test("same-session transport refresh still sends the empty snapshot with rotated token", async (t) => {
  const f = await transportFixture(t);
  f.dependencies.AuthManager.isAccessTokenExpired = () => true;
  f.dependencies.AuthManager.refreshSessionIfNeeded = async () => { f.session.accessToken = "fixture-A-rotated"; return true; };
  assert.equal(await f.service.push(1), true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].options.headers.Authorization, "Bearer fixture-A-rotated");
  assert.equal(f.calls[0].options.expectedSessionGeneration, undefined);
  assert.deepEqual(JSON.parse(f.calls[0].options.body), { p_profile_id: 1, p_items: [] });
});

test("account change during401 refresh prevents the retry", async (t) => {
  const f = await transportFixture(t);
  let release;
  globalThis.fetch = async (url, options) => { f.calls.push({ url, options }); return new Response("expired", { status: 401 }); };
  f.dependencies.AuthManager.refreshSessionIfNeeded = () => new Promise((resolve) => { release = resolve; });
  const pending = f.service.push(1);
  await turn();
  f.switchAccount();
  release(true);
  assert.equal(await pending, false);
  assert.equal(f.calls.length, 1);
});

test("same-session401 refresh retries the unchanged snapshot with rotated credentials", async (t) => {
  const f = await transportFixture(t);
  globalThis.fetch = async (url, options) => {
    f.calls.push({ url, options });
    return new Response(f.calls.length === 1 ? "expired" : "null", { status: f.calls.length === 1 ? 401 : 200 });
  };
  f.dependencies.AuthManager.refreshSessionIfNeeded = async () => { f.session.accessToken = "fixture-A-rotated"; return true; };
  assert.equal(await f.service.push(1), true);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].options.headers.Authorization, "Bearer fixture-A-access");
  assert.equal(f.calls[1].options.headers.Authorization, "Bearer fixture-A-rotated");
  assert.equal(f.calls[0].options.body, f.calls[1].options.body);
});

test("a local snapshot over 1000 items is refused without issuing a write", async (t) => {
  const f = await fixture(t);
  f.markPending();
  let requestedLimit = null;
  f.dependencies.savedLibraryRepository.getAll = async (limit) => {
    requestedLimit = limit;
    return Array.from({ length: 1001 }, (_, index) => ({ contentId: `item-${index}` }));
  };
  let writes = 0;
  f.dependencies.SupabaseApi.rpc = async () => { writes += 1; return null; };
  assert.equal(await f.service.push(2), false);
  assert.equal(requestedLimit, 1001);
  assert.equal(writes, 0);
  assert.deepEqual(f.state(), { revision: 1, pending: true });
  assert.deepEqual(f.warnings, ["Saved library sync push refused: local snapshot exceeds 1000 items"]);
});

test("two independent full-snapshot writers lose the earlier edit (unsupported characterization)", async (t) => {
  const first = await fixture(t);
  const second = await fixture(t);
  first.seedLocal([{ contentId: "writer-a" }]);
  second.seedLocal([{ contentId: "writer-b" }]);
  first.markPending();
  second.markPending();
  let remote = [{ content_id: "baseline" }];
  first.dependencies.SupabaseApi.rpc = async (...args) => {
    if (args[0] === "sync_push_library") remote = args[1].p_items;
    return null;
  };
  second.dependencies.SupabaseApi.rpc = async (...args) => {
    if (args[0] === "sync_push_library") remote = args[1].p_items;
    return null;
  };
  assert.equal(await first.service.push(2), true);
  assert.equal(first.state().pending, false);
  assert.equal(await second.service.push(2), true);
  assert.equal(second.state().pending, false);
  assert.deepEqual(remote.map((item) => item.content_id), ["writer-b"]);
  assert.equal(remote.some((item) => item.content_id === "writer-a"), false);
});

test("exactly 1000 items still sends the full snapshot", async (t) => {
  const f = await fixture(t);
  f.markPending();
  f.dependencies.savedLibraryRepository.getAll = async () =>
    Array.from({ length: 1000 }, (_, index) => ({ contentId: `item-${index}` }));
  let writes = 0;
  f.dependencies.SupabaseApi.rpc = async () => { writes += 1; return null; };
  assert.equal(await f.service.push(2), true);
  assert.equal(writes, 1);
  assert.deepEqual(f.state(), { revision: 1, pending: false });
});
