import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

async function loadScreen(dependencies) {
  globalThis.__profileActivationDeps__ = dependencies;
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./profileSelectionScreen.js", import.meta.url))],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    plugins: [{
      name: "profile-activation-boundaries",
      setup(buildApi) {
        const exportsByFile = new Map([
          ["router.js", ["Router"]], ["authManager.js", ["AuthManager"]],
          ["profileManager.js", ["MAX_PROFILES", "ProfileManager"]],
          ["profileSyncService.js", ["ProfileSyncService"]],
          ["startupSyncService.js", ["StartupSyncService"]],
          ["screen.js", ["ScreenUtils"]], ["avatarRepository.js", ["AvatarRepository"]],
          ["index.js", ["I18n"]], ["nuvioDialog.js", ["NuvioDialog"]],
          ["detailWatchedEnrichmentService.js", ["detailWatchedEnrichmentService"]],
          ["experienceModeRouting.js", ["resolveExperienceRoute"]],
          ["loadingIndicator.js", ["renderLoadingIndicator"]], ["homeScreen.js", ["HomeScreen"]],
          ["browserProfileAvatarCache.js", ["removeBrowserProfileAvatar", "resolveBrowserProfileAvatar"]]
        ]);
        buildApi.onResolve({ filter: /\.js$/ }, (args) => {
          if (args.kind === "entry-point") return undefined;
          const names = exportsByFile.get(args.path.split("/").at(-1));
          if (!names) throw new Error(`Unmocked dependency: ${args.path}`);
          return { path: names.join(","), namespace: "fixture" };
        });
        buildApi.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          contents: path.split(",").map((name) =>
            `export const ${name} = globalThis.__profileActivationDeps__.${name};`
          ).join("\n")
        }));
      }
    }]
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}#${Math.random()}`)).ProfileSelectionScreen;
}

async function fixture(t, { current = true } = {}) {
  const calls = [];
  const critical = deferred();
  const paint = deferred();
  const warnings = [];
  const originalWarn = console.warn;
  const originalDocument = globalThis.document;
  const originalFrame = globalThis.requestAnimationFrame;
  const overlayClasses = new Set();
  const overlay = { setAttribute() {}, classList: { add: (name) => overlayClasses.add(name) }, remove() {} };
  globalThis.document = { querySelector: () => null, createElement: () => overlay, body: { appendChild() {} } };
  globalThis.requestAnimationFrame = (callback) => queueMicrotask(callback);
  console.warn = (...args) => warnings.push(args[0]);
  t.after(() => {
    console.warn = originalWarn;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = originalFrame;
    delete globalThis.__profileActivationDeps__;
  });
  const dependencies = {
    Router: { releaseAllSuspendedLayers: () => {}, navigate: async () => { calls.push("navigate"); } },
    MAX_PROFILES: 6,
    ProfileManager: { setActiveProfile: async () => {} },
    StartupSyncService: {
      enableProfileScopedSync: () => {},
      hydrateCriticalHome: () => critical.promise,
      requestSyncNow: async (options) => { calls.push(options); }
    },
    detailWatchedEnrichmentService: { invalidateAllCache: () => {} },
    renderLoadingIndicator: () => "",
    resolveExperienceRoute: async () => "home",
    HomeScreen: { initialLoadPromise: paint.promise }
  };
  const screen = await loadScreen(dependencies);
  screen.container = null;
  screen.isActivatingProfile = false;
  const hydration = { current, profileId: "1", addons: { marker: "synthetic" } };
  return { screen, calls, critical, paint, hydration, warnings, dependencies, overlayClasses };
}

const turn = () => new Promise((resolve) => setImmediate(resolve));

test("current profile background sync starts while Home first paint is still pending", async (t) => {
  const f = await fixture(t);
  let activationFinished = false;
  const activation = f.screen.activateProfile("1").then(() => { activationFinished = true; });
  await turn();
  assert.deepEqual(f.calls, ["navigate"]);
  f.critical.resolve(f.hydration);
  await turn();
  try {
    assert.deepEqual(f.calls, ["navigate", { criticalHydration: f.hydration }]);
    assert.equal(activationFinished, false, "visual transition still awaits Home paint");
    assert.equal(f.overlayClasses.has("is-hidden"), false);
  } finally {
    f.paint.resolve();
    await activation;
  }
  assert.equal(f.calls.length, 2, "do not dispatch twice when Home finally paints");
  assert.equal(f.overlayClasses.has("is-hidden"), true);
  assert.deepEqual(f.warnings, []);
});

test("obsolete critical hydration never dispatches background sync", async (t) => {
  const f = await fixture(t, { current: false });
  const activation = f.screen.activateProfile("1");
  f.critical.resolve(f.hydration);
  f.paint.resolve();
  await activation;
  assert.deepEqual(f.calls, ["navigate"]);
});

test("failed critical hydration does not dispatch and permits activation retry", async (t) => {
  const f = await fixture(t);
  f.dependencies.StartupSyncService.hydrateCriticalHome = async () => { throw new Error("synthetic failure"); };
  f.paint.resolve();
  await f.screen.activateProfile("1");
  assert.deepEqual(f.calls, ["navigate"]);
  assert.equal(f.screen.isActivatingProfile, false);
  assert.deepEqual(f.warnings, ["Failed to activate profile"]);
});

test("background sync rejection is contained without breaking Home activation", async (t) => {
  const f = await fixture(t);
  f.dependencies.StartupSyncService.requestSyncNow = async () => { throw new Error("synthetic sync failure"); };
  const activation = f.screen.activateProfile("1");
  f.critical.resolve(f.hydration);
  f.paint.resolve();
  await activation;
  await turn();
  assert.deepEqual(f.warnings, ["Profile background sync failed"]);
});
