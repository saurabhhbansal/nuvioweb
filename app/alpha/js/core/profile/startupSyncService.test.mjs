import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

function dependencyModule(name) {
  return `export const ${name} = new Proxy({}, { get: (_, key) => globalThis.__startupSyncDeps__.${name}?.[key] });`;
}

async function loadStartupSyncService() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./startupSyncService.js", import.meta.url))],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    plugins: [
      {
        name: "startup-sync-mocks",
        setup(buildApi) {
          const modules = new Map([
            ["auth", dependencyModule("AuthManager")],
            ["addons", dependencyModule("addonRepository")],
            ["profiles", dependencyModule("ProfileManager")],
            ["profile-sync", dependencyModule("ProfileSyncService")],
            ["library", dependencyModule("LibrarySyncService")],
            ["progress", dependencyModule("WatchProgressSyncService")],
            ["saved-library", dependencyModule("SavedLibrarySyncService")],
            ["watched", dependencyModule("WatchedItemsSyncService")],
            ["plugins", dependencyModule("PluginSyncService")],
            ["profile-settings", dependencyModule("ProfileSettingsSyncService")],
            ["trakt", dependencyModule("TraktCredentialSyncService")],
            ["simkl-credentials", dependencyModule("SimklCredentialSyncService")],
            ["provider", dependencyModule("ProviderCredentialSyncService")],
            ["simkl", dependencyModule("SimklSyncService")],
            ["collections", dependencyModule("CollectionSyncService")],
            ["home-catalog", dependencyModule("HomeCatalogSettingsSyncService")],
            ["theme", dependencyModule("ThemeManager")],
            ["i18n", dependencyModule("I18n")],
            ["hydration", `export const SyncPullResult = { SUCCESS_WITH_DATA: "SUCCESS_WITH_DATA", SUCCESS_EMPTY: "SUCCESS_EMPTY", FAILED: "FAILED" }; export const SyncHydrationState = new Proxy({}, { get: (_, key) => globalThis.__startupSyncDeps__.SyncHydrationState?.[key] });`]
          ]);
          for (const [filter, path] of [
            [/authManager\.js$/, "auth"],
            [/addonRepository\.js$/, "addons"],
            [/profileManager\.js$/, "profiles"],
            [/profileSyncService\.js$/, "profile-sync"],
            [/librarySyncService\.js$/, "library"],
            [/watchProgressSyncService\.js$/, "progress"],
            [/savedLibrarySyncService\.js$/, "saved-library"],
            [/watchedItemsSyncService\.js$/, "watched"],
            [/pluginSyncService\.js$/, "plugins"],
            [/profileSettingsSyncService\.js$/, "profile-settings"],
            [/traktCredentialSyncService\.js$/, "trakt"],
            [/simklCredentialSyncService\.js$/, "simkl-credentials"],
            [/providerCredentialSyncService\.js$/, "provider"],
            [/simklSyncService\.js$/, "simkl"],
            [/collectionSyncService\.js$/, "collections"],
            [/homeCatalogSettingsSyncService\.js$/, "home-catalog"],
            [/themeManager\.js$/, "theme"],
            [/i18n\/index\.js$/, "i18n"],
            [/syncHydrationState\.js$/, "hydration"]
          ]) {
            buildApi.onResolve({ filter }, () => ({ path, namespace: "test" }));
          }
          buildApi.onLoad({ filter: /.*/, namespace: "test" }, (args) => ({
            contents: modules.get(args.path)
          }));
        }
      }
    ]
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

function deferred() {
  let resolve = null;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

function installDependencies({ activeProfileId = "1" } = {}) {
  const calls = [];
  let sessionGeneration = 1;
  globalThis.__startupSyncDeps__ = {
    AuthManager: { isAuthenticated: true, getEffectiveUserId: async () => "user-1" },
    addonRepository: { onInstalledAddonsChanged: () => () => {} },
    ProfileManager: { getActiveProfileId: () => activeProfileId, getProfiles: async () => [] },
    ProfileSyncService: { pull: async () => [] },
    LibrarySyncService: {
      pull: async () => ({ result: "SUCCESS_EMPTY" }),
      push: async () => true,
      hasPendingLocalMutation: () => false
    },
    WatchProgressSyncService: { pull: async () => [] },
    SavedLibrarySyncService: { pull: async () => [] },
    WatchedItemsSyncService: { pull: async () => [] },
    PluginSyncService: {
      pull: async () => ({ result: "SUCCESS_EMPTY" }),
      push: async () => true,
      hasPendingLocalMutation: () => false
    },
    ProfileSettingsSyncService: { pull: async () => false },
    TraktCredentialSyncService: { pullFromRemote: async () => true },
    SimklCredentialSyncService: { pullFromRemote: async () => true },
    ProviderCredentialSyncService: { syncFromRemote: async () => true },
    SimklSyncService: { refresh: async () => true },
    CollectionSyncService: {
      pull: async () => ({ result: "SUCCESS_EMPTY" }),
      push: async () => true,
      triggerPush: () => {},
      hasPendingLocalMutation: () => false
    },
    HomeCatalogSettingsSyncService: { pull: async () => false },
    ThemeManager: { apply: () => { calls.push("theme-apply"); } },
    I18n: {
      init: async () => { calls.push("i18n-init"); },
      apply: () => { calls.push("i18n-apply"); }
    },
    SyncHydrationState: {
      capture: async (profileId) => ({ profileId: String(profileId), activeProfileId, generation: sessionGeneration }),
      isCurrent: async (context) => context.activeProfileId === activeProfileId && context.generation === sessionGeneration,
      invalidate: () => {},
      beginPull: async () => true,
      completePull: async () => true,
      get: () => "hydrated",
      allowsAutomaticPush: async () => true
    }
  };
  return {
    calls,
    setActiveProfile: (value) => { activeProfileId = String(value); },
    setSessionGeneration: (value) => { sessionGeneration = value; }
  };
}

test("critical Home hydration waits only for profile settings, catalog settings, and addons", async () => {
  const { calls } = installDependencies();
  const settings = deferred();
  const catalog = deferred();
  const addons = deferred();
  globalThis.__startupSyncDeps__.ProfileSettingsSyncService.pull = () => settings.promise;
  globalThis.__startupSyncDeps__.HomeCatalogSettingsSyncService.pull = () => catalog.promise;
  globalThis.__startupSyncDeps__.LibrarySyncService.pull = () => addons.promise;
  const { StartupSyncService } = await loadStartupSyncService();
  const hydration = StartupSyncService.hydrateCriticalHome("1");
  await Promise.resolve();
  assert.deepEqual(calls, []);
  settings.resolve(true);
  catalog.resolve(true);
  addons.resolve({ result: "SUCCESS_WITH_DATA" });
  const result = await hydration;
  assert.equal(result.current, true);
  assert.deepEqual(calls, ["i18n-init", "theme-apply", "i18n-apply"]);
});

test("slow SIMKL background work does not delay Collections or other independent domains", async () => {
  installDependencies();
  const simklCredentials = deferred();
  const started = [];
  globalThis.__startupSyncDeps__.SimklCredentialSyncService.pullFromRemote = () => simklCredentials.promise;
  globalThis.__startupSyncDeps__.CollectionSyncService.pull = async () => {
    started.push("collections");
    return { result: "SUCCESS_EMPTY" };
  };
  globalThis.__startupSyncDeps__.SavedLibrarySyncService.pull = async () => {
    started.push("saved-library");
    return [];
  };
  const { StartupSyncService } = await loadStartupSyncService();
  const sync = StartupSyncService.syncPull({
    includeProfileScoped: true,
    criticalHydration: {
      profileId: "1",
      current: true,
      addons: { result: "SUCCESS_EMPTY" }
    }
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(started.sort(), ["collections", "saved-library"]);
  simklCredentials.resolve(true);
  await sync;
});

test("a stale profile activation cannot apply its critical Home settings after a profile switch", async () => {
  const { calls, setActiveProfile } = installDependencies({ activeProfileId: "1" });
  const settings = deferred();
  const catalog = deferred();
  const addons = deferred();
  globalThis.__startupSyncDeps__.ProfileSettingsSyncService.pull = () => settings.promise;
  globalThis.__startupSyncDeps__.HomeCatalogSettingsSyncService.pull = () => catalog.promise;
  globalThis.__startupSyncDeps__.LibrarySyncService.pull = () => addons.promise;
  const { StartupSyncService } = await loadStartupSyncService();

  const hydration = StartupSyncService.hydrateCriticalHome("1");
  setActiveProfile("2");
  settings.resolve(true);
  catalog.resolve(true);
  addons.resolve({ result: "SUCCESS_WITH_DATA" });

  const result = await hydration;
  assert.equal(result.current, false);
  assert.deepEqual(calls, []);
});


test("a restarted account hydrates without waiting for old work and old completion cannot clear its pending cycle", async () => {
  installDependencies();
  const oldDomain = deferred();
  const newDomain = deferred();
  let account = "A";
  const watched = [];
  globalThis.__startupSyncDeps__.ProviderCredentialSyncService.syncFromRemote = () =>
    account === "A" ? oldDomain.promise : newDomain.promise;
  globalThis.__startupSyncDeps__.WatchedItemsSyncService.pull = async () => {
    watched.push(account);
    return [];
  };
  const { StartupSyncService: service } = await loadStartupSyncService();
  const criticalHydration = { profileId: "1", current: true, addons: { result: "SUCCESS_EMPTY" } };
  let oldCycle;
  let newCycle;
  try {
    await service.start({ profileScopedSyncEnabled: true, runInitialPull: false });
    oldCycle = service.requestSyncNow({ criticalHydration });
    await new Promise(setImmediate);
    assert.deepEqual(watched, ["A"]);
    service.stop();
    account = "B";
    await service.start({ profileScopedSyncEnabled: true, runInitialPull: false });
    newCycle = service.requestSyncNow({ criticalHydration });
    await new Promise(setImmediate);
    assert.deepEqual(watched, ["A", "B"]);
    oldDomain.resolve(true);
    assert.equal(await oldCycle, false);
    assert.equal(service.inFlight, true);
    newDomain.resolve(true);
    assert.equal(await newCycle, true);
    assert.equal(service.inFlight, false);
  } finally {
    service.stop();
    oldDomain.resolve(true);
    newDomain.resolve(true);
    await Promise.allSettled([oldCycle, newCycle]);
    service.stop();
  }
});

test("critical hydration for the new account's profile1 does not reuse the old account's pending task", async () => {
  installDependencies();
  const oldSettings = deferred();
  let settingsCalls = 0;
  globalThis.__startupSyncDeps__.ProfileSettingsSyncService.pull = () => {
    settingsCalls++;
    return settingsCalls === 1 ? oldSettings.promise : true;
  };
  const { StartupSyncService: service } = await loadStartupSyncService();
  let oldHydration;
  let newHydration;
  try {
    await service.start({ runInitialPull: false });
    oldHydration = service.hydrateCriticalHome("1");
    await new Promise(setImmediate);
    service.stop();
    await service.start({ runInitialPull: false });
    newHydration = service.hydrateCriticalHome("1");
    await new Promise(setImmediate);
    assert.equal(settingsCalls, 2);
    assert.equal((await newHydration).current, true);
    oldSettings.resolve(true);
    assert.equal((await oldHydration).current, false);
  } finally {
    service.stop();
    oldSettings.resolve(true);
    await Promise.allSettled([oldHydration, newHydration]);
  }
});

test("critical hydration cannot adopt a different session that arrived during its awaits", async () => {
  const { calls, setSessionGeneration } = installDependencies();
  const settings = deferred();
  globalThis.__startupSyncDeps__.ProfileSettingsSyncService.pull = () => settings.promise;
  const { StartupSyncService: service } = await loadStartupSyncService();
  const pending = service.hydrateCriticalHome("1");
  await new Promise(setImmediate);
  setSessionGeneration(2);
  settings.resolve(true);
  const result = await pending;
  assert.equal(result.current, false);
  assert.deepEqual(calls, []);
});

test("concurrent critical hydration in the same lifecycle and profile still shares one pull", async () => {
  installDependencies();
  const settings = deferred();
  let settingsCalls = 0;
  globalThis.__startupSyncDeps__.ProfileSettingsSyncService.pull = () => {
    settingsCalls++;
    return settings.promise;
  };
  const { StartupSyncService: service } = await loadStartupSyncService();
  const first = service.hydrateCriticalHome("1");
  const second = service.hydrateCriticalHome("1");
  await new Promise(setImmediate);
  assert.equal(settingsCalls, 1);
  settings.resolve(true);
  const results = await Promise.all([first, second]);
  assert.deepEqual(results.map((result) => result.current), [true, true]);
});

test("an obsolete automatic push cannot advance to the next domain after restart", async () => {
  installDependencies();
  const collections = deferred();
  const pushed = [];
  globalThis.__startupSyncDeps__.CollectionSyncService.push = () => {
    pushed.push("collections");
    return collections.promise;
  };
  globalThis.__startupSyncDeps__.PluginSyncService.push = async () => { pushed.push("plugins"); };
  globalThis.__startupSyncDeps__.LibrarySyncService.push = async () => { pushed.push("addons"); };
  const { StartupSyncService: service } = await loadStartupSyncService();
  const success = { result: "SUCCESS_WITH_DATA" };
  let pending;
  try {
    await service.start({ runInitialPull: false });
    pending = service.syncPush({ collections: success, plugins: success, addons: success });
    await new Promise(setImmediate);
    service.stop();
    await service.start({ runInitialPull: false });
    collections.resolve(true);
    await pending;
    assert.deepEqual(pushed, ["collections"]);
  } finally {
    service.stop();
    collections.resolve(true);
    await pending;
  }
});

test("addon sync restart owns its task and waiters while old-account completion is discarded", async () => {
  installDependencies();
  const oldPush = deferred();
  const newPush = deferred();
  const calls = [];
  let account = "A";
  let newWaiter = "pending";
  globalThis.__startupSyncDeps__.LibrarySyncService.push = () => {
    calls.push(account);
    return account === "A" ? oldPush.promise : newPush.promise;
  };
  const { StartupSyncService: service } = await loadStartupSyncService();
  let oldTask;
  let newTask;
  try {
    await service.start({ runInitialPull: false, profileScopedSyncEnabled: true });
    oldTask = service.flushAddonSync();
    await new Promise(setImmediate);
    service.stop();
    account = "B";
    await service.start({ runInitialPull: false, profileScopedSyncEnabled: true });
    service.addonSyncWaiters.push((value) => { newWaiter = value; });
    newTask = service.flushAddonSync();
    await new Promise(setImmediate);
    assert.deepEqual(calls, ["A", "B"]);
    oldPush.resolve(true);
    assert.equal(await oldTask, false);
    assert.equal(newWaiter, "pending");
    assert.notEqual(service.addonSyncInFlight, null);
    newPush.resolve(true);
    assert.equal(await newTask, true);
    assert.equal(newWaiter, true);
    assert.equal(service.addonSyncInFlight, null);
  } finally {
    service.stop();
    oldPush.resolve(true);
    newPush.resolve(true);
    await Promise.allSettled([oldTask, newTask]);
    service.stop();
  }
});

test("a stale critical context capture cannot start new-account remote work", async () => {
  installDependencies();
  const capture = deferred();
  const pulls = [];
  globalThis.__startupSyncDeps__.SyncHydrationState.capture = () => capture.promise;
  globalThis.__startupSyncDeps__.ProfileSettingsSyncService.pull = async () => { pulls.push("settings"); };
  const { StartupSyncService: service } = await loadStartupSyncService();
  let pending;
  try {
    await service.start({ runInitialPull: false });
    pending = service.hydrateCriticalHome("1");
    await new Promise(setImmediate);
    service.stop();
    await service.start({ runInitialPull: false });
    capture.resolve({ profileId: "1", activeProfileId: "1", generation: 1 });
    assert.equal((await pending).current, false);
    assert.deepEqual(pulls, []);
  } finally {
    service.stop();
    capture.resolve({ profileId: "1", activeProfileId: "1", generation: 1 });
    await pending;
  }
});

test("an obsolete initial start cannot replace the restarted lifecycle's interval", async () => {
  installDependencies();
  const settings = deferred();
  globalThis.__startupSyncDeps__.ProfileSettingsSyncService.pull = () => settings.promise;
  const { StartupSyncService: service } = await loadStartupSyncService();
  let oldStart;
  let newInterval;
  try {
    oldStart = service.start();
    await new Promise(setImmediate);
    service.stop();
    await service.start({ runInitialPull: false });
    newInterval = service.intervalId;
    settings.resolve(true);
    await oldStart;
    assert.equal(service.intervalId, newInterval);
  } finally {
    service.stop();
    clearInterval(newInterval);
    settings.resolve(true);
    await oldStart;
  }
});

test("account teardown during language loading cannot apply stale profile presentation", async () => {
  const { calls } = installDependencies();
  const language = deferred();
  const started = deferred();
  globalThis.__startupSyncDeps__.I18n.init = () => {
    calls.push("i18n-init");
    started.resolve();
    return language.promise;
  };
  const { StartupSyncService: service } = await loadStartupSyncService();
  let pending;
  try {
    await service.start({ runInitialPull: false });
    pending = service.hydrateCriticalHome("1");
    await started.promise;
    service.stop();
    await service.start({ runInitialPull: false });
    language.resolve();
    assert.equal((await pending).current, false);
    assert.deepEqual(calls, ["i18n-init"]);
  } finally {
    service.stop();
    language.resolve();
    await pending;
  }
});
