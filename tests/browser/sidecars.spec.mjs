import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === "http://127.0.0.1:4371")
      await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test("static bundled settings hide integrations that need a sidecar, without sidecar requests", async ({
  page,
}) => {
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
  // Trakt sign-in is off on this build, so its row is not shown at all;
  // Simkl works from the browser and stays.
  await expect(
    page.locator('[data-focus-key="tracking:desktop:simkl"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-focus-key="tracking:desktop:trakt"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator('#settings [data-focus-key="nav:integration"]').click();
  // Every Debrid provider needs the bridge, so the whole entry is hidden.
  await expect(
    page.locator('[data-focus-key="integration:hub:tmdb"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-focus-key="integration:hub:debrid"]'),
  ).toHaveCount(0);
  // No "unavailable on this site" explanations are left anywhere.
  await expect(page.locator("[data-sidecar-status]")).toHaveCount(0);
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
      externalReturnOrigin: "",
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
