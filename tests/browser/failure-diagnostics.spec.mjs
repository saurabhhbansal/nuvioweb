import { test, expect } from "@playwright/test";

test("failure overlay renders bounded reason, next action and redacted downloadable JSON", async ({ page }) => {
  await page.goto("/__fixture/harness");
  await page.evaluate(async () => {
    await import("/__fixture/source/js/ui/navigation/router.js");
    const { PlayerScreen } = await import("/__fixture/source/js/ui/screens/player/playerScreen.js");
    const screen = Object.create(PlayerScreen);
    const overlay = document.createElement("div");
    document.body.append(overlay);
    screen.uiRefs = { startupErrorOverlay: overlay };
    screen.canOpenInExternalPlayer = () => false;
    screen.getFailureDiagnosticInput = () => ({ engine: "native-file", readyState: 0, networkState: 3,
      mediaErrorCode: 4, descriptor: {}, detail: "https://private.invalid/?token=SECRET_SENTINEL", title: "SECRET_SENTINEL" });
    for (const method of ["stopLoadingLogoFillAnimation", "clearPlaybackStallGuard", "clearBufferingSpinnerTimer", "releaseStartupAudioGate", "updateLoadingVisibility", "renderControlButtons", "renderSourcesPanel", "renderSubtitleDialog", "renderAudioDialog", "renderSpeedDialog", "renderEpisodePanel", "renderPauseOverlay", "focusStartupErrorButton"]) screen[method] = () => {};
    window.__fixtureScreen = screen;
    // No message from the caller: the diagnostic explanation is the fallback.
    screen.showStartupError("", { detail: "SECRET_SENTINEL" });
  });
  await expect(page.locator(".player-startup-error-message")).toContainText("did not expose why");
  await expect(page.locator(".player-startup-error-details")).toContainText("Reason: unknown-at-transport/startup");
  await expect(page.locator(".player-startup-error-details")).toContainText("Confidence: unknown");
  await expect(page.locator(".player-startup-error-next-action")).toContainText("Go Back to refresh sources");
  await expect(page.locator("body")).not.toContainText("SECRET_SENTINEL");
  await expect(page.locator('[data-player-error-action="external-player"]')).toHaveCount(0);
  const link = page.getByRole("link", { name: "Export redacted diagnostics" });
  const report = JSON.parse(decodeURIComponent((await link.getAttribute("href")).split(",").slice(1).join(",")));
  expect(report.cause).toBe("unknown-at-transport/startup");
  expect(report.observed.readyState).toBe(0);
  expect(JSON.stringify(report)).not.toContain("SECRET_SENTINEL");
  await link.focus();
  const download = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  expect((await download).suggestedFilename()).toBe("nuvio-playback-diagnostic.json");

  // A cause named by the caller (here a debrid message) is shown, not replaced.
  await page.evaluate(() => window.__fixtureScreen.showStartupError("Not cached on your Debrid account.", { detail: "SECRET_SENTINEL" }));
  await expect(page.locator(".player-startup-error-message")).toHaveText("Not cached on your Debrid account.");
  await expect(page.locator(".player-startup-error-details")).toContainText("Reason: unknown-at-transport/startup");
  await expect(page.locator("body")).not.toContainText("SECRET_SENTINEL");
});


test("header diagnosis coexists with the real blocked-handoff dialog and export follows existing actions", async ({ page, context }) => {
  const provider = "http://127.0.0.1:4373";
  await context.route("**/*", route => ["http://127.0.0.1:4371", provider].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort("blockedbyclient"));
  await context.addInitScript(provider => localStorage.setItem("installedAddonUrls", JSON.stringify({ __profileScoped: true, version: 1, profiles: { 1: [`${provider}/startup-header-required`] } })), provider);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator('[data-action="continueGuest"]').click();
  await page.locator('#home .home-poster-card[data-item-id="fixture:original"]').first().click();
  await page.locator('button[data-action="playDefault"]').click();
  await page.locator('[data-action="playStream"]').click();
  const overlay = page.locator("#playerStartupErrorOverlay");
  await expect(overlay).toHaveAttribute("aria-hidden", "false");
  await expect(overlay.locator(".player-startup-error-message")).toContainText("requires special request headers");
  await expect(overlay).toContainText("Reason: header-required");
  await expect(overlay.locator(".player-startup-error-next-action")).toContainText("own header-capable proxy");
  const external = overlay.getByRole("button", { name: "Open in another player", exact: true });
  const exported = overlay.getByRole("link", { name: "Export redacted diagnostics" });
  await overlay.getByRole("button", { name: "Go Back", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(external).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText("requires request headers");
  // URL-only launch/copy/download stay visible but disabled.
  await expect(dialog).toContainText("Needs headers");
  await expect(dialog.locator("button:not([disabled])")).toHaveCount(1);
  await expect(overlay).toContainText("Reason: header-required");
  await expect(exported).toHaveCount(1);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(overlay).toHaveAttribute("aria-hidden", "false");
  await external.focus();
  await page.keyboard.press("Tab");
  await expect(exported).toBeFocused();
  const download = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  expect((await download).suggestedFilename()).toBe("nuvio-playback-diagnostic.json");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(overlay).toContainText("Reason: header-required");
});
