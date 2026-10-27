import { test, expect } from "@playwright/test";
import { installFakeAccount, openSignedInHome } from "./fakeAccount.mjs";

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

test("source list keeps add-on order with compact hints and fits a phone", async ({
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
  await installFakeAccount(context, { addons: [`${provider}/source-order`] });
  await openSignedInHome(page, { expect });
  await page
    .locator('#home .home-poster-card[data-item-id="fixture:original"]')
    .first()
    .click();
  await page.locator('button[data-action="playDefault"]').click();
  const sources = page.locator('[data-action="playStream"]');
  const headings = () =>
    sources.locator(".stream-route-card-heading").allTextContents();
  await expect.poll(headings).toEqual(original);

  // At most one compact hint per card, only when positively known.
  await expect(
    sources.filter({ hasText: "headers-required" }).locator(".stream-route-source-hint"),
  ).toHaveText("Needs headers");
  await expect(
    sources.filter({ hasText: "declared-expired" }).locator(".stream-route-source-hint"),
  ).toHaveText("Link expired");
  await expect(page.locator(".stream-route-source-hint")).toHaveCount(2);
  const listText = await page.locator("#stream .stream-route-list").textContent();
  expect(listText).not.toMatch(/unverified|Browser support unknown|Provider label/i);

  // No reorder toggle and no per-card correction buttons.
  await expect(page.getByRole("button", { name: "Device-aware order" })).toHaveCount(0);
  await expect(page.locator(".stream-route-source-correction")).toHaveCount(0);

  // Rendering the list never probes media.
  const requests = await (await request.get(`${provider}/__fixture/requests`)).json();
  expect(requests.some((entry) => entry.path.startsWith("/media/"))).toBe(false);

  await page.setViewportSize({ width: 390, height: 844 });
  const layout = await page.evaluate(() => ({
    pageScroll: document.documentElement.scrollWidth,
    pageWidth: window.innerWidth,
  }));
  expect(layout.pageScroll).toBeLessThanOrEqual(layout.pageWidth);
  await page.screenshot({ path: testInfo.outputPath("source-list-390.png") });
});

test("automatic selection picks the first source in add-on order", async ({
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
    return { visible, selected, originalFirstId: streams[0].id };
  }, provider);
  expect(result.visible).toEqual(original);
  expect(result.selected).toBe(result.originalFirstId);
});
