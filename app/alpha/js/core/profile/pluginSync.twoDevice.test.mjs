import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Devices sharing one Nuvio account, running the real plugin sync service and
// plugin manager. The account is a fake behind `fetch`; each device is its own
// bundle (so module state is not shared) over its own `localStorage`. The
// plugin list is shared with the native apps, so a push from here must give
// back what they wrote.

const REPO_A = "https://plugins-a.example.invalid/manifest.json";
const REPO_B = "https://plugins-b.example.invalid/manifest.json";
const NATIVE_REPO = "https://extensions.example.invalid/repo.json";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    }
  };
}

// The `plugins` table and `sync_push_plugins` as the native apps use them: a
// push replaces the profile's rows, and a field left out is stored as null.
function createCloud() {
  const rows = new Map(); // profileId -> rows
  return {
    rows,
    handle(method, path, body) {
      if (path.endsWith("/rpc/sync_push_plugins")) {
        rows.set(
          Number(body.p_profile_id),
          (body.p_plugins || []).map((plugin) => ({
            url: plugin.url,
            name: plugin.name ?? null,
            enabled: plugin.enabled !== false,
            sort_order: plugin.sort_order ?? 0,
            repo_type: plugin.repo_type ?? null
          }))
        );
        return null;
      }
      if (method === "GET" && /\/rest\/v1\/plugins\?/.test(path)) {
        const profileId = Number(/profile_id=eq\.(\d+)/.exec(path)?.[1] || 1);
        return [...(rows.get(profileId) || [])].sort((a, b) => a.sort_order - b.sort_order);
      }
      throw Object.assign(new Error(`unexpected ${method} ${path}`), { status: 404 });
    }
  };
}

async function bundleDevice() {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const result = await build({
    stdin: {
      contents: `
        export { PluginSyncService } from "./pluginSyncService.js";
        export { PluginManager } from "../player/pluginManager.js";
        export { AuthManager } from "../auth/authManager.js";
        export { AuthState } from "../auth/authState.js";
      `,
      resolveDir: here,
      loader: "js"
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent"
  });
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${Math.random()}`);
}

async function withDevice(storage, cloud, fn) {
  const outerStorage = globalThis.localStorage;
  const outerFetch = globalThis.fetch;
  globalThis.localStorage = storage;
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : {};
    let result;
    try {
      result = cloud.handle(init.method || "GET", String(url), body);
    } catch (error) {
      const payload = JSON.stringify({ message: error.message });
      return new Response(payload, { status: error.status || 500, headers: { "Content-Type": "application/json" } });
    }
    return result == null
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    return await fn();
  } finally {
    globalThis.localStorage = outerStorage;
    globalThis.fetch = outerFetch;
  }
}

async function createDevice(cloud) {
  const storage = createStorage();
  storage.setItem("activeProfileId", JSON.stringify("1"));
  storage.setItem("profiles", JSON.stringify([{ id: "1", profileIndex: 1, isPrimary: true }]));
  const modules = await withDevice(storage, cloud, () => bundleDevice());
  await withDevice(storage, cloud, () => {
    modules.AuthManager.setState(modules.AuthState.AUTHENTICATED);
    modules.AuthManager.cachedEffectiveUserId = "user-1";
  });
  const device = {
    run: (fn) => withDevice(storage, cloud, () => fn(modules)),
    urls: () => device.run(({ PluginManager }) => PluginManager.listPluginSources().map((source) => source.url)),
    pull: () => device.run(({ PluginSyncService }) => PluginSyncService.pull()),
    // What the Plugins screen does: change the list, record it as this
    // device's own change, then push.
    async edit(change) {
      await device.run(async ({ PluginManager, PluginSyncService }) => {
        const before = PluginManager.listPluginSources();
        change(PluginManager);
        PluginSyncService.recordLocalMutation(null, before, PluginManager.listPluginSources());
        assert.equal(await PluginSyncService.push({ automatic: true }), true);
      });
    }
  };
  return device;
}

test("a plugin repository added on one device appears on the other, and a removal follows", async () => {
  const cloud = createCloud();
  const deviceA = await createDevice(cloud);
  const deviceB = await createDevice(cloud);
  await deviceA.pull();
  await deviceB.pull();

  await deviceA.edit((manager) => manager.addPluginSource({ id: "a", name: "Repo A", url: REPO_A, enabled: true }));
  await deviceA.edit((manager) => manager.addPluginSource({ id: "b", name: "Repo B", url: REPO_B, enabled: true }));
  await deviceB.pull();
  assert.deepEqual(await deviceB.urls(), [REPO_A, REPO_B]);

  await deviceB.edit((manager) => {
    const source = manager.listPluginSources().find((entry) => entry.url === REPO_A);
    manager.removePluginSource(source.id);
  });
  await deviceA.pull();
  assert.deepEqual(await deviceA.urls(), [REPO_B]);
});

test("a change on the web gives back the repository kind a native app recorded", async () => {
  const cloud = createCloud();
  cloud.rows.set(1, [
    { url: NATIVE_REPO, name: "Native extensions", enabled: true, sort_order: 0, repo_type: "EXTERNAL_DEX" },
    { url: REPO_A, name: "Repo A", enabled: true, sort_order: 1, repo_type: "NUVIO_JS" }
  ]);
  const web = await createDevice(cloud);
  await web.pull();

  await web.edit((manager) => manager.addPluginSource({ id: "b", name: "Repo B", url: REPO_B, enabled: true }));
  assert.deepEqual(
    cloud.rows.get(1).map((row) => [row.url, row.repo_type]),
    [
      [NATIVE_REPO, "EXTERNAL_DEX"],
      [REPO_A, "NUVIO_JS"],
      // Added here: no kind, so the native apps detect it themselves.
      [REPO_B, null]
    ]
  );

  // Turning one off keeps its kind too.
  await web.edit((manager) => {
    const source = manager.listPluginSources().find((entry) => entry.url === NATIVE_REPO);
    manager.setPluginSourceEnabled(source.id, false);
  });
  assert.deepEqual(cloud.rows.get(1)[0], {
    url: NATIVE_REPO,
    name: "Native extensions",
    enabled: false,
    sort_order: 0,
    repo_type: "EXTERNAL_DEX"
  });
});

test("a repository added here but not yet sent survives a pull", async () => {
  const cloud = createCloud();
  cloud.rows.set(1, [{ url: REPO_A, name: "Repo A", enabled: true, sort_order: 0, repo_type: null }]);
  const device = await createDevice(cloud);
  await device.pull();
  await device.run(async ({ PluginManager, PluginSyncService }) => {
    const before = PluginManager.listPluginSources();
    PluginManager.addPluginSource({ id: "b", name: "Repo B", url: REPO_B, enabled: true });
    PluginSyncService.recordLocalMutation(null, before, PluginManager.listPluginSources());
    await PluginSyncService.pull();
  });
  assert.deepEqual(await device.urls(), [REPO_A, REPO_B]);
});
