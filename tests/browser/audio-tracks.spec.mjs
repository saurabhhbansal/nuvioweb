import { test, expect } from "@playwright/test";

// The engine track list is mocked: no committed fixture carries more than one
// audio track. This checks the picker, the switch request and the per-profile memory.
test("audio picker lists HLS audio tracks, switches and remembers the choice", async ({ page }) => {
  await page.goto("/__fixture/harness");
  await page.evaluate(async () => {
    await import("/__fixture/source/js/ui/navigation/router.js");
    const { PlayerController } = await import("/__fixture/source/js/core/player/playerController.js");
    const { PlayerScreen } = await import("/__fixture/source/js/ui/screens/player/playerScreen.js");
    const hls = {
      audioTracks: [
        { id: 0, name: "English", lang: "en" },
        { id: 1, name: "Director commentary", lang: "en" },
        { id: 2, name: "Japanese", lang: "ja" }
      ],
      audioTrack: 0,
      nextAudioTrack: -1,
      startLoad() {}
    };
    PlayerController.video = document.createElement("video");
    PlayerController.playbackEngine = "hls.js";
    PlayerController.hlsInstance = hls;
    window.__fixtureHls = hls;

    const screen = Object.create(PlayerScreen);
    const dialog = document.createElement("div");
    dialog.id = "playerAudioDialog";
    document.body.append(dialog);
    screen.uiRefs = { audioDialog: dialog };
    screen.streamCandidates = [];
    screen.trackPreferenceContentId = "fixture:audio-tracks";
    screen.renderControlButtons = () => {};
    screen.scrollAudioDialogIntoView = () => {};
    screen.invalidateTrackDialogCaches();
    screen.audioDialogVisible = true;
    screen.renderAudioDialog();
    window.__fixtureScreen = screen;
  });

  const items = page.locator('#playerAudioDialog [data-audio-column="tracks"]');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toHaveClass(/selected/);
  await expect(page.locator("#playerAudioDialog")).toContainText("Director commentary");

  await page.evaluate(() => window.__fixtureScreen.applyAudioTrack(1, { rememberSelection: true }));
  await expect(items.nth(1)).toHaveClass(/selected/);
  await expect(items.nth(0)).not.toHaveClass(/selected/);
  expect(await page.evaluate(() => window.__fixtureHls.audioTrack)).toBe(1);

  const remembered = await page.evaluate(async () => {
    const { TrackPreferencesStore } = await import("/__fixture/source/js/data/local/trackPreferencesStore.js");
    return TrackPreferencesStore.getAudio("fixture:audio-tracks");
  });
  expect(remembered).toMatchObject({ language: "en", name: "Director commentary" });
});

test("audio picker says when a stream has only one audio track", async ({ page }) => {
  await page.goto("/__fixture/harness");
  await page.evaluate(async () => {
    await import("/__fixture/source/js/ui/navigation/router.js");
    const { PlayerController } = await import("/__fixture/source/js/core/player/playerController.js");
    const { PlayerScreen } = await import("/__fixture/source/js/ui/screens/player/playerScreen.js");
    PlayerController.video = document.createElement("video");
    PlayerController.playbackEngine = "hls.js";
    PlayerController.hlsInstance = { audioTracks: [{ id: 0, name: "English", lang: "en" }], audioTrack: 0 };
    const screen = Object.create(PlayerScreen);
    const dialog = document.createElement("div");
    dialog.id = "playerAudioDialog";
    document.body.append(dialog);
    screen.uiRefs = { audioDialog: dialog };
    screen.streamCandidates = [];
    screen.scrollAudioDialogIntoView = () => {};
    screen.invalidateTrackDialogCaches();
    screen.audioDialogVisible = true;
    screen.renderAudioDialog();
  });
  await expect(page.locator('#playerAudioDialog [data-audio-availability="single"]')).toHaveText(
    "This source has only one audio track."
  );
});

// Shared harness for the per-stream-type cases below. `setup` runs in the page
// with the PlayerController and a fresh video element; whatever it returns is
// readable as window.__fixtureState.
async function openAudioDialog(page, setup, { externalPlayer = false } = {}) {
  await page.goto("/__fixture/harness");
  await page.evaluate(async () => {
    await import("/__fixture/source/js/ui/navigation/router.js");
    const { PlayerController } = await import("/__fixture/source/js/core/player/playerController.js");
    PlayerController.video = document.createElement("video");
    PlayerController.hlsInstance = null;
    PlayerController.dashInstance = null;
    window.__fixturePlayer = PlayerController;
  });
  await page.evaluate(
    `window.__fixtureState = (${setup.toString()})(window.__fixturePlayer, window.__fixturePlayer.video) || {};`
  );
  await page.evaluate(
    async ({ offerExternal }) => {
      const { PlayerScreen } = await import("/__fixture/source/js/ui/screens/player/playerScreen.js");
      const screen = Object.create(PlayerScreen);
      const dialog = document.createElement("div");
      dialog.id = "playerAudioDialog";
      document.body.append(dialog);
      screen.uiRefs = { audioDialog: dialog };
      screen.streamCandidates = [];
      screen.trackPreferenceContentId = "fixture:audio-tracks";
      screen.renderControlButtons = () => {};
      screen.scrollAudioDialogIntoView = () => {};
      screen.updateModalBackdrop = () => {};
      screen.resetControlsAutoHide = () => {};
      screen.isCurrentSourceAdaptiveManifest = () => false;
      window.__externalOpened = 0;
      screen.canOpenInExternalPlayer = () => offerExternal;
      screen.openExternalPlayerChooser = () => {
        window.__externalOpened += 1;
        return true;
      };
      screen.audioFocusedColumn = "tracks";
      screen.audioMixFocusIndex = 0;
      screen.invalidateTrackDialogCaches();
      screen.audioDialogVisible = true;
      screen.renderAudioDialog();
      window.__fixtureScreen = screen;
    },
    { offerExternal: externalPlayer }
  );
}

test("audio picker lists DASH audio tracks, switches and remembers the choice", async ({ page }) => {
  await openAudioDialog(page, (PlayerController) => {
    const tracks = [
      { id: "a-en", lang: "en", labels: [{ text: "English" }], codec: 'audio/mp4;codecs="mp4a.40.2"' },
      { id: "a-fr", lang: "fr", labels: [{ text: "Français" }], codec: 'audio/mp4;codecs="mp4a.40.2"' }
    ];
    const state = { current: tracks[0], switched: [] };
    PlayerController.playbackEngine = "dash.js";
    PlayerController.dashInstance = {
      getTracksFor: (type) => (type === "audio" ? tracks : []),
      getCurrentTrackFor: (type) => (type === "audio" ? state.current : null),
      setCurrentTrack(track) {
        state.current = track;
        state.switched.push(track.id);
      }
    };
    return state;
  });

  const items = page.locator('#playerAudioDialog [data-audio-column="tracks"]');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveClass(/selected/);
  await expect(page.locator("#playerAudioDialog")).toContainText("Français");

  await page.evaluate(() => window.__fixtureScreen.applyAudioTrack(1, { rememberSelection: true }));
  await expect(items.nth(1)).toHaveClass(/selected/);
  expect(await page.evaluate(() => window.__fixtureState.switched)).toEqual(["a-fr"]);
  const remembered = await page.evaluate(async () => {
    const { TrackPreferencesStore } = await import("/__fixture/source/js/data/local/trackPreferencesStore.js");
    return TrackPreferencesStore.getAudio("fixture:audio-tracks");
  });
  expect(remembered).toMatchObject({ language: "fr" });
});

test("audio picker switches tracks inside a single file where the browser lists them (Safari)", async ({ page }) => {
  await openAudioDialog(page, (PlayerController, video) => {
    // Safari exposes HTMLMediaElement.audioTracks for MP4/MOV files.
    const tracks = [
      { id: "1", label: "English", language: "en", enabled: true },
      { id: "2", label: "Commentary", language: "en", enabled: false }
    ];
    Object.defineProperty(video, "audioTracks", { configurable: true, value: tracks });
    PlayerController.playbackEngine = "native-file";
    return { tracks };
  });

  const items = page.locator('#playerAudioDialog [data-audio-column="tracks"]');
  await expect(items).toHaveCount(2);
  await page.evaluate(() => window.__fixtureScreen.applyAudioTrack(1, { rememberSelection: true }));
  await expect(items.nth(1)).toHaveClass(/selected/);
  expect(await page.evaluate(() => window.__fixtureState.tracks.map((track) => track.enabled))).toEqual([
    false,
    true
  ]);
});

test("a single file in Chromium explains the limit and offers the external player", async ({ page }) => {
  await openAudioDialog(
    page,
    (PlayerController, video) => {
      PlayerController.playbackEngine = "native-file";
      // Chromium's default build has no HTMLMediaElement.audioTracks.
      return { nativeAudioTracks: "audioTracks" in video };
    },
    { externalPlayer: true }
  );

  expect(await page.evaluate(() => window.__fixtureState.nativeAudioTracks)).toBe(false);
  await expect(
    page.locator('#playerAudioDialog [data-audio-availability="browser-cannot-list"]')
  ).toContainText("can't list or switch the audio tracks inside a single video file");
  const action = page.locator('#playerAudioDialog [data-audio-action="external-player"]');
  await expect(action).toContainText("Open in another player");

  // Keyboard: down twice from the boost control reaches the hand-off, OK opens it.
  await page.evaluate(() => {
    const screen = window.__fixtureScreen;
    screen.handleAudioDialogKey({ keyCode: 40 });
    screen.handleAudioDialogKey({ keyCode: 40 });
    screen.handleAudioDialogKey({ keyCode: 13 });
  });
  expect(await page.evaluate(() => window.__externalOpened)).toBe(1);
  await expect(page.locator("#playerAudioDialog")).toHaveClass(/hidden/);
});

test("the external player action stays hidden when the stream can't be handed off", async ({ page }) => {
  await openAudioDialog(page, (PlayerController) => {
    PlayerController.playbackEngine = "native-file";
  });
  await expect(
    page.locator('#playerAudioDialog [data-audio-availability="browser-cannot-list"]')
  ).toBeVisible();
  await expect(page.locator('#playerAudioDialog [data-audio-action="external-player"]')).toHaveCount(0);
});

test("tracks whose codec the browser can't decode are marked and point at the external player", async ({ page }) => {
  await openAudioDialog(
    page,
    (PlayerController) => {
      PlayerController.playbackEngine = "hls.js";
      PlayerController.hlsInstance = {
        audioTracks: [
          { id: 0, name: "English 5.1", lang: "en", audioCodec: "dtsc" },
          { id: 1, name: "German 5.1", lang: "de", audioCodec: "dtsh" }
        ],
        audioTrack: 0,
        startLoad() {}
      };
    },
    { externalPlayer: true }
  );

  const items = page.locator('#playerAudioDialog [data-audio-column="tracks"]');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveClass(/disabled/);
  await expect(items.nth(0)).toContainText("Unsupported");
  await expect(
    page.locator('#playerAudioDialog [data-audio-availability="unsupported-codec"]')
  ).toContainText("can't play any of this source's audio tracks");
  await expect(page.locator('#playerAudioDialog [data-audio-action="external-player"]')).toBeVisible();
});
