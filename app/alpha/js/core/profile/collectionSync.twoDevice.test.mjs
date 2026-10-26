import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Devices sharing one Nuvio account, running the real collection sync service
// and store. The account is a fake behind `fetch`; each device is its own
// bundle (so module state is not shared) over its own `localStorage`. The
// collections blob is shared with the native apps, so what the web app pushes
// must keep what they wrote.

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

// sync_pull_collections / sync_push_collections as the public API documents
// them: one JSON blob per profile, fully replaced by a push.
function createCloud() {
  const blobs = new Map(); // profileId -> collections_json
  return {
    blobs,
    handle(method, path, body) {
      if (path.endsWith("/rpc/sync_push_collections")) {
        blobs.set(Number(body.p_profile_id), structuredClone(body.p_collections_json));
        return null;
      }
      if (path.endsWith("/rpc/sync_pull_collections")) {
        const profileId = Number(body.p_profile_id);
        return blobs.has(profileId)
          ? [{ profile_id: profileId, collections_json: structuredClone(blobs.get(profileId)) }]
          : [];
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
        export { CollectionSyncService } from "./collectionSyncService.js";
        export { CollectionsStore } from "../../data/local/collectionsStore.js";
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
    local: () => withDevice(storage, cloud, () => modules.CollectionsStore.getForProfile("1")),
    pull: () => device.run(({ CollectionSyncService }) => CollectionSyncService.pull(1)),
    // A user edit through the store, then the push its debounce timer would send.
    // The timer is cancelled so it cannot fire later against another device.
    async edit(change) {
      await device.run(async ({ CollectionSyncService, CollectionsStore }) => {
        change(CollectionsStore);
        await new Promise((resolve) => setTimeout(resolve, 0));
        CollectionSyncService.pushTimers.forEach((timer) => clearTimeout(timer));
        CollectionSyncService.pushTimers.clear();
        assert.equal(CollectionSyncService.hasPendingLocalMutation(1), true);
        assert.equal(await CollectionSyncService.push(1), true);
      });
    }
  };
  return device;
}

const collection = (id, title, folders = []) => ({ id, title, viewMode: "TABBED_GRID", folders });
const folder = (id, title) => ({
  id,
  title,
  tileShape: "POSTER",
  catalogSources: [{ addonId: "com.example.catalog", type: "movie", catalogId: "top" }]
});

test("a collection added on one device appears on the other, and a removal follows", async () => {
  const cloud = createCloud();
  const deviceA = await createDevice(cloud);
  const deviceB = await createDevice(cloud);
  await deviceA.pull();
  await deviceB.pull();

  await deviceA.edit((store) => store.upsertCollection(collection("c1", "Weekend", [folder("f1", "Sci-Fi")])));
  await deviceA.edit((store) => store.upsertCollection(collection("c2", "Kids")));
  await deviceB.pull();
  assert.deepEqual((await deviceB.local()).map((entry) => entry.title), ["Weekend", "Kids"]);
  assert.equal((await deviceB.local())[0].folders[0].title, "Sci-Fi");

  await deviceB.edit((store) => store.removeCollection("c1"));
  await deviceA.pull();
  assert.deepEqual((await deviceA.local()).map((entry) => entry.id), ["c2"]);
});

test("an edit on the web keeps the fields a native app wrote that the web does not model", async () => {
  const cloud = createCloud();
  // What a native app left in the account: its own keys on the collection,
  // folder and both source lists, beside the ones the web app knows.
  cloud.blobs.set(1, [
    {
      id: "c1",
      title: "Weekend",
      viewMode: "ROWS",
      nativeOnlyCollectionFlag: "keep-me",
      folders: [
        {
          id: "f1",
          title: "Sci-Fi",
          tileShape: "POSTER",
          mobileFocusGifEnabled: false,
          sources: [
            { provider: "addon", addonId: "com.example.catalog", type: "movie", catalogId: "top", nativeSourceNote: 1 },
            { provider: "tmdb", tmdbSourceType: "TRENDING", mediaType: "MOVIE", sortBy: "popularity.desc", nativeTmdbNote: 2 }
          ],
          catalogSources: [
            { addonId: "com.example.catalog", type: "movie", catalogId: "top", nativeCatalogNote: 3 }
          ]
        }
      ]
    }
  ]);

  const web = await createDevice(cloud);
  await web.pull();
  assert.equal((await web.local())[0].title, "Weekend");

  // Rename the collection and add a second folder on the web.
  await web.edit((store) => {
    const [current] = store.getForProfile("1");
    store.upsertCollection({ ...current, title: "Weekend Picks", folders: [...current.folders, folder("f2", "Drama")] });
  });

  const [pushed] = cloud.blobs.get(1);
  assert.equal(pushed.title, "Weekend Picks");
  assert.equal(pushed.nativeOnlyCollectionFlag, "keep-me");
  const [nativeFolder, webFolder] = pushed.folders;
  assert.equal(nativeFolder.mobileFocusGifEnabled, false);
  assert.equal(nativeFolder.sources[0].nativeSourceNote, 1);
  assert.equal(nativeFolder.sources[1].nativeTmdbNote, 2);
  // Numbers the native app left out stay out, rather than becoming 0 filters.
  assert.equal(nativeFolder.sources[1].tmdbId, null);
  assert.equal(nativeFolder.sources[1].filters.voteAverageLte, null);
  assert.equal(nativeFolder.sources[1].filters.voteCountGte, null);
  assert.equal(nativeFolder.catalogSources[0].nativeCatalogNote, 3);
  assert.equal(webFolder.title, "Drama");
  assert.equal("mobileFocusGifEnabled" in webFolder, false);

  // Removing the native folder on the web removes it, unknown fields and all.
  await web.edit((store) => {
    const [current] = store.getForProfile("1");
    store.upsertCollection({ ...current, folders: current.folders.filter((entry) => entry.id !== "f1") });
  });
  assert.deepEqual(cloud.blobs.get(1)[0].folders.map((entry) => entry.id), ["f2"]);
  assert.equal(cloud.blobs.get(1)[0].nativeOnlyCollectionFlag, "keep-me");
});
