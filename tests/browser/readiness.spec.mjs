import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) => ["http://127.0.0.1:4371", "http://127.0.0.1:4373"].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort("blockedbyclient"));
});

test("bundled startup notice is keyboard accessible, responsive and dismissible without checking", async ({ page }, info) => {
  await page.goto("/");
  const banner = page.getByRole("complementary", { name: "Check this browser" });
  await expect(banner).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(banner).toBeInViewport();
    expect(await banner.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`readiness-${width}.png`) });
  }
  // The narrow notice must not intercept guest continuation.
  await page.locator('[data-action="continueGuest"]').click({ trial: true });
  await banner.getByRole("button", { name: "Check", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(banner.getByRole("button", { name: "Continue without checking" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(banner).toHaveCount(0);
  await expect(page.locator('[data-action="continueGuest"]')).toBeVisible();
});

test("real browser predictions are labelled, Details is native keyboard disclosure, Escape dismisses", async ({ page }) => {
  await page.goto("/");
  const banner = page.getByRole("complementary", { name: "Check this browser" });
  await banner.getByRole("button", { name: "Check", exact: true }).click();
  await expect(banner.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
  const details = banner.locator("summary");
  await details.focus(); await page.keyboard.press("Enter");
  await expect(banner).toContainText("Observed playback: not-tested");
  await expect(banner).toContainText("physical HDR/HEVC Main10 display output: unknown");
  await expect(banner).toContainText("fix CORS");
  await expect(banner.getByRole("button", { name: "Keep site data" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(banner).toHaveCount(0);
});

test("synthetic denied storage and failed detection do not request unrelated permissions or block UI", async ({ page }) => {
  await page.goto("/__fixture/harness");
  await page.evaluate(async () => {
    const { mountBrowserCapabilityBanner } = await import("/__fixture/source/js/ui/components/browserCapabilityBanner.js");
    let calls = 0;
    globalThis.__readinessCalls = () => calls;
    mountBrowserCapabilityBanner({
      environment: { navigator: { storage: { persist: async () => { calls++; return false; } } } },
      detect: async () => { throw new Error("fixture denial"); }
    });
  });
  const banner = page.getByRole("complementary");
  await banner.getByRole("button", { name: "Check", exact: true }).click();
  await expect(banner).toContainText("could not finish");
  expect(await page.evaluate(() => globalThis.__readinessCalls())).toBe(0);
  await banner.locator("summary").click();
  await banner.getByRole("button", { name: "Keep site data" }).click();
  await expect(banner).toContainText("did not grant persistent storage");
  expect(await page.evaluate(() => globalThis.__readinessCalls())).toBe(1);
  await banner.getByRole("button", { name: "Continue without checking" }).click();
  await expect(banner).toHaveCount(0);
});

test("ordinary original-fixture playback works with readiness unanswered and notice hides on player", async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem("installedAddonUrls", JSON.stringify({ __profileScoped: true, version: 1, profiles: { 1: ["http://127.0.0.1:4373/declared"] } })));
  await page.goto("/");
  await page.locator('[data-action="continueGuest"]').click();
  await page.locator('#home .home-poster-card[data-item-id="fixture:original"]').first().click();
  await page.locator('button[data-action="playDefault"]').click();
  await page.locator('[data-action="playStream"]').click();
  await expect(page.locator(".browser-capability-banner")).toBeHidden();
  await expect.poll(() => page.locator("video").evaluate((video) => video.currentTime)).toBeGreaterThan(0.1);
  expect(await page.locator("video").evaluate((video) => video.currentSrc)).toBe("http://127.0.0.1:4373/media/procedural-vp8-opus.webm");
});
