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

test("Player external launches bind the optional Push return subscription unless an Automation already returns the person", async () => {
  const source = await readFile(playerScreenUrl, "utf8");

  assert.match(
    source,
    /import \{ bindBrowserPushReturn \} from "\.\.\/\.\.\/components\/browserPushReturn\.js";/
  );
  // The binding is skipped for an Automation, which already brings the person
  // back, so a notification would arrive for an app they are looking at. The
  // launch stays outside the branch: nothing about the chosen way back may
  // decide whether playback starts.
  assert.match(
    source,
    /if \(returnMethod !== "automation"\) \{\s*await bindBrowserPushReturn\(\{ token: prepared\.handoff\?\.token \}\);\s*\}\s*launchBrowserExternalPlayer\(\{ href: prepared\.launch\.href \}\);/
  );
  // Choosing an Automation must never cancel the subscription: it carries
  // every other notification the app sends.
  assert.doesNotMatch(source, /disableBrowserPushReturn/);
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

test("startup failures are classified once and every startup path reports the resolved reason", async () => {
  const source = await readFile(playerScreenUrl, "utf8");

  assert.match(
    source,
    /import \{\s*classifyStartupFailure,\s*STARTUP_FAILURE_REASONS\s*\} from "\.\.\/\.\.\/\.\.\/core\/player\/startupFailure\.js";|import \{[^}]*classifyStartupFailure[^}]*\} from "\.\.\/\.\.\/\.\.\/core\/player\/startupFailure\.js";/
  );
  // One resolver builds the message and the machine-readable reason together.
  assert.match(source, /resolveStartupFailure\(\{/);
  assert.match(source, /reason: startupFailure\.reason/);
  // No startup path may keep a hard-coded reason that can disagree with the message.
  assert.doesNotMatch(source, /reason: "startup-stall"/);
  assert.doesNotMatch(source, /reason: "startup-media-error"/);
  assert.doesNotMatch(source, /reason: sourceElementError \? "startup-source-error"/);
  // Exactly three startup call sites resolve the classification.
  assert.equal(source.match(/this\.resolveStartupFailure\(\{/g).length, 3);
  // The player's narrow candidate list still carries the repository descriptor.
  assert.match(
    source,
    /sourceDescriptor: stream\.sourceDescriptor \|\| stream\.raw\?\.sourceDescriptor \|\| null,/
  );
  // The startup overlay keeps the single documented return path.
  assert.equal(source.match(/data-player-error-action="/g).length, 1);
  assert.match(source, /data-player-error-action="back"/);
});

test("classified header-required guidance outranks an HTTP status and messages are not double-punctuated", async () => {
  const [source, displayText] = await Promise.all([
    readFile(playerScreenUrl, "utf8"),
    readFile(new URL("./playbackDisplayText.js", import.meta.url), "utf8"),
  ]);

  const mediaError = source.slice(source.indexOf("  mediaErrorMessage("));
  const headerBranch = mediaError.indexOf(
    "reason === STARTUP_FAILURE_REASONS.HEADER_REQUIRED"
  );
  const httpBranch = mediaError.indexOf(
    "const httpMessage = this.getHttpPlaybackErrorMessage(httpStatus);"
  );
  assert.ok(headerBranch > 0, "the classified header branch must exist");
  assert.ok(
    httpBranch > headerBranch,
    "a header-restricted source must not show an HTTP verdict it never requested"
  );

  // A composed message that already ends with punctuation must not gain a second stop.
  assert.match(source, /return ensureSentenceEnding\(baseMessage\);/);
  assert.match(displayText, /export function ensureSentenceEnding/);
  assert.match(displayText, /\[\.!\?\]\$/);
});

test("the audio dialog refuses to offer tracks the engine cannot switch", async () => {
  const source = await readFile(playerScreenUrl, "utf8");

  // One decision, shared by the dialog and the activation boundary.
  assert.match(source, /getAudioSwitchBlocked\(copy = null\) \{/);
  assert.match(source, /return availability\?\.tone === "warning";/);
  assert.match(source, /if \(this\.getAudioSwitchBlocked\(\)\) \{/);
  assert.match(
    source,
    /const audioAvailability = this\.getAudioTrackAvailability\(\);\s*\n\s*const audioSwitchBlocked = this\.getAudioSwitchBlocked\(audioAvailability\);/
  );
  // The empty state reuses that copy instead of asking twice.
  assert.match(source, /this\.getUnavailableTrackMessage\("audio", audioAvailability\)/);
  // Blocked rows show the reviewed message, leave the focus order and do not
  // claim a codec failure.
  assert.match(source, /escapeHtml\(audioAvailability\.fallback\)/);
  // The same note covers unknown compatibility and predictions, not only blocks.
  assert.match(source, /const showAudioAvailabilityNote =/);
  assert.match(source, /audioAvailability\.key !== "player_audio_available"/);
  assert.match(source, /audioAvailability\.key !== "player_audio_no_tracks"/);
  assert.match(source, /const codecDisabled = entry\.supported === false;/);
  assert.match(source, /tabindex="\$\{disabled \? "-1" : "0"\}"/);
  assert.match(source, /\$\{disabled \? "" : " focusable"\}/);
});
