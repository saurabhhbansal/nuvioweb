import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const provider = "http://127.0.0.1:4373";
const mediaUrl = "https://media.fixture.invalid:8443/original.mkv?signature=disposable%2Fcanary&part=2";
const sourceRoot = "/__fixture/source/js";

test.beforeEach(async ({ context }) => {
  await context.route("**/*", async (route) => {
    if (["http://127.0.0.1:4371", provider].includes(new URL(route.request().url()).origin)) await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test("bundled desktop player offers explicit playlist/copy, responsive explanation, help and cancel", async ({ page, context }, testInfo) => {
  const sidecars = [];
  page.on("request", (request) => {
    if (/\/api\/(external-return|push)\//.test(request.url())) sidecars.push(request.url());
  });
  await context.addInitScript((provider) => {
    localStorage.setItem("installedAddonUrls", JSON.stringify({ __profileScoped: true, version: 1, profiles: { "1": [`${provider}/basic`] } }));
  }, provider);
  await page.goto("/");
  await page.locator('[data-action="continueGuest"]').click();
  await page.locator('#home .home-poster-card[data-item-id="fixture:original"]').first().click();
  await page.locator('button[data-action="playDefault"]').click();
  await page.locator('[data-action="playStream"]').click();
  await expect.poll(() => page.locator("video").evaluate((video) => video.currentTime)).toBeGreaterThan(0.1);
  await page.mouse.move(640, 700);
  await page.getByRole("button", { name: "Open in another player", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Browser cookies and request headers are not transferred");
  await expect(dialog.getByRole("button", { name: /^Open in / })).toHaveCount(0);
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const metrics = await dialog.locator(".external-handoff-dialog").evaluate((node) => ({
      client: node.clientWidth, scroll: node.scrollWidth,
      height: node.getBoundingClientRect().height, viewport: innerHeight,
      font: getComputedStyle(node.querySelector(".external-handoff-details")).fontSize
    }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
    expect(metrics.height).toBeLessThanOrEqual(metrics.viewport - 30);
    expect(metrics.font).toBe("16px");
    await page.screenshot({ path: testInfo.outputPath(`external-player-${viewport.width}.png`) });
  }
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Download .m3u playlist", exact: true }).click()
  ]);
  expect(download.suggestedFilename()).toBe("nuvio-stream.m3u");
  const playlist = await readFile(await download.path(), "utf8");
  const playingUrl = await page.locator("video").evaluate((video) => video.currentSrc);
  expect(playingUrl).toBe(`${provider}/media/procedural-vp8-opus.webm`);
  expect(playlist).toBe(`#EXTM3U\n${playingUrl}\n`);
  await expect(dialog.getByRole("status")).toContainText("does not confirm playback");
  await dialog.getByRole("button", { name: "Player setup / nothing opened?", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("No protocol handler is assumed");
  await dialog.getByRole("button", { name: "Cancel / stay in Nuvio", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#player")).toBeVisible();
  expect(sidecars).toEqual([]);
});

async function mountSourcePlayer(page, source, subtitle = null) {
  await page.goto("/"); // Load real built styling, then exercise the actual source screen seam.
  await page.evaluate(async ({ sourceRoot, mediaUrl, source, subtitle }) => {
    await import(`${sourceRoot}/ui/navigation/router.js`);
    const { PlayerScreen } = await import(`${sourceRoot}/ui/screens/player/playerScreen.js`);
    const screen = Object.create(PlayerScreen);
    screen.activePlaybackUrl = mediaUrl;
    screen.getCurrentStreamCandidate = () => source;
    screen.getPlayerUiState = () => ({ title: "Disposable fixture" });
    screen.subtitles = subtitle ? [subtitle] : [];
    screen.selectedAddonSubtitleId = subtitle?.id;
    globalThis.__handoffScreen = screen;
    screen.openExternalPlayerChooser();
  }, { sourceRoot, mediaUrl, source, subtitle });
}

for (const location of ["source", "subtitle"]) {
  test(`actual player blocks ${location} headers without launch/copy/download or secret display`, async ({ page }) => {
    const restricted = { id: "sub", url: "https://media.fixture.invalid/sub.srt", raw: { behaviorHints: { proxyHeaders: { request: { Authorization: "DISPOSABLE-SECRET" } } } } };
    await mountSourcePlayer(page, location === "source" ? restricted : {}, location === "subtitle" ? restricted : null);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("status")).toContainText("requires request headers");
    await expect(dialog).not.toContainText("DISPOSABLE-SECRET");
    await expect(dialog.getByRole("button")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("nuvioExternalPlaybackHandoff"))).toBeNull();
  });
}

test("chooser rechecks changed sources and reports actual clipboard denial", async ({ page }) => {
  await mountSourcePlayer(page, {});
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } });
    document.execCommand = () => false;
  });
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Copy stream link", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Could not copy");
  await page.evaluate(() => { globalThis.__handoffScreen.activePlaybackUrl = "https://media.fixture.invalid/changed.mkv"; });
  await dialog.getByRole("button", { name: "Download .m3u playlist", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("selected stream changed");
});

for (const platform of ["ios", "android"]) {
  test.describe(`${platform} emulated browser seam, NOT installed-app interoperability`, () => {
    test.use({ viewport: { width: 390, height: 844 }, userAgent: platform === "ios"
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36" });

    test("saved preference stops at confirmation; Cancel creates no handoff and Open retains the click gesture", async ({ page }) => {
      await page.goto("/");
      const routed = await page.evaluate(async ({ sourceRoot, mediaUrl }) => {
        await import(`${sourceRoot}/ui/navigation/router.js`);
        const { StreamScreen } = await import(`${sourceRoot}/ui/screens/stream/streamScreen.js`);
        const { PlayerSettingsStore } = await import(`${sourceRoot}/data/local/playerSettingsStore.js`);
        PlayerSettingsStore.set({ browserExternalPlayer: "vlc" });
        const screen = Object.create(StreamScreen);
        screen.params = { itemId: "fixture:external", itemType: "movie" };
        screen.loadToken = 1;
        globalThis.__handoffStream = screen;
        return screen.routeSelectedStream({ url: mediaUrl });
      }, { sourceRoot, mediaUrl });
      expect(routed).toBe(true);
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("button", { name: "Open in VLC", exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: /Lenna|Outplayer|nPlayer/ })).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem("nuvioExternalPlaybackHandoff"))).toBeNull();
      await dialog.getByRole("button", { name: "Cancel / stay in Nuvio", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem("nuvioExternalPlaybackHandoff"))).toBeNull();
      // Builder + chooser capture only. Deliberately avoid claiming an installed
      // player from Chromium UA emulation or sending anything to a real app.
      await page.evaluate(async ({ sourceRoot, mediaUrl, platform }) => {
        const { showBrowserExternalPlayerDialog } = await import(`${sourceRoot}/ui/components/browserExternalPlayerDialog.js`);
        const { buildBrowserExternalPlayerLaunch } = await import(`${sourceRoot}/ui/components/browserExternalPlayer.js`);
        globalThis.__capturedLaunch = null;
        showBrowserExternalPlayerDialog({ getContext: () => ({ mediaUrl }), onLaunch: (player, context) => {
          const launch = buildBrowserExternalPlayerLaunch({ player, platform, ...context });
          globalThis.__capturedLaunch = { href: launch.href, gesture: navigator.userActivation.isActive };
          return true;
        } });
      }, { sourceRoot, mediaUrl, platform });
      await dialog.getByRole("button", { name: "Open in VLC", exact: true }).click();
      const captured = await page.evaluate(() => globalThis.__capturedLaunch);
      expect(captured.gesture).toBe(true);
      if (platform === "ios") expect(new URL(captured.href).searchParams.get("url")).toBe(mediaUrl);
      else expect(captured.href).toContain("package=org.videolan.vlc;action=android.intent.action.VIEW;");
      await expect(dialog.getByRole("status")).toContainText("not confirmed playback");
      await dialog.getByRole("button", { name: "Player setup / nothing opened?", exact: true }).click();
      await expect(dialog.getByRole("status")).toContainText("No app is detected automatically");
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    });
  });
}
