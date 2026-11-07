import { test, expect } from "@playwright/test";

// Text subtitles inside an MKV, read in the browser from the host with range
// requests (tests/fixtures/media/multi-audio/subtitles.mkv: an English SRT and a
// Spanish ASS track, one numbered line per second).
test.skip(({ browserName }) => browserName === "webkit", "Safari doesn't play MKV");

const MEDIA = "http://127.0.0.1:4373/media/multi-audio";
const NO_CORS = "http://127.0.0.1:4373/cors-denied/media/multi-audio";

async function openPlayer(page, url) {
  await page.goto("/__fixture/harness");
  await page.evaluate(async (target) => {
    await import("/__fixture/source/js/ui/navigation/router.js");
    const { PlayerController } = await import("/__fixture/source/js/core/player/playerController.js");
    const { PlayerScreen } = await import("/__fixture/source/js/ui/screens/player/playerScreen.js");
    const video = document.createElement("video");
    video.id = "videoPlayer";
    video.muted = true;
    document.body.append(video);
    PlayerController.bindVideoElement(video);
    window.__announced = 0;
    video.addEventListener("embeddedsubtitleschanged", () => (window.__announced += 1));
    await PlayerController.play(target, { itemId: null, itemType: "movie" });
    const screen = Object.create(PlayerScreen);
    screen.subtitles = [];
    screen.refreshTrackDialogs = () => {};
    screen.refreshSubtitleCueStyles = () => {};
    window.__player = { PlayerController, screen, video };
  }, url);
}

test("an MKV's text subtitle tracks are offered and their lines follow playback", async ({ page }) => {
  await openPlayer(page, `${MEDIA}/subtitles.mkv`);
  await expect.poll(() => page.evaluate(() => window.__announced)).toBe(1);
  const offered = await page.evaluate(() => {
    const { screen } = window.__player;
    screen.mergeEmbeddedSubtitleCandidates();
    return screen.subtitles.map(({ lang, label, addonName }) => ({ lang, label, addonName }));
  });
  expect(offered).toEqual([
    { lang: "eng", label: "English", addonName: "In the file" },
    { lang: "spa", label: "Español", addonName: "In the file" }
  ]);

  // Mount the English entry the way the picker does, and play.
  await page.evaluate(() => {
    const { screen, video } = window.__player;
    const subtitle = screen.subtitles[0];
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.src = subtitle.url;
    video.append(track);
    track.track.mode = "showing";
    window.__track = track;
    screen.startEmbeddedSubtitleFeed(track, subtitle);
    video.currentTime = 2.2;
    video.play().catch(() => {});
  });
  const active = () =>
    page.evaluate(() => Array.from(window.__track.track.activeCues || []).map((cue) => cue.text));
  await expect.poll(active).toEqual(["English line 2"]);
  await page.evaluate(() => {
    window.__player.video.currentTime = 4.3;
  });
  await expect.poll(active).toEqual(["English line 4"]);
  expect(await page.evaluate(() => window.__track.track.cues.length)).toBe(6);

  // Clearing the mounted tracks stops the feed.
  await page.evaluate(() => window.__player.screen.stopEmbeddedSubtitleFeed());
  expect(await page.evaluate(() => window.__player.screen.embeddedSubtitleFeed)).toBeNull();
});

test("a host without CORS range reads offers no embedded subtitles", async ({ page }) => {
  await openPlayer(page, `${NO_CORS}/subtitles.mkv`);
  await expect
    .poll(() => page.evaluate(() => window.__player.PlayerController.getRemuxAudioUnavailableReason()))
    .toBe("cors");
  expect(await page.evaluate(() => window.__player.PlayerController.getEmbeddedSubtitleTracks())).toEqual([]);
});
