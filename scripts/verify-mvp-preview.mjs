import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// Explicitly invoked after an approved upload. Disposable guest context only;
// no credentials, tokens, service accounts or third-party provider requests.
const origin = "https://nuvioweb-preview.pages.dev";
const revision = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(revision || "")) throw new Error("Pass the approved deployed source SHA");
const source = await fetch(`${origin}/SOURCE.txt`, { signal: AbortSignal.timeout(20000), redirect: "error" });
assert.equal(source.status, 200);
assert.ok((await source.text()).includes(`/tree/${revision}`), "Deployed source mismatch");
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", async route => {
    if (new URL(route.request().url()).origin === origin) await route.continue();
    else await route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", () => errors.push("UNCAUGHT_PAGE_ERROR"));
  const settings = async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.locator('[data-focus-key="nav:contentDiscovery"]').click();
    await page.locator('[data-focus-key="contentDiscovery:addons"]').click();
  };
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.locator('[data-action="continueGuest"]').click();
  await settings();
  await page.locator("#desktop-addon-url").fill(`${origin}/demo/manifest.json`);
  await page.getByRole("button", { name: "Add Addon", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.locator('#home .home-poster-card[data-item-id="nuvioweb-demo-original"]').first().click();
  await expect(page.getByRole("heading", { name: "NuvioWeb legal demo", exact: true })).toBeVisible();
  await page.locator('[data-action="toggleLibrary"]').click();
  await expect(page.locator('[data-action="toggleLibrary"]')).toHaveClass(/is-library-selected/);
  await page.locator('button[data-action="playDefault"]').click();
  await page.locator('[data-action="playStream"]').filter({ hasText: "Original VP8/Opus demo" }).click();
  const video = page.locator("video");
  await expect.poll(() => video.evaluate(video => ({ width: video.videoWidth, height: video.videoHeight, error: video.error?.code || null }))).toEqual({ width: 640, height: 360, error: null });
  await expect.poll(() => video.evaluate(video => video.currentTime)).toBeGreaterThan(0.1);
  await page.mouse.move(640, 700);
  await page.locator('[data-action="playPause"]').click();
  await expect.poll(() => video.evaluate(video => video.paused)).toBe(true);
  const progress = page.locator("#playerProgressShell");
  const bounds = await progress.boundingBox();
  assert.ok(bounds);
  await progress.click({ position: { x: bounds.width * 0.25, y: bounds.height / 2 } });
  const duration = await video.evaluate(video => video.duration);
  await expect.poll(() => video.evaluate(video => video.currentTime)).toBeCloseTo(duration * 0.25, 0);
  await page.locator('[data-action="subtitleDialog"]').click();
  const subtitles = page.locator("#playerSubtitleDialog");
  await subtitles.locator('[data-subtitle-rail="language"]').filter({ hasText: "English" }).click();
  await subtitles.locator('[data-subtitle-rail="options"]').first().click();
  await page.keyboard.press("Escape");
  await expect.poll(() => video.evaluate(video => Array.from(video.textTracks).filter(track => track.mode === "showing").flatMap(track => Array.from(track.activeCues || []).map(cue => cue.text)).join("\n"))).toMatch(/Original legal fixture|Second caption/);
  await page.locator('[data-action="playPause"]').click();
  await expect.poll(() => video.evaluate(video => video.paused)).toBe(false);
  await expect.poll(() => video.evaluate(video => video.currentTime)).toBeGreaterThan(duration * 0.25 + 0.1);
  await page.locator('[data-action="playPause"]').click();
  await expect.poll(() => video.evaluate(video => video.paused)).toBe(true);
  await page.locator("[data-player-desktop-back]").click();
  await expect(page.locator('[data-action="playStream"]')).toBeVisible();
  await page.locator("[data-stream-desktop-back]").click();
  await expect(page.locator('[data-action="toggleLibrary"]')).toBeVisible();
  await page.locator("[data-detail-back]").click();
  await expect(page.locator("#home")).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.locator('#library .library-grid-card[data-item-id="nuvioweb-demo-original"]')).toBeVisible();
  await page.reload();
  await page.locator('#profileSelection [data-profile-id="1"]').click();
  await page.getByRole("button", { name: "Skip setup", exact: true }).click();
  await expect(page.locator('#home .home-poster-card[data-item-id="nuvioweb-demo-original"]').first()).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.locator('#library .library-grid-card[data-item-id="nuvioweb-demo-original"]')).toBeVisible();
  assert.deepEqual(errors, []);
  const report = {
    sourceRevision: revision, url: origin, browser: browser.version(), platform: process.platform, architecture: process.arch,
    mode: "actual hosted HTTPS app and optional same-host legal demo; guest; third parties blocked",
    journeys: { guestEntry: "PASS", addonInstallCatalog: "PASS", sourcePlayback: "PASS", pauseSeekResume: "PASS", subtitleActiveCue: "PASS", returnToBrowsing: "PASS", saveReloadPersistence: "PASS" },
    decodedDimensions: [640, 360], uncaughtPageErrors: 0,
    limits: "No real account/service, external-provider CORS, audible/multitrack output, named Chrome/Edge, other browser/mobile or complete offline claim. Automatic-worker verification is separate."
  };
  if (process.env.NUVIO_MVP_REPORT) await writeFile(process.env.NUVIO_MVP_REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
