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
