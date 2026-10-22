import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const REPO = "https://plugins.example.invalid/repo/manifest.json";
const TEMPLATE = "https://streams.example.invalid/play/{tmdbId}/{season}/{episode}.m3u8";

function mock(name) {
  return `export const ${name} = new Proxy({}, { get: (_, key) => globalThis.__pluginSyncDeps__.${name}?.[key] });`;
}

async function loadService() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./pluginSyncService.js", import.meta.url))],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    plugins: [{
      name: "plugin-sync-mocks",
      setup(api) {
        const modules = new Map([
          [/authManager\.js$/, mock("AuthManager")],
          [/supabaseApi\.js$/, mock("SupabaseApi")],
          [/profileManager\.js$/, mock("ProfileManager")],
          [/localStore\.js$/, mock("LocalStore")],
          [/syncHydrationState\.js$/, `export const SyncPullResult = { SUCCESS_WITH_DATA: "SUCCESS_WITH_DATA", SUCCESS_EMPTY: "SUCCESS_EMPTY", FAILED: "FAILED" }; ${mock("SyncHydrationState")}`]
        ]);
        api.onResolve({ filter: /.*/ }, (args) => {
          for (const [pattern] of modules) {
            if (pattern.test(args.path)) return { path: args.path, namespace: "mock" };
          }
          return null;
        });
        api.onLoad({ filter: /.*/, namespace: "mock" }, (args) => {
          for (const [pattern, contents] of modules) {
            if (pattern.test(args.path)) return { contents, loader: "js" };
          }
          return null;
        });
      }
    }]
  });
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${Math.random()}`);
}

function installDeps({ storedSources, remoteRows = [] }) {
  const store = new Map([["pluginSources", storedSources]]);
  const calls = { rpc: [], upsert: [], deleted: [] };
  globalThis.__pluginSyncDeps__ = {
    AuthManager: { isAuthenticated: true, getEffectiveUserId: async () => "user-1" },
    ProfileManager: { getActiveProfileId: () => 1, getProfiles: async () => [] },
    LocalStore: { get: (key, fallback) => (store.has(key) ? structuredClone(store.get(key)) : fallback), set: (key, value) => store.set(key, structuredClone(value)) },
    SyncHydrationState: {
      capture: async () => ({}),
      beginPull: async () => true,
      isCurrent: async () => true,
      completePull: async () => {},
      allowsAutomaticPush: async () => true,
      get: () => null
    },
    SupabaseApi: {
      select: async () => remoteRows,
      rpc: async (name, body) => calls.rpc.push({ name, body }),
      upsert: async (table, rows) => calls.upsert.push(rows),
      delete: async (table, query) => calls.deleted.push(query)
    }
  };
  return { store, calls };
}

test("push never sends URL templates to the account plugin table", async () => {
  const { PluginSyncService, buildPushRows } = await loadService();
  const { calls } = installDeps({ storedSources: [{ id: "a", name: "Repo", url: REPO }] });
  // Even if a template reaches the push path, it is filtered out.
  assert.deepEqual(buildPushRows([{ url: TEMPLATE, name: "Template" }, { url: REPO, name: "Repo" }]).map((row) => row.url), [REPO]);

  PluginSyncService.recordLocalMutation(null, [], [{ url: REPO }]);
  assert.equal(await PluginSyncService.push({ automatic: true }), true);
  const pushed = calls.rpc[0].body.p_plugins;
  assert.deepEqual(pushed.map((row) => row.url), [REPO]);
  assert.ok(!JSON.stringify(calls).includes("{tmdbId}"));
});

test("legacy local templates are neither shown nor pushed", async () => {
  const { PluginSyncService } = await loadService();
  const { calls } = installDeps({ storedSources: [{ id: "old", name: "Old", urlTemplate: TEMPLATE }, { id: "a", name: "Repo", url: REPO }] });
  PluginSyncService.recordLocalMutation(null, [], []);
  await PluginSyncService.push({ automatic: true });
  assert.deepEqual(calls.rpc[0].body.p_plugins.map((row) => row.url), [REPO]);
});

test("automatic push is skipped unless the user changed plugins here (pull-only)", async () => {
  const { PluginSyncService } = await loadService();
  const { calls } = installDeps({ storedSources: [{ id: "a", name: "Repo", url: REPO }] });
  assert.equal(await PluginSyncService.push({ automatic: true }), false);
  assert.equal(calls.rpc.length + calls.upsert.length + calls.deleted.length, 0);
});

test("pull ignores template rows from the account and keeps repository rows", async () => {
  const { PluginSyncService } = await loadService();
  const { store } = installDeps({
    storedSources: [],
    remoteRows: [
      { url: TEMPLATE, name: "Template", enabled: true, sort_order: 0 },
      { url: REPO, name: "Repo", enabled: true, sort_order: 1 }
    ]
  });
  const pulled = await PluginSyncService.pull();
  assert.deepEqual(pulled.items.map((item) => item.url), [REPO]);
  assert.deepEqual(store.get("pluginSources").map((item) => item.url), [REPO]);
});
