import vm from "node:vm";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const playerScreenUrl = new URL("./playerScreen.js", import.meta.url);
const desktopCssUrl = new URL("../../../../css/desktop.css", import.meta.url);
const componentsCssUrl = new URL("../../../../css/components.css", import.meta.url);
const dialogUrl = new URL("../../components/nuvioDialog.js", import.meta.url);

test("browser PlayerScreen retains browser track paths without native TV playback branches", async () => {
  const source = await readFile(playerScreenUrl, "utf8");

  assert.match(source, /schedulePlaybackStallGuard/);
  assert.match(source, /getBrowserAudioTracks/);
  assert.match(source, /setBrowserAudioTrack/);
  assert.match(source, /audiotrackschanged/);
  assert.match(source, /createSubtitleObjectUrl/);
  assert.doesNotMatch(
    source,
    /\b(?:AVPlay|EngineFS|TizenEngineFsService|PalmSystem|webOS\.service|Luna|isWebOS|isTizen|setWebOsEmbedded|setAvPlay)\b/i
  );
});

test("desktop Player Back chrome follows the shared controls-visible state", async () => {
  const [source, desktopCss] = await Promise.all([
    readFile(playerScreenUrl, "utf8"),
    readFile(desktopCssUrl, "utf8")
  ]);

  assert.match(
    source,
    /const controlsVisible = Boolean\(this\.controlsVisible\) && !this\.isExternalFrameMode\(\);/
  );
  assert.match(source, /backButton\.toggleAttribute\("inert", !controlsVisible\);/);
  assert.match(source, /backButton\.setAttribute\("aria-hidden", String\(!controlsVisible\)\);/);
  assert.match(
    desktopCss,
    /#playerUiRoot:not\(\.controls-visible\) \.player-desktop-back-button\s*\{\s*opacity: 0;\s*pointer-events: none;/
  );
});

test("browser Player routes PiP through active-video capability and lifecycle events", async () => {
  const source = await readFile(playerScreenUrl, "utf8");

  assert.match(
    source,
    /getBrowserPictureInPictureCapability\(this\.getDesktopPlaybackVideo\(\), document\)/
  );
  assert.match(source, /enterpictureinpicture/);
  assert.match(source, /leavepictureinpicture/);
  assert.match(source, /webkitpresentationmodechanged/);
  assert.doesNotMatch(source, /navigator\.standalone|display-mode|isPwa|isStandalone/);
  assert.match(source, /markPictureInPictureUnavailableForActivePlayback/);
});

test("manual external playback uses a valid non-wrapping time row and responsive primary landscape actions", async () => {
  const [source, componentsCss, dialogSource] = await Promise.all([
    readFile(playerScreenUrl, "utf8"),
    readFile(componentsCssUrl, "utf8"),
    readFile(dialogUrl, "utf8")
  ]);
  assert.match(source, /validateExternalPlaybackPositionParts/);
  assert.match(source, /desktop-external-player-time-fields/);
  assert.match(source, /desktop-external-player-time-separator/);
  // This used to pin `manualDurationMs / 1000`, which sent a zero whenever the
  // runtime was never learned. applyExternalPlaybackReport reads a zero as a
  // claimed measurement and refuses the whole report, so Save wrote nothing and
  // said so only in text coloured like the caption beside it.
  assert.match(
    source,
    /durationSeconds: externalPlaybackReportDurationSeconds\(manualDurationMs\)/
  );
  assert.match(
    source,
    /markBrowserExternalPlaybackFinished\(\{\s*handoff,\s*controller: PlayerController\s*\}\)/
  );
  assert.match(source, /desktop-external-player-manual-actions/);
  assert.match(source, /desktop-external-player-manual-keep/);
  assert.match(source, /desktop-external-player-manual-set/);
  assert.match(
    source,
    /className: "desktop-external-player-primary desktop-external-player-manual-finish"/
  );
  assert.match(source, /data-nuvio-dialog-preserve-deletion/);
  assert.match(source, /event\.stopPropagation\(\);/);
  assert.match(dialogSource, /data-nuvio-dialog-preserve-deletion/);
  assert.match(
    componentsCss,
    /grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\) auto minmax\(0, 1fr\);/
  );
  assert.match(componentsCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(componentsCss, /desktop-external-player-manual-actions \{[\s\S]*?gap: 12px;/);
  assert.match(componentsCss, /width: min\(calc\(100vw - 24px\), 520px\);/);
  assert.match(
    componentsCss,
    /desktop-external-player-manual-actions \.nuvio-dialog-button \{[\s\S]*?min-width: 0;/
  );
  assert.match(
    componentsCss,
    /desktop-external-player-manual-actions \.desktop-external-player-manual-keep \{\s*grid-column: 1;/
  );
  assert.match(
    componentsCss,
    /desktop-external-player-manual-actions \.desktop-external-player-manual-set \{\s*grid-column: 2;/
  );
  assert.match(
    componentsCss,
    /desktop-external-player-manual-actions \.nuvio-dialog-button\.focused[\s\S]*?transform: none;/
  );
  assert.match(
    componentsCss,
    /nuvio-dialog-button:last-child:nth-child\(3\).*?grid-column: 1 \/ -1;/s
  );
  assert.match(
    componentsCss,
    /desktop-external-player-primary[\s\S]*?background: var\(--secondary-color, #f5f5f5\);/
  );
});

test("explicit player launches keep the gesture, force manual progress and never bind sidecars", async () => {
  const source = await readFile(playerScreenUrl, "utf8");
  assert.doesNotMatch(source, /bindBrowserPushReturn|disableBrowserPushReturn/);
  const method = source.match(/ {2}launchExternalPlayer\(player\) \{[\s\S]*?\n {2}\},/)[0];
  const calls = [];
  let preparedOptions;
  let requested = true;
  const screen = vm.runInNewContext(`({${method}})`, {
    getBrowserExternalPlayerPlatform: () => "ios",
    prepareBrowserExternalPlaybackLaunch(options) {
      preparedOptions = options;
      calls.push("prepare");
      return { launch: { href: "infuse://fixture" }, handoff: { token: "opaque" } };
    },
    PlayerController: {
      createProgressContext: () => ({ itemId: "fixture" }),
      beginExternalPlaybackHandoff: () => calls.push("begin"),
      video: { pause: () => calls.push("pause") }
    },
    launchBrowserExternalPlayer: () => { calls.push("request"); return requested; },
    clearExternalPlaybackHandoff: () => calls.push("clear")
  });
  const context = { mediaUrl: "https://fixture.invalid/a", source: { url: "https://fixture.invalid/a" } };
  screen.getExternalPlayerContext = () => context;
  screen.getExternalPlayerResumeSeconds = () => 12;
  screen.getExternalPlayerKnownDurationMs = () => 60000;
  assert.equal(screen.launchExternalPlayer("infuse"), true);
  assert.equal(preparedOptions.progressMode, "manual");
  assert.equal(preparedOptions.source, context.source);
  assert.deepEqual(calls, ["prepare", "request", "begin", "pause"]);
  calls.length = 0;
  requested = false;
  assert.equal(screen.launchExternalPlayer("infuse"), false);
  assert.deepEqual(calls, ["prepare", "request", "clear"]);
});


test("audio boost does not capture native cross-origin media", async () => {
  const source = await readFile(playerScreenUrl, "utf8");
  const declaration = source.match(/function supportsWebAudioAmplification\(\) \{[\s\S]*?\n\}/)[0];
  const context = { URL, location: { origin: "https://nuvio.example" }, PlayerController: { video: {} } };
  vm.runInNewContext(declaration, context);
  const video = context.PlayerController.video;
  video.currentSrc = "https://cdn.example/movie.mp4";
  assert.equal(context.supportsWebAudioAmplification(), false);
  video.currentSrc = "blob:https://nuvio.example/download";
  assert.equal(context.supportsWebAudioAmplification(), true);
  video.currentSrc = "/movie.mp4";
  assert.equal(context.supportsWebAudioAmplification(), true);
  video.currentSrc = "";
  assert.equal(context.supportsWebAudioAmplification(), false);
});


test("a copied link or playlist file arms the return prompt like a launch does", async () => {
  const source = await readFile(playerScreenUrl, "utf8");
  assert.match(source, /onDelivered: \(player\) => this\.trackManualExternalPlayback\(player\)/);
  const method = source.match(/ {2}trackManualExternalPlayback\(player\) \{[\s\S]*?\n {2}\},/)[0];
  const calls = [];
  let options;
  let handoff = { token: "opaque" };
  const screen = vm.runInNewContext(`({${method}})`, {
    beginManualExternalPlaybackHandoff(value) {
      options = value;
      calls.push("handoff");
      return handoff;
    },
    PlayerController: {
      createProgressContext: () => ({ itemId: "fixture" }),
      beginExternalPlaybackHandoff: () => calls.push("begin")
    }
  });
  screen.getExternalPlayerResumeSeconds = () => 42;
  screen.getExternalPlayerKnownDurationMs = () => 600000;
  assert.equal(screen.trackManualExternalPlayback("vlc"), true);
  assert.equal(options.player, "vlc");
  assert.equal(options.resumePositionSeconds, 42);
  assert.equal(options.knownDurationMs, 600000);
  assert.equal(options.progressContext.itemId, "fixture");
  assert.deepEqual(calls, ["handoff", "begin"]);
  calls.length = 0;
  handoff = null;
  assert.equal(screen.trackManualExternalPlayback("copylink"), false);
  assert.deepEqual(calls, ["handoff"]);
});

test("the Stopped at… picker has a runtime slider and starts at the last known position", async () => {
  const [source, componentsCss] = await Promise.all([
    readFile(playerScreenUrl, "utf8"),
    readFile(componentsCssUrl, "utf8")
  ]);
  assert.match(source, /t\("external_player_return_set_position", \{\}, "Stopped at…"\)/);
  assert.match(source, /t\("external_player_return_finish", \{\}, "Finished"\)/);
  assert.match(source, /slider\.type = "range";/);
  assert.match(source, /slider\.max = String\(Math\.floor\(manualDurationMs \/ 1000\)\);/);
  assert.match(source, /handoff\.startingPositionMs/);
  assert.match(componentsCss, /\.desktop-external-player-time-slider \{[\s\S]*?min-height: 44px;/);
});
