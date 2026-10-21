import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Transport cases: Library writes go through the real HTTP client, which must
// never retry an old account's write with a later account's token.
let revision = 0;
const deleteChange = (id = "synthetic-item") => [{ id: "op-1", kind: "remove", item: { contentId: id, contentType: "movie" } }];

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
    savedLibraryRepository: {}
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
