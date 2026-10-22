import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === "http://127.0.0.1:4371")
      await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test("static bundled settings explain unavailable integrations without sidecar requests", async ({
  page,
}, testInfo) => {
  const sidecarRequests = [];
  page.on("request", (request) => {
    if (
      /\/api\/(trakt|debrid|external-return)\//.test(
        new URL(request.url()).pathname,
      )
    )
      sidecarRequests.push(new URL(request.url()).pathname);
  });
  await page.goto("/");
  await page.locator('[data-action="continueGuest"]').click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator('#settings [data-focus-key="nav:trakt"]').click();
  const traktSection = page.locator('[data-focus-key="tracking:desktop:trakt"]');
  await expect(traktSection).toContainText("Closed");
  await traktSection.click();
  await expect(traktSection).toContainText("Open");
  const trakt = page.locator('[data-sidecar-status="traktAuth"]');
  await expect(trakt).toContainText("Continue without Trakt");
  await expect(
    page.locator('[data-focus-key="tracking:desktop:trakt:connect"]'),
  ).toHaveCount(0);
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(trakt).toBeVisible();
    const metrics = await trakt.evaluate((node) => ({
      client: node.clientWidth,
      scroll: node.scrollWidth,
      font: getComputedStyle(node).fontSize,
    }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
    expect(metrics.font).toBe("16px");
    await page.screenshot({
      path: testInfo.outputPath(`trakt-unavailable-${viewport.width}.png`),
    });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator('#settings [data-focus-key="nav:integration"]').click();
  await page.locator('[data-focus-key="integration:hub:debrid"]').click();
  const debrid = page.locator('[data-sidecar-status="debrid"]');
  await expect(debrid).toContainText(
    "Choose a direct compatible add-on source",
  );
  await page
    .locator('[data-focus-key="integration:debrid:key:torbox"]')
    .click();
  await expect(debrid).toBeVisible();
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const metrics = await debrid.evaluate((node) => ({
      client: node.clientWidth,
      scroll: node.scrollWidth,
      font: getComputedStyle(node).fontSize,
    }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
    expect(metrics.font).toBe("16px");
    await page.screenshot({
      path: testInfo.outputPath(`debrid-unavailable-${viewport.width}.png`),
    });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator('#settings [data-focus-key="nav:playback"]').click();
  await page.locator('[data-focus-key="playback:toggle:general"]').click();
  // Progress and return settings do nothing without the bridge, so they are hidden.
  await expect(
    page.locator('[data-focus-key="playback:toggle:general"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-focus-key="playback:externalPlayerProgress"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-focus-key="playback:returnMethod"]'),
  ).toHaveCount(0);
  expect(sidecarRequests).toEqual([]);
});

test("actual browser client boundaries use manual return and never request disabled sidecars", async ({
  page,
}) => {
  await page.goto("/__fixture/harness");
  const result = await page.evaluate(async () => {
    await import("/__fixture/source/js/ui/navigation/router.js");
    const { getSidecarCapabilities } =
      await import("/__fixture/source/js/core/platform/sidecarCapabilities.js");
    const { TraktAuthService } =
      await import("/__fixture/source/js/data/repository/traktAuthService.js");
    const { DebridApi } =
      await import("/__fixture/source/js/data/remote/api/debridApi.js");
    const { prepareBrowserExternalPlaybackLaunch } =
      await import("/__fixture/source/js/ui/components/browserExternalPlayer.js");
    const { enableBrowserPushReturn } =
      await import("/__fixture/source/js/ui/components/browserPushReturn.js");
    const previous = globalThis.fetch;
    const requests = [];
    let prompts = 0;
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      throw new Error("Unexpected sidecar request");
    };
    try {
      let authError;
      try {
        await TraktAuthService.startDeviceAuth();
      } catch (error) {
        authError = error.code;
      }
      const debrid = await DebridApi.startTorboxDeviceAuthorization();
      const runtime = {
        __NUVIO_ENV__: {},
        crypto: globalThis.crypto,
        location: { href: "https://app.fixture.invalid/player" },
        localStorage: globalThis.localStorage,
        isSecureContext: true,
        PushManager: function () {},
        Notification: {
          requestPermission() {
            prompts++;
          },
        },
        navigator: { serviceWorker: { ready: new Promise(() => {}) } },
      };
      const prepared = prepareBrowserExternalPlaybackLaunch({
        runtime,
        player: "outplayer",
        platform: "ios",
        mediaUrl: "https://media.fixture.invalid/original.mp4",
        progressContext: { itemId: "fixture:original" },
        profileId: "1",
      });
      const push = await enableBrowserPushReturn({
        runtime,
        fetchImpl: globalThis.fetch,
      });
      return {
        capabilities: getSidecarCapabilities(),
        authError,
        debridError: debrid.data.error,
        automatic: prepared.automatic,
        manual: prepared.handoff.manualPromptEligible,
        callback: prepared.launch.href.includes("/api/external-return"),
        push: push.state,
        prompts,
        requests,
      };
    } finally {
      globalThis.fetch = previous;
    }
  });
  expect(result).toEqual({
    capabilities: {
      traktAuth: false,
      traktBridge: false,
      debrid: false,
      externalReturn: false,
      nativeMedia: false,
    },
    authError: "SIDECAR_UNAVAILABLE",
    debridError: "SIDECAR_UNAVAILABLE",
    automatic: false,
    manual: true,
    callback: false,
    push: "server-not-configured",
    prompts: 0,
    requests: [],
  });
});
