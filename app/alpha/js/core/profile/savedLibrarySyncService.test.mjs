import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

let revision = 0;
async function fixture(t) {
  let generation = 1;
  let authenticated = true;
  const calls = [];
  const dependencies = {
    AuthManager: {
      get isAuthenticated() { return authenticated; },
      getSessionGeneration: () => generation,
      isSessionCurrent: (expected) => authenticated && expected === generation
    },
    ProfileManager: { getActiveProfileId: () => "2" },
    savedLibraryRepository: { getAll: async () => [], replaceAll: async () => {} },
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
  t.after(() => { delete globalThis.__savedLibrarySyncDeps__; });
  return { service, dependencies, calls, switchAccount: () => { generation++; }, signOut: () => { generation++; authenticated = false; } };
}

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
    savedLibraryRepository: { getAll: async () => [] }
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
