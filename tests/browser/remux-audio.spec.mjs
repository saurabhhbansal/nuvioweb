import { test, expect } from "@playwright/test";

// Switching audio inside single files by remuxing into Media Source
// Extensions. Fixtures (tests/fixtures/media/multi-audio) carry one sine tone
// per audio track: 440 Hz, 880 Hz and (AC-3, not decodable in Chromium) 660 Hz.
// They are served cross-origin by the add-on fixture server, with and without
// CORS headers.
test.skip(({ browserName }) => browserName === "webkit", "Safari lists a file's audio tracks itself");

const MEDIA = "http://127.0.0.1:4373/media/multi-audio";
const NO_CORS = "http://127.0.0.1:4373/cors-denied/media/multi-audio";

async function openHarness(page) {
  await page.goto("/__fixture/harness");
  await page.evaluate(async () => {
    const remux = await import("/__fixture/source/js/core/player/remux/remuxAudio.js");
    const video = document.createElement("video");
    video.width = 320;
    document.body.append(video);
    const button = document.createElement("button");
    button.id = "start";
    button.textContent = "start";
    document.body.append(button);
    let analyser = null;
    window.__remux = {
      remux,
      video,
      session: null,
      probe: null,
      enableAudio() {
        const context = new AudioContext();
        const sourceNode = context.createMediaElementSource(video);
        analyser = context.createAnalyser();
        analyser.fftSize = 8192;
        sourceNode.connect(analyser);
        analyser.connect(context.destination);
        return context.resume();
      },
      dominantFrequency() {
        if (!analyser) return 0;
        const data = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(data);
        let best = 0;
        for (let index = 1; index < data.length; index += 1) if (data[index] > data[best]) best = index;
        return data[best] < -90 ? 0 : (best * analyser.context.sampleRate) / analyser.fftSize;
      }
    };
    button.addEventListener("click", () => {
      window.__remux.enableAudio();
      video.play().catch(() => {});
    });
  });
}

async function startRemux(page, url, audioIndex) {
  return page.evaluate(
    async ({ url: target, audioIndex: index }) => {
      const state = window.__remux;
      state.probe = await state.remux.probeRemuxableAudio(target);
      state.errors = [];
      state.session = new state.remux.RemuxSession({
        video: state.video,
        demuxer: state.probe.demuxer,
        videoTrack: state.probe.videoTrack,
        audioTrack: state.probe.audioTracks[index].track,
        onFatal: (error) => state.errors.push(String(error?.message || error))
      });
      await state.session.start({ startTime: 0 });
      return state.probe.audioTracks.map(({ label, language, codec, playable }) => ({ label, language, codec, playable }));
    },
    { url, audioIndex }
  );
}

async function expectTone(page, hz) {
  await expect
    .poll(async () => Math.abs((await page.evaluate(() => window.__remux.dominantFrequency())) - hz), {
      timeout: 8000
    })
    .toBeLessThan(25);
}

for (const file of ["multi-audio.mp4", "multi-audio.mkv", "multi-audio.webm"]) {
  test(`remux plays ${file} with the chosen audio track, switches and seeks`, async ({ page }) => {
    await openHarness(page);
    const tracks = await startRemux(page, `${MEDIA}/${file}`, 1);
    expect(tracks.map((track) => track.label)).toEqual(
      file.endsWith(".webm") ? ["English", "Français"] : ["English", "Français", "Deutsch AC-3"]
    );
    expect(tracks.map((track) => track.language).slice(0, 2)).toEqual(["eng", "fra"]);
    if (!file.endsWith(".webm")) expect(tracks[2]).toMatchObject({ codec: "ac-3", playable: false });

    await page.click("#start");
    await expect.poll(() => page.evaluate(() => window.__remux.video.currentTime)).toBeGreaterThan(0.8);
    await expectTone(page, 880);

    await page.evaluate(() => window.__remux.session.switchAudio(window.__remux.probe.audioTracks[0].track));
    await expectTone(page, 440);

    await page.evaluate(() => {
      window.__remux.video.currentTime = 4.2;
    });
    await expect.poll(() => page.evaluate(() => window.__remux.video.currentTime)).toBeGreaterThan(4.5);
    await expectTone(page, 440);
    expect(await page.evaluate(() => window.__remux.errors)).toEqual([]);
    expect(await page.evaluate(() => window.__remux.video.error)).toBeNull();
  });
}

test("a host without CORS headers is reported as not switchable", async ({ page }) => {
  await openHarness(page);
  const reason = await page.evaluate(async (url) => {
    try {
      await window.__remux.remux.probeRemuxableAudio(url);
      return "opened";
    } catch (error) {
      return error.reason;
    }
  }, `${NO_CORS}/multi-audio.mkv`);
  expect(reason).toBe("cors");
});

// The audio picker end to end: PlayerController plays the plain file, probes
// it, lists its tracks, and moves to the remux path only for another track.
async function openPicker(page, url) {
  await page.goto("/__fixture/harness");
  await page.evaluate(async (target) => {
    await import("/__fixture/source/js/ui/navigation/router.js");
    const { PlayerController } = await import("/__fixture/source/js/core/player/playerController.js");
    const { PlayerScreen } = await import("/__fixture/source/js/ui/screens/player/playerScreen.js");
    const video = document.createElement("video");
    video.id = "videoPlayer";
    document.body.append(video);
    PlayerController.bindVideoElement(video);
    await PlayerController.play(target, { itemId: null, itemType: "movie" });

    const screen = Object.create(PlayerScreen);
    const dialog = document.createElement("div");
    dialog.id = "playerAudioDialog";
    document.body.append(dialog);
    screen.uiRefs = { audioDialog: dialog };
    screen.streamCandidates = [];
    screen.trackPreferenceContentId = "fixture:remux-audio";
    screen.renderControlButtons = () => {};
    screen.scrollAudioDialogIntoView = () => {};
    screen.updateModalBackdrop = () => {};
    screen.resetControlsAutoHide = () => {};
    screen.isCurrentSourceAdaptiveManifest = () => false;
    screen.canOpenInExternalPlayer = () => true;
    window.__externalOpened = 0;
    screen.openExternalPlayerChooser = () => {
      window.__externalOpened += 1;
      return true;
    };
    screen.invalidateTrackDialogCaches();
    screen.audioDialogVisible = true;
    screen.renderAudioDialog();
    video.addEventListener("audiotrackschanged", () => {
      screen.invalidateTrackDialogCaches();
      screen.renderAudioDialog();
    });
    window.__player = { PlayerController, screen, video };
  }, url);
}

test("the audio picker lists a CORS-enabled file's tracks and switches through remux", async ({ page }) => {
  await openPicker(page, `${MEDIA}/multi-audio.mkv`);
  const items = page.locator('#playerAudioDialog [data-audio-column="tracks"]');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toHaveClass(/selected/);
  await expect(items.nth(0)).toContainText("English");
  await expect(items.nth(2)).toHaveClass(/disabled/);
  expect(await page.evaluate(() => window.__player.PlayerController.playbackEngine)).toBe("native-file");

  await page.evaluate(() => window.__player.screen.applyAudioTrack(1, { rememberSelection: true }));
  await expect(items.nth(1)).toHaveClass(/selected/);
  expect(await page.evaluate(() => window.__player.PlayerController.playbackEngine)).toBe("remux");
  await expect
    .poll(() => page.evaluate(() => window.__player.video.readyState))
    .toBeGreaterThanOrEqual(2);
  const remembered = await page.evaluate(async () => {
    const { TrackPreferencesStore } = await import("/__fixture/source/js/data/local/trackPreferencesStore.js");
    return TrackPreferencesStore.getAudio("fixture:remux-audio");
  });
  expect(remembered).toMatchObject({ language: "fr" });

  // Back to the first track: the plain file again.
  await page.evaluate(() => window.__player.screen.applyAudioTrack(0, { rememberSelection: true }));
  expect(await page.evaluate(() => window.__player.PlayerController.playbackEngine)).toBe("native-file");
  await expect.poll(() => page.evaluate(() => window.__player.video.currentSrc)).toBe(`${MEDIA}/multi-audio.mkv`);
});

test("a remux failure falls back to the plain file at the same position", async ({ page }) => {
  await openPicker(page, `${MEDIA}/multi-audio.mp4`);
  await expect(page.locator('#playerAudioDialog [data-audio-column="tracks"]')).toHaveCount(3);
  await page.evaluate(() => window.__player.screen.applyAudioTrack(1));
  await expect.poll(() => page.evaluate(() => window.__player.video.readyState)).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => {
    window.__player.video.currentTime = 3;
  });
  await expect.poll(() => page.evaluate(() => window.__player.video.readyState)).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => window.__player.PlayerController.remuxAudio.session.fail(new Error("fixture failure")));

  expect(await page.evaluate(() => window.__player.PlayerController.playbackEngine)).toBe("native-file");
  await expect.poll(() => page.evaluate(() => window.__player.video.currentTime)).toBeGreaterThan(2.5);
  await expect(page.locator('#playerAudioDialog [data-audio-availability="browser-cannot-list"]')).toBeVisible();
  await expect(page.locator('#playerAudioDialog [data-audio-action="external-player"]')).toBeVisible();
});

test("a file on a host without CORS keeps today's message and the external player", async ({ page }) => {
  await openPicker(page, `${NO_CORS}/multi-audio.mkv`);
  await expect(
    page.locator('#playerAudioDialog [data-audio-availability="browser-cannot-list"]')
  ).toBeVisible();
  await expect(page.locator('#playerAudioDialog [data-audio-action="external-player"]')).toBeVisible();
  expect(await page.evaluate(() => window.__player.PlayerController.getRemuxAudioUnavailableReason())).toBe("cors");
  // The plain file still plays.
  await expect.poll(() => page.evaluate(() => window.__player.video.readyState)).toBeGreaterThanOrEqual(1);
});
