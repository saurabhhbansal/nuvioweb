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
  "Original declared 4K",
  "original-vp8",
  "Provider claims 4K HDR HEVC",
  "Adaptive HLS",
  "Adaptive DASH",
  "native-not-reported",
  "headers-required",
  "declared-expired",
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

test("bundled native preference is opt-in, keyboard accessible and keeps original4K selectable", async ({
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
  await expect.poll(ids).toEqual(original);
  const originalIds = await sources.evaluateAll((sources) =>
    sources.map((source) => source.dataset.streamId),
  );
  await expect(sources.first()).toContainText("Format and codec unknown");
  const control = page.getByRole("button", {
    name: "Native predictions first",
    exact: true,
  });
  await expect(control).toHaveAttribute("aria-pressed", "false");
  const requestsBefore = await (
    await request.get(`${provider}/__fixture/requests`)
  ).json();
  await control.focus();
  await page.keyboard.press("Enter");
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await expect.poll(ids).toEqual(preferred);
  await expect(control).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(control).not.toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(control).toBeFocused();
  await page.keyboard.press("Space");
  await expect(control).toHaveAttribute("aria-pressed", "false");
  await expect.poll(ids).toEqual(original);
  await control.click();
  await expect.poll(ids).toEqual(preferred);
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
    await page.screenshot({
      path: testInfo.outputPath(`source-order-${viewport.width}.png`),
    });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await sources.filter({ hasText: "Original declared 4K" }).click();
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
  await expect.poll(ids).toEqual(preferred);
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
    return {
      visible,
      selected,
      originalFirstId: streams[0].id,
      canonical: streams.map((stream) => stream.name),
    };
  }, provider);
  expect(result.visible).toEqual(preferred);
  expect(result.selected).toBe(result.originalFirstId);
  expect(result.canonical).toEqual(original);
});
