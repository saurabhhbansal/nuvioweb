import { test, expect } from "@playwright/test";

const provider = "http://127.0.0.1:4373";
const original = [
  "Provider claims 4K HDR HEVC",
  "native-not-reported",
  "Original declared 4K",
  "original-vp8",
  "Adaptive HLS",
  "Adaptive DASH",
  "headers-required",
  "declared-expired",
];
const preferred = [
  "original-vp8", "Provider claims 4K HDR HEVC", "native-not-reported",
  "Original declared 4K", "Adaptive HLS", "Adaptive DASH",
  "headers-required", "declared-expired",
];

test.beforeEach(async ({ context, request }) => {
  await request.delete(`${provider}/__fixture/requests`);
  await context.route("**/*", async (route) => {
    if (
      ["http://127.0.0.1:4371", provider].includes(
        new URL(route.request().url()).origin,
      )
    )
      await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test("bundled device ranking defaults on, is keyboard accessible and keeps original4K selectable", async ({
  page,
  context,
  request,
}, testInfo) => {
  await context.addInitScript(
    (provider) =>
      localStorage.setItem(
        "installedAddonUrls",
        JSON.stringify({
          __profileScoped: true,
          version: 1,
          profiles: { 1: [`${provider}/source-order`] },
        }),
      ),
    provider,
  );
  await page.goto("/");
  // Derive the expected prediction order from the engine's own codec support
  // instead of assuming Chromium's. Chromium/Chrome report H.264 and must take
  // the strict branch unchanged; engines without it document the other order.
  const supportsH264 = await page.evaluate(
    () =>
      document
        .createElement("video")
        .canPlayType('video/mp4; codecs="avc1.42c02a"') !== "",
  );
  const expectedPreferred = preferred;
  await page.locator('[data-action="continueGuest"]').click();
  await page
    .locator('#home .home-poster-card[data-item-id="fixture:original"]')
    .first()
    .click();
  await page.locator('button[data-action="playDefault"]').click();
  const sources = page.locator('[data-action="playStream"]');
  const ids = () =>
    sources.evaluateAll((sources) =>
      sources.map(
        (source) =>
          source.querySelector(".stream-route-card-heading").textContent,
      ),
    );
  await expect.poll(ids).toEqual(expectedPreferred);
  const originalIds = await sources.evaluateAll((sources) =>
    sources.map((source) => source.dataset.streamId),
  );
  await expect(sources.first()).toContainText("Plays here (browser prediction)");
  await expect(sources.filter({ hasText: "headers-required" })).toContainText("Needs your own proxy because it requires headers");
  await expect(sources.filter({ hasText: "Original declared 4K" })).toContainText("audio codec metadata missing");
  const control = page.getByRole("button", {
    name: "Device-aware order",
    exact: true,
  });
  await expect(control).toHaveAttribute("aria-pressed", "true");
  const requestsBefore = await (await request.get(`${provider}/__fixture/requests`)).json();
  await control.focus();
  await page.keyboard.press("Enter");
  await expect(control).toHaveAttribute("aria-pressed", "false");
  await expect.poll(ids).toEqual(original);
  await expect(control).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(control).not.toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(control).toBeFocused();
  await page.keyboard.press("Space");
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await expect.poll(ids).toEqual(expectedPreferred);
  const correction = page.getByRole("button", { name: "Didn't play here: original-vp8", exact: true });
  await correction.focus();
  await page.keyboard.press("Enter");
  await expect(sources.filter({ hasText: "original-vp8" })).toContainText("you reported playback failed");
  const clear = page.getByRole("button", { name: "Clear playback correction for original-vp8", exact: true });
  await expect(clear).toBeFocused();
  await page.keyboard.press("Space");
  await expect.poll(ids).toEqual(expectedPreferred);
  await expect(sources).toHaveCount(8);
  expect(
    (
      await sources.evaluateAll((sources) =>
        sources.map((source) => source.dataset.streamId),
      )
    ).sort(),
  ).toEqual([...originalIds].sort());
  const requestsAfter = await (
    await request.get(`${provider}/__fixture/requests`)
  ).json();
  expect(requestsAfter).toEqual(requestsBefore);
  expect(requestsAfter.some((entry) => entry.path.startsWith("/media/"))).toBe(
    false,
  );
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const metrics = await control.evaluate((button) => ({
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height,
      scroll: button.scrollWidth,
      client: button.clientWidth,
      fontSize: getComputedStyle(button).fontSize,
      top: button.getBoundingClientRect().top,
      filterBottom: document.querySelector(".stream-route-filter-row").getBoundingClientRect().bottom,
      pageScroll: document.documentElement.scrollWidth,
      pageWidth: window.innerWidth,
    }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
    expect(metrics.pageScroll).toBeLessThanOrEqual(metrics.pageWidth);
    expect(metrics.height).toBeGreaterThanOrEqual(44);
    expect(metrics.top).toBeGreaterThanOrEqual(metrics.filterBottom + 8);
    expect(metrics.fontSize).toBe("16px");
    const correctionLayout = await page.locator(".stream-route-source-correction").first().evaluate((button) => ({
      top: button.getBoundingClientRect().top,
      cardBottom: button.previousElementSibling.getBoundingClientRect().bottom,
      height: button.getBoundingClientRect().height
    }));
    expect(correctionLayout.top).toBeGreaterThanOrEqual(correctionLayout.cardBottom);
    expect(correctionLayout.height).toBeLessThan(100);
    await page.screenshot({
      path: testInfo.outputPath(`source-order-${viewport.width}.png`),
    });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await sources.filter({ hasText: "Original declared 4K" }).click();
  if (supportsH264) {
    const video = page.locator("video");
    await expect
      .poll(() =>
        video.evaluate((video) => ({
          width: video.videoWidth,
          height: video.videoHeight,
          error: video.error?.code || null,
        })),
      )
      .toEqual({ width: 3840, height: 2160, error: null });
    await expect
      .poll(() => video.evaluate((video) => video.currentTime))
      .toBeGreaterThan(0.1);
    expect(await video.evaluate((video) => video.currentSrc)).toBe(
      `${provider}/media/quality/original-2160p.mp4`,
    );
    await page.locator("[data-player-desktop-back]").click();
  } else {
    // The source stays selectable even when this engine cannot decode it; the
    // required behaviour is an explicit failure with a working return path.
    const overlay = page.locator("#playerStartupErrorOverlay");
    await expect(overlay).toHaveAttribute("aria-hidden", "false");
    await expect(overlay.locator(".player-startup-error-title")).toHaveText(
      "Playback Error",
    );
    await expect(
      overlay.locator(".player-startup-error-message"),
    ).not.toBeEmpty();
    await overlay.getByRole("button", { name: "Go Back", exact: true }).click();
  }
  await expect.poll(ids).toEqual(expectedPreferred);
  await expect(control).toHaveAttribute("aria-pressed", "true");
  const observed = await (
    await request.get(`${provider}/__fixture/requests`)
  ).json();
  expect(
    observed.every(
      (entry) => !entry.authorizationPresent && !entry.apiKeyPresent,
    ),
  ).toBe(true);
});

test("actual screen keeps automatic selection in provider order despite display preference", async ({
  page,
}) => {
  await page.goto("/__fixture/harness");
  const result = await page.evaluate(async (provider) => {
    // Enter the real module graph through Router as the application does.
    const { Router } =
      await import("/__fixture/source/js/ui/navigation/router.js");
    const { StreamScreen } =
      await import("/__fixture/source/js/ui/screens/stream/streamScreen.js");
    const { PlayerSettingsStore } =
      await import("/__fixture/source/js/data/local/playerSettingsStore.js");
    const { streamRepository } =
      await import("/__fixture/source/js/data/repository/streamRepository.js");
    const { flattenStreams } =
      await import("/__fixture/source/js/core/streams/streamList.js");
    const response = await streamRepository.getStreamsFromAddon(
      `${provider}/source-order`,
      "movie",
      "fixture:original",
    );
    const streams = flattenStreams({
      status: "success",
      data: [{ addonName: "Fixture", streams: response.data }],
    });
    const screen = Object.create(StreamScreen);
    screen.streams = streams;
    screen.sourceChips = [];
    screen.addonFilter = "all";
    screen.nativePredictionOrder = true;
    screen.params = { itemId: "fixture:original" };
    screen.cancelAutoPlaySelectionWait = () => {};
    let selected;
    screen.playStream = (id) => {
      selected = id;
    };
    Router.current = "stream";
    PlayerSettingsStore.set({
      streamAutoPlayMode: "FIRST_STREAM",
      streamAutoPlaySource: "ALL_SOURCES",
    });
    const visible = screen.getFilteredStreams().map((stream) => stream.name);
    screen.maybeAutoPlayStream({ allLoaded: true });
    const supportsH264 =
      document
        .createElement("video")
        .canPlayType('video/mp4; codecs="avc1.42c02a"') !== "";
    return {
      visible,
      supportsH264,
      selected,
      originalFirstId: streams[0].id,
      canonical: streams.map((stream) => stream.name),
    };
  }, provider);
  expect(result.visible).toEqual(
    preferred,
  );
  expect(result.selected).toBe(result.originalFirstId);
  expect(result.canonical).toEqual(original);
});


test("injected format predictions render browser, external, unknown, proxy and blocked tiers without hiding rows", async ({ page, context }) => {
  await context.addInitScript((provider) => {
    localStorage.setItem("installedAddonUrls", JSON.stringify({ __profileScoped: true, version: 1, profiles: { 1: [`${provider}/source-order`] } }));
    // Synthetic capability fixture, NOT a real HEVC/DV/device playback result.
    HTMLMediaElement.prototype.canPlayType = function(type) { return type.includes("vp8") ? "probably" : ""; };
  }, provider);
  await page.route("**/source-order/stream/**", async (route) => {
    const row = (name, extra = {}) => ({ name, url: `${provider}/media/procedural-vp8-opus.webm?case=${encodeURIComponent(name)}`, mimeType: 'video/webm; codecs="vp8,opus"', ...extra });
    await route.fulfill({ json: { streams: [
      row("False 4K", { mimeType: null }),
      row("MKV", { mimeType: 'video/x-matroska; codecs="hvc1.2.4.L153.B0,mp4a.40.2"' }),
      row("TrueHD", { audioTracks: [{ codec: "truehd" }] }),
      row("Main10", { mimeType: 'video/mp4; codecs="hvc1.2.4.L153.B0,mp4a.40.2"' }),
      row("DV7", { mimeType: 'video/mp4; codecs="dvhe.07.06,mp4a.40.2"' }),
      row("Headers", { behaviorHints: { proxyHeaders: { request: { Authorization: "fixture-private" } } } }),
      row("Expired", { expiresAt: "2020-01-01T00:00:00Z" }),
      row("Browser 1080p")
    ] } });
  });
  await page.goto("/");
  await page.locator('[data-action="continueGuest"]').click();
  await page.locator('#home .home-poster-card[data-item-id="fixture:original"]').first().click();
  await page.locator('button[data-action="playDefault"]').click();
  const sources = page.locator('[data-action="playStream"]');
  await expect.poll(() => sources.locator(".stream-route-card-heading").allTextContents()).toEqual([
    "Browser 1080p", "MKV", "TrueHD", "Main10", "DV7", "False 4K", "Headers", "Expired"
  ]);
  await expect(sources).toHaveCount(8);
  await expect(sources.filter({ hasText: "MKV" })).toContainText("MKV demux is unavailable");
  await expect(sources.filter({ hasText: "TrueHD" })).toContainText("TrueHD audio cannot be decoded");
  await expect(sources.filter({ hasText: "Main10" })).toContainText("this HEVC profile");
  await expect(sources.filter({ hasText: "DV7" })).toContainText("Dolby Vision profile 7");
  await expect(sources.filter({ hasText: "False 4K" })).toContainText("Unknown here");
  await expect(sources.filter({ hasText: "Headers" })).toContainText("requires headers");
  await expect(sources.filter({ hasText: "Expired" })).toContainText("Blocked");
  expect(await page.locator("#stream").textContent()).not.toContain("fixture-private");
  await page.getByRole("button", { name: "Device-aware order", exact: true }).click();
  await expect(sources.first()).toContainText("False 4K");
  await expect(sources).toHaveCount(8);
});
