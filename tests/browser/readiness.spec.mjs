import { test, expect } from "@playwright/test";

const provider = "http://127.0.0.1:4373";
test.beforeEach(async ({ context, request }) => {
  await request.delete(`${provider}/__fixture/requests`);
  await context.route("**/*", (route) => ["http://127.0.0.1:4371", provider].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort("blockedbyclient"));
});

async function appGeometry(page) {
  return page.locator("#app").evaluate((app) => [...app.querySelectorAll("button, input, a[href], summary, [tabindex='0']")]
    .filter((node) => node.getClientRects().length)
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return [rect.x + scrollX, rect.y + scrollY, rect.width, rect.height].map((value) => Math.round(value * 100) / 100);
    }));
}

async function expectSeparateFooter(page) {
  expect(await page.locator(".browser-capability-banner").evaluate((notice) => {
    const app = document.getElementById("app");
    return getComputedStyle(notice).position === "static" && notice.getBoundingClientRect().top >= app.getBoundingClientRect().bottom;
  })).toBe(true);
}

test("startup footer never moves app controls and remains keyboard accessible at both widths", async ({ page }, info) => {
  await page.goto("/");
  const banner = page.getByRole("complementary", { name: "Check this browser" });
  await expect(banner).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    // Measure each causal layout mutation in one browser task: separate RPCs
    // can sample different frames of the app's independent startup motion.
    const geometry = await banner.evaluate((node) => {
      const snapshot = () => [...document.querySelectorAll("#app button, #app input, #app a[href], #app summary, #app [tabindex='0']")]
        .filter((control) => control.getClientRects().length)
        .map((control) => {
          const rect = control.getBoundingClientRect();
          return [rect.x + scrollX, rect.y + scrollY, rect.width, rect.height].map((value) => Math.round(value * 100) / 100);
        });
      const original = snapshot();
      node.hidden = true;
      const hidden = snapshot();
      node.hidden = false;
      node.querySelector("details").open = true;
      return { original, hidden, expanded: snapshot() };
    });
    expect(geometry.hidden).toEqual(geometry.original);
    expect(geometry.expanded).toEqual(geometry.original);
    await expectSeparateFooter(page);
    await banner.evaluate((node) => { node.querySelector("details").open = false; });
    await banner.scrollIntoViewIfNeeded();
    await expect(banner).toBeInViewport();
    expect(await banner.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`readiness-${width}.png`) });
    await page.locator('[data-action="continueGuest"]').click({ trial: true });
  }
  const beforeDismissal = await appGeometry(page);
  await banner.getByRole("button", { name: "Check", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(banner.getByRole("button", { name: "Continue without checking" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(banner).toHaveCount(0);
  expect(await appGeometry(page)).toEqual(beforeDismissal);
  await expect(page.locator('[data-action="continueGuest"]')).toBeVisible();
});

test("real browser predictions are labelled, Details is native keyboard disclosure, Escape dismisses", async ({ page }) => {
  await page.goto("/");
  const banner = page.getByRole("complementary", { name: "Check this browser" });
  await banner.getByRole("button", { name: "Check", exact: true }).click();
  await expect(banner.getByRole("status", { name: "Browser readiness result", exact: true })).toContainText(/predicts|uncertain|unavailable/);
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
  await expect(banner.getByRole("status", { name: "Browser readiness result", exact: true })).toContainText("could not finish");
  expect(await page.evaluate(() => globalThis.__readinessCalls())).toBe(0);
  await banner.locator("summary").click();
  await banner.getByRole("button", { name: "Keep site data" }).click();
  await expect(banner.getByRole("status", { name: "Site data persistence result", exact: true })).toContainText("did not grant persistent storage");
  expect(await page.evaluate(() => globalThis.__readinessCalls())).toBe(1);
  await banner.getByRole("button", { name: "Continue without checking" }).click();
  await expect(banner).toHaveCount(0);
});

for (const width of [1280, 390]) for (const dismissed of [false, true]) {
  test(`stream retry and original playback remain operable at ${width}px with notice ${dismissed ? "dismissed" : "present and expanded"}`, async ({ page, context, request }) => {
    await page.setViewportSize({ width, height: 844 });
    await context.addInitScript((provider) => localStorage.setItem("installedAddonUrls", JSON.stringify({ __profileScoped: true, version: 1, profiles: { 1: [`${provider}/declared`, `${provider}/partial`] } })), provider);
    await page.goto("/");
    const banner = page.getByRole("complementary", { name: "Check this browser" });
    if (dismissed) await banner.getByRole("button", { name: "Continue without checking" }).click();
    else await banner.locator("summary").click();
    await page.locator('[data-action="continueGuest"]').click();
    await page.locator('#home .home-poster-card[data-item-id="fixture:original"]').first().click();
    await page.locator('button[data-action="playDefault"]').click();
    const original = page.locator(`[data-action="playStream"][data-stream-id="Legal Fixture-0-${provider}/media/procedural-vp8-opus.webm"]`);
    await expect(original).toHaveCount(1);
    await expect(page.getByRole("status").filter({ hasText: "Partial Provider Fixture" })).toContainText("No playable results");
    if (!dismissed) { await expectSeparateFooter(page); await expect(banner.locator("details")).toHaveAttribute("open", ""); }
    await request.post(`${provider}/__fixture/partial-recovery`);
    // Real clicks, no force, injected dismissal, or pointer-events workaround.
    await page.getByRole("button", { name: "Refresh sources", exact: true }).click();
    await expect(page.locator('[data-action="playStream"]')).toHaveCount(2);
    await original.click();
    if (!dismissed) await expect(banner).toBeHidden();
    await expect.poll(() => page.locator("video").evaluate((video) => video.currentTime)).toBeGreaterThan(0.1);
    expect(await page.locator("video").evaluate((video) => video.currentSrc)).toBe(`${provider}/media/procedural-vp8-opus.webm`);
  });
}
