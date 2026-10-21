import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("./streamScreen.js", import.meta.url), "utf8");
const method = source.match(/ {2}async routeSelectedStream\(selected, context = \{\}\) \{[\s\S]*?\n {2}\},/)[0];
const mediaUrl = "https://media.fixture.invalid/a.mkv?signature=disposable";

function fixture(resolve = async () => mediaUrl) {
  const calls = [];
  let chooser;
  let prepared;
  let requested = true;
  const state = { player: "vlc" };
  const screen = vm.runInNewContext(`({${method}})`, {
    Environment: { isBrowser: () => true },
    PlayerSettingsStore: { get: () => ({ browserExternalPlayer: state.player }) },
    normalizeBrowserExternalPlayer: (value) => value,
    getBrowserExternalPlayerOptions: () => ["disabled", "vlc"],
    getBrowserExternalPlayerPlatform: () => "android",
    resolveExternalHandoffMediaUrl: (...args) => { calls.push("resolve"); return resolve(...args); },
    normalizeType: (value) => value,
    resolveExternalResumeSeconds: () => 12,
    buildStreamResumeIdentity: () => "fixture",
    showBrowserExternalPlayerDialog: (options) => { chooser = options; calls.push("chooser"); return { destroy() {} }; },
    prepareBrowserExternalPlaybackLaunch: (options) => { prepared = options; calls.push("prepare"); return { launch: { href: "intent://fixture" } }; },
    launchBrowserExternalPlayer: () => { calls.push("request"); return requested; },
    clearExternalPlaybackHandoff: () => calls.push("clear")
  });
  screen.loadToken = 1;
  screen.params = { itemId: "fixture", itemType: "movie" };
  screen.getBackdropUrl = () => "";
  return { screen, calls, state, chooser: () => chooser, prepared: () => prepared, fail: () => { requested = false; } };
}

test("saved mobile preference confirms before preparing state or requesting navigation", async () => {
  const f = fixture();
  const selected = { url: mediaUrl, behaviorHints: { proxyHeaders: { request: {} } } };
  assert.equal(await f.screen.routeSelectedStream(selected, { onRequested: () => f.calls.push("watch-return") }), true);
  assert.deepEqual(f.calls, ["resolve", "chooser"]);
  assert.equal(f.chooser().getContext().source, selected);
  assert.equal(f.chooser().onLaunch(), true);
  assert.equal(f.prepared().source, selected);
  assert.equal(f.prepared().progressMode, "manual");
  assert.deepEqual(f.calls, ["resolve", "chooser", "prepare", "request", "watch-return"]);
});

test("immediate failure clears prepared handoff and never arms a return watcher", async () => {
  const f = fixture();
  await f.screen.routeSelectedStream({ url: mediaUrl }, { onRequested: () => f.calls.push("watch-return") });
  f.fail();
  assert.equal(f.chooser().onLaunch(), false);
  assert.deepEqual(f.calls, ["resolve", "chooser", "prepare", "request", "clear"]);
});

test("a delayed resolution after screen cleanup cannot display a chooser or resume playback", async () => {
  let release;
  const f = fixture(() => new Promise((resolve) => { release = resolve; }));
  const pending = f.screen.routeSelectedStream({ url: mediaUrl });
  f.screen.loadToken++;
  release(mediaUrl);
  assert.equal(await pending, true);
  assert.deepEqual(f.calls, ["resolve"]);
});

test("only the latest selection may resolve and an old chooser cannot launch", async () => {
  const releases = [];
  const f = fixture(() => new Promise((resolve) => releases.push(resolve)));
  const first = f.screen.routeSelectedStream({ url: mediaUrl });
  const second = f.screen.routeSelectedStream({ url: mediaUrl });
  releases[1](mediaUrl);
  await second;
  const chooser = f.chooser();
  releases[0](mediaUrl);
  await first;
  assert.deepEqual(f.calls, ["resolve", "resolve", "chooser"]);
  f.screen.loadToken++;
  assert.equal(chooser.getContext(), null);
  assert.equal(chooser.onLaunch(), false);
});

test("unverified persisted choices and offline playback never ask a provider for an external URL", async () => {
  const f = fixture();
  f.state.player = "lenna";
  assert.equal(await f.screen.routeSelectedStream({ url: mediaUrl }), false);
  f.state.player = "vlc";
  assert.equal(await f.screen.routeSelectedStream({ url: mediaUrl }, { offlineObjectUrl: "blob:fixture" }), false);
  assert.deepEqual(f.calls, []);
});
