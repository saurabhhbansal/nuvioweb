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
    screen.showStartupError("SECRET_SENTINEL", { detail: "SECRET_SENTINEL", details: ["SECRET_SENTINEL"] });
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
});
