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
      return state.probe.audioTracks.map(({ label, language, codec, playable, converted }) => ({
        label,
        language,
        codec,
        playable,
        converted
      }));
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

function canConvert(page) {
  return page.evaluate(() => window.__remux.remux.canTranscodeInThisBrowser());
}

for (const file of ["multi-audio.mp4", "multi-audio.mkv", "multi-audio.webm"]) {
  test(`remux plays ${file} with the chosen audio track, switches and seeks`, async ({ page }) => {
    await openHarness(page);
    const tracks = await startRemux(page, `${MEDIA}/${file}`, 1);
    expect(tracks.map((track) => track.label)).toEqual(
      file.endsWith(".webm") ? ["English", "Français"] : ["English", "Français", "Deutsch AC-3"]
    );
    expect(tracks.map((track) => track.language).slice(0, 2)).toEqual(["eng", "fra"]);
    if (!file.endsWith(".webm")) {
      // AC-3 is converted to Opus where WebCodecs can encode it, else Unsupported.
      const converts = await canConvert(page);
      expect(tracks[2]).toMatchObject({ codec: "ac-3", playable: converts, converted: converts });
    }

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

// AC-3 and E-AC-3: decoded in WASM, mixed to stereo, re-encoded to Opus.
for (const [file, index, hz] of [
  ["multi-audio.mp4", 2, 660],
  ["multi-audio.mkv", 2, 660],
  ["eac3-surround.mkv", 1, 550]
]) {
  test(`a converted ${file.includes("eac3") ? "5.1 E-AC-3" : "AC-3"} track in ${file} plays, seeks and switches`, async ({
    page
  }) => {
    await openHarness(page);
    test.skip(!(await canConvert(page)), "this engine can't encode Opus with WebCodecs");
    const tracks = await startRemux(page, `${MEDIA}/${file}`, index);
    expect(tracks[index]).toMatchObject({ playable: true, converted: true });

    await page.click("#start");
    await expect.poll(() => page.evaluate(() => window.__remux.video.currentTime)).toBeGreaterThan(0.8);
    // The centre-only 5.1 tone has to reach both stereo sides.
    await expectTone(page, hz);

    await page.evaluate(() => {
      window.__remux.video.currentTime = 4.2;
    });
    await expect.poll(() => page.evaluate(() => window.__remux.video.currentTime)).toBeGreaterThan(4.5);
    await expectTone(page, hz);

    // Converted -> copied AAC (changeType back from Opus), then converted again.
    await page.evaluate(() => {
      window.__remux.video.currentTime = 1;
    });
    await page.evaluate(() => window.__remux.session.switchAudio(window.__remux.probe.audioTracks[0].track));
    await expectTone(page, 440);
    // The clip is 6 s long: rewind so the last check doesn't race its end.
    await page.evaluate(async (target) => {
      const { video, session, probe } = window.__remux;
      video.currentTime = 0.5;
      await session.switchAudio(probe.audioTracks[target].track);
      video.play().catch(() => {});
    }, index);
    await expectTone(page, hz);
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
  const converts = await page.evaluate(async () =>
    (await import("/__fixture/source/js/core/player/remux/remuxAudio.js")).canTranscodeInThisBrowser()
  );
  if (converts) {
    await expect(items.nth(2)).not.toHaveClass(/disabled/);
    await expect(items.nth(2)).toContainText("Converted to stereo in browser");
  } else {
    await expect(items.nth(2)).toHaveClass(/disabled/);
  }
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

// Starts sound on the picker's <video> (a click, for the autoplay policy) and
// exposes the same dominantFrequency() as the remux harness for expectTone.
async function listenToPlayer(page) {
  await page.evaluate(() => {
    const video = window.__player.video;
    const button = document.createElement("button");
    button.id = "listen";
    button.textContent = "listen";
    document.body.append(button);
    button.addEventListener("click", () => {
      const context = new AudioContext();
      const sourceNode = context.createMediaElementSource(video);
      const analyser = context.createAnalyser();
      analyser.fftSize = 8192;
      sourceNode.connect(analyser);
      analyser.connect(context.destination);
      context.resume();
      video.play().catch(() => {});
      window.__remux = {
        dominantFrequency() {
          const data = new Float32Array(analyser.frequencyBinCount);
          analyser.getFloatFrequencyData(data);
          let best = 0;
          for (let index = 1; index < data.length; index += 1) if (data[index] > data[best]) best = index;
          return data[best] < -90 ? 0 : (best * context.sampleRate) / analyser.fftSize;
        }
      };
    });
  });
  await page.click("#listen");
}

function canConvertInPicker(page) {
  return page.evaluate(async () =>
    (await import("/__fixture/source/js/core/player/remux/remuxAudio.js")).canTranscodeInThisBrowser()
  );
}

test("a file whose first track is AC-3 starts converted and still switches", async ({ page }) => {
  await openPicker(page, `${MEDIA}/ac3-first.mp4`);
  const items = page.locator('#playerAudioDialog [data-audio-column="tracks"]');
  await expect(items).toHaveCount(2);
  const engine = () => page.evaluate(() => window.__player.PlayerController.playbackEngine);
  if (!(await canConvertInPicker(page))) {
    // Without WebCodecs Opus the plain file keeps playing (silent there).
    expect(await engine()).toBe("native-file");
    await expect(items.nth(0)).not.toContainText("Converted to stereo in browser");
    return;
  }
  await expect.poll(engine).toBe("remux");
  await expect(items.nth(0)).toHaveClass(/selected/);
  await expect(items.nth(0)).toContainText("Converted to stereo in browser");
  await expect(items.nth(1)).not.toContainText("Converted to stereo in browser");
  await listenToPlayer(page);
  await expectTone(page, 660);

  // To the copied AAC track and back: both stay on the remux path.
  await page.evaluate(() => window.__player.screen.applyAudioTrack(1));
  await expectTone(page, 440);
  expect(await engine()).toBe("remux");
  await page.evaluate(async () => {
    window.__player.video.currentTime = 0.5;
    window.__player.screen.applyAudioTrack(0);
  });
  await expect(items.nth(0)).toHaveClass(/selected/);
  expect(await engine()).toBe("remux");
  await expectTone(page, 660);
  expect(await page.evaluate(() => window.__player.video.error)).toBeNull();
});

test("a file with a single AC-3 track is converted too", async ({ page }) => {
  await openPicker(page, `${MEDIA}/ac3-only.mkv`);
  const controller = (expression) =>
    page.evaluate((code) => {
      const { PlayerController } = window.__player;
      return code === "engine" ? PlayerController.playbackEngine : PlayerController.getRemuxAudioUnavailableReason();
    }, expression);
  if (!(await canConvertInPicker(page))) {
    await expect.poll(() => controller("reason")).toBe("single-audio");
    expect(await controller("engine")).toBe("native-file");
    return;
  }
  await expect.poll(() => controller("engine")).toBe("remux");
  const items = page.locator('#playerAudioDialog [data-audio-column="tracks"]');
  await expect(items).toHaveCount(1);
  await expect(items.nth(0)).toContainText("Converted to stereo in browser");
  await listenToPlayer(page);
  await expectTone(page, 660);
});
