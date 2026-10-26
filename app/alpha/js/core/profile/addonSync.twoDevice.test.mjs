import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Two devices sharing one Nuvio account, running the real add-on sync service
// and repository. The account is a fake behind `fetch`; each device is its own
// bundle (so module state is not shared) over its own `localStorage`. This is
// the round trip the native apps see: what one device pushes is what the
// other pulls.

const ADDON_A = "https://catalog-a.example.invalid";
const ADDON_B = "https://catalog-b.example.invalid";

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

// The `addons` table and `sync_push_addons` as the public API documents them:
// a push fully replaces the profile's rows, keyed by URL.
function createCloud() {
  const rows = new Map(); // profileId -> rows
  const pushes = [];
  return {
    rows,
    pushes,
    handle(method, path, body) {
      if (path.endsWith("/rpc/sync_push_addons")) {
        pushes.push(body.p_addons || []);
        rows.set(
          Number(body.p_profile_id),
          (body.p_addons || []).map((addon) => ({
            url: addon.url,
            name: addon.name ?? null,
            enabled: addon.enabled !== false,
            sort_order: addon.sort_order ?? 0
          }))
        );
        return null;
      }
      if (method === "GET" && /\/rest\/v1\/addons\?/.test(path)) {
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
        export { LibrarySyncService } from "./librarySyncService.js";
        export { addonRepository } from "../../data/repository/addonRepository.js";
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

async function createDevice(cloud) {
  const storage = createStorage();
  storage.setItem("activeProfileId", JSON.stringify("1"));
  storage.setItem("profiles", JSON.stringify([{ id: "1", profileIndex: 1, isPrimary: true }]));
  const modules = await withDevice(storage, cloud, () => bundleDevice());
  await withDevice(storage, cloud, () => {
    modules.AuthManager.setState(modules.AuthState.AUTHENTICATED);
    modules.AuthManager.cachedEffectiveUserId = "user-1";
    // The wiring StartupSyncService installs: a user change on this device is
    // recorded as pending, a remote pull is not. Pushes are sent by the tests.
    modules.addonRepository.onInstalledAddonsChanged((reason, mutation) => {
      if (reason !== "remote-pull") modules.LibrarySyncService.markLocalMutation(null, mutation);
    });
  });
  return {
    run: (fn) => withDevice(storage, cloud, () => fn(modules)),
    installed: () =>
      withDevice(storage, cloud, () => modules.addonRepository.getInstalledAddonUrls()),
    enabled: (url) => withDevice(storage, cloud, () => modules.addonRepository.isAddonEnabled(url))
  };
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

// What the Add-ons screen does: change the list, then push to the account.
async function addAndPush(device, url) {
  await device.run(async ({ addonRepository, LibrarySyncService }) => {
    await addonRepository.addAddon(url);
    assert.equal(await LibrarySyncService.push(), true);
  });
}

async function pull(device) {
  return device.run(({ LibrarySyncService }) => LibrarySyncService.pull());
}

test("an add-on added on one device appears on the other, and a removal follows", async () => {
  const cloud = createCloud();
  const deviceA = await createDevice(cloud);
  const deviceB = await createDevice(cloud);
  await pull(deviceA);
  await pull(deviceB);

  await addAndPush(deviceA, ADDON_A);
  await addAndPush(deviceA, ADDON_B);
  // Each push carries only the fields the native apps write.
  cloud.pushes.forEach((push) =>
    push.forEach((addon) =>
      assert.deepEqual(
        Object.keys(addon).filter((key) => !["url", "name", "enabled", "sort_order"].includes(key)),
        []
      )
    )
  );

  await pull(deviceB);
  assert.deepEqual((await deviceB.installed()).slice(-2), [ADDON_A, ADDON_B]);

  await deviceB.run(async ({ addonRepository, LibrarySyncService }) => {
    await addonRepository.removeAddon(ADDON_A);
    assert.equal(await LibrarySyncService.push(), true);
  });
  await pull(deviceA);
  const afterRemoval = await deviceA.installed();
  assert.equal(afterRemoval.includes(ADDON_A), false);
  assert.equal(afterRemoval.includes(ADDON_B), true);
});

test("a reorder on one device reaches the other", async () => {
  const cloud = createCloud();
  const deviceA = await createDevice(cloud);
  const deviceB = await createDevice(cloud);
  await addAndPush(deviceA, ADDON_A);
  await addAndPush(deviceA, ADDON_B);
  await pull(deviceB);

  await deviceB.run(async ({ addonRepository, LibrarySyncService }) => {
    const others = addonRepository.getInstalledAddonUrls().filter((url) => url !== ADDON_A && url !== ADDON_B);
    await addonRepository.setAddonOrder([ADDON_B, ...others, ADDON_A]);
    assert.equal(await LibrarySyncService.push(), true);
  });
  await pull(deviceA);
  const order = await deviceA.installed();
  assert.equal(order[0], ADDON_B);
  assert.equal(order.at(-1), ADDON_A);
});

test("turning an add-on off is a local change the account receives and a pull keeps", async () => {
  const cloud = createCloud();
  const deviceA = await createDevice(cloud);
  const deviceB = await createDevice(cloud);
  await addAndPush(deviceA, ADDON_A);
  await pull(deviceB);

  const reasons = [];
  await deviceA.run(async ({ addonRepository, LibrarySyncService }) => {
    addonRepository.onInstalledAddonsChanged((reason) => reasons.push(reason));
    addonRepository.setAddonEnabled(ADDON_A, false);
    // The change is recorded as this device's own, so a pull that lands before
    // the push cannot switch the add-on back on.
    assert.equal(LibrarySyncService.hasPendingLocalMutation(), true);
    await LibrarySyncService.pull();
    assert.equal(addonRepository.isAddonEnabled(ADDON_A), false);
    assert.equal(await LibrarySyncService.push(), true);
  });
  assert.deepEqual(reasons.filter((reason) => reason !== "remote-pull"), ["toggle"]);
  assert.equal(cloud.rows.get(1).find((row) => row.url === ADDON_A).enabled, false);

  await pull(deviceB);
  assert.equal(await deviceB.enabled(ADDON_A), false);
});
