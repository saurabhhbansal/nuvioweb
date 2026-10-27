// Manual check of the deployed dev preview. Not run in CI.
// Usage: node scripts/verify-preview.mjs <local staging directory>
// Checks served file hashes/headers against the staged manifest, the service
// worker and signed-in shell, then the same-host legal demo playback journey.
// Every third-party request is blocked. The app needs an account, so the
// preview's account backend is answered by the browser tests' fake account:
// no real account is used and the real service is never contacted.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { enterPastStartup, installFakeAccount, openSignedInHome } from "../tests/browser/fakeAccount.mjs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";

const url = new URL(process.env.NUVIO_PREVIEW_URL || "https://nuvioweb-preview.pages.dev");
if (!/^https:\/\/(?:[a-z0-9-]+\.)?nuvioweb-preview\.pages\.dev\/$/.test(url.href)) throw new Error("Only the dedicated HTTPS preview project is allowed");
const origin = url.origin;
if (!process.argv[2]) throw new Error("Pass the reviewed local staging directory");
const artifact = resolve(process.argv[2]);
const manifest = JSON.parse(await readFile(join(artifact,"preview-manifest.json"),"utf8"));
const revision = manifest.revision;

async function checkServedFiles() {
  for (const path of ["index.html","app.bundle.js","sw.js","nuvio.env.js","SOURCE.txt","LICENSE.txt","UPSTREAM_SOURCES.md","third-party/dashjs/dist/dash.all.min.js.LICENSE.txt","assets/fonts/Inter-OFL.txt","assets/fonts/MaterialIcons-LICENSE.txt","third-party/jszip/LICENSE.markdown"]) {
    const response = await fetch(`${origin}/${path}`,{signal:AbortSignal.timeout(20000)});
    assert.equal(response.status,200,path);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(createHash("sha256").update(bytes).digest("hex"),manifest.files.find((entry)=>entry.path === path)?.sha256,path);
    const cacheControl = response.headers.get("cache-control");
    assert.match(cacheControl,/no-cache/);
    if (["sw.js","nuvio.env.js"].includes(path)) assert.match(cacheControl,/no-store/);
    assert.equal(response.headers.get("x-content-type-options"),"nosniff");
    if (path === "index.html") {
      const csp = response.headers.get("content-security-policy") || "";
      for (const directive of ["default-src 'self'","object-src 'none'","base-uri 'self'","frame-ancestors 'none'"]) assert.ok(csp.includes(directive),`CSP lacks ${directive}`);
      assert.ok(!/script-src[^;]*'unsafe-(inline|eval)'/.test(csp),"app CSP must not allow inline script or eval");
      assert.equal(response.headers.get("cross-origin-opener-policy"),"same-origin");
    }
  }
  // Only the plugin worker may eval, and it carries that one policy, not two.
  const workerCsp = (await fetch(`${origin}/plugin-worker.bundle.js`,{signal:AbortSignal.timeout(20000)})).headers.get("content-security-policy") || "";
  assert.match(workerCsp,/script-src 'self' 'unsafe-eval'/);
  assert.ok(!workerCsp.includes("frame-ancestors"),"plugin worker CSP was merged with the app CSP");
  for (const path of ["/missing.js","/api/unavailable"]) assert.equal((await fetch(origin+path,{signal:AbortSignal.timeout(20000)})).status,404,path);
  assert.equal((await fetch(`https://github.com/saurabhhbansal/nuvioweb/tree/${manifest.revision}`,{signal:AbortSignal.timeout(20000)})).status,200,"matching source URL");
  const source = await fetch(`${origin}/SOURCE.txt`, { signal: AbortSignal.timeout(20000), redirect: "error" });
  assert.ok((await source.text()).includes(`/tree/${revision}`), "Deployed source mismatch");
}

// The backend origin this deploy was built against, from its runtime config.
async function previewIdentityOrigin() {
  const config = await (await fetch(`${origin}/nuvio.env.js`, { signal: AbortSignal.timeout(20000) })).text();
  const match = config.match(/NUVIO_SUPABASE_URL\s*:\s*"(https:\/\/[^"]+)"/);
  assert.ok(match, "nuvio.env.js names no account backend");
  return new URL(match[1]).origin;
}
const identityOrigin = await previewIdentityOrigin();

async function checkShell(browser) {
  const context = await browser.newContext({serviceWorkers:"allow"});
  const blockedExternalOrigins = new Set();
  await context.route("**/*",async (route)=> {
    const requestOrigin = new URL(route.request().url()).origin;
    if (requestOrigin === origin) await route.continue();
    else { blockedExternalOrigins.add(requestOrigin); await route.abort("blockedbyclient"); }
  });
  const page = await context.newPage();
  const pageErrors = []; page.on("pageerror",(error)=>pageErrors.push(error.message));
  await page.goto(`${origin}/`);
  await expect(page.locator("#account .desktop-auth-card")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),{timeout:45000}).toBe(true);
  const cacheNames = await page.evaluate(()=>caches.keys());
  assert.ok(cacheNames.some((key)=>key.startsWith("nuvio-app-shell-")));
  // No way in without an account.
  await expect(page.locator('[data-action="continueGuest"]')).toHaveCount(0);
  await installFakeAccount(context,{identityOrigin});
  await openSignedInHome(page,{expect,path:`${origin}/`});
  for (const [label,screen] of [["Search","search"],["Library","library"],["Settings","settings"]]) {
    await page.getByRole("button",{name:label,exact:true}).click();
    await expect(page.locator(`#${screen}`)).toBeVisible();
  }
  await page.reload();
  await expect(page.locator("#settings")).toBeVisible();
  assert.deepEqual(pageErrors,[]);
  const aliasPage = await context.newPage(); await aliasPage.goto(`${origin}/library`);
  await enterPastStartup(aliasPage,{expect});
  await expect(aliasPage.locator("#library")).toBeVisible();
  await context.close();
}

async function checkPlaybackJourney(browser) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", async route => {
    if (new URL(route.request().url()).origin === origin) await route.continue();
    else await route.abort("blockedbyclient");
  });
  await installFakeAccount(context, { identityOrigin });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", () => errors.push("UNCAUGHT_PAGE_ERROR"));
  const settings = async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.locator('[data-focus-key="nav:contentDiscovery"]').click();
    await page.locator('[data-focus-key="contentDiscovery:addons"]').click();
  };
  await openSignedInHome(page, { expect, path: origin });
  await settings();
  await page.locator("#desktop-addon-url").fill(`${origin}/demo/manifest.json`);
  await page.getByRole("button", { name: "Add Addon", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Synced");
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
  await enterPastStartup(page, { expect });
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator('#home .home-poster-card[data-item-id="nuvioweb-demo-original"]').first()).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.locator('#library .library-grid-card[data-item-id="nuvioweb-demo-original"]')).toBeVisible();
  assert.deepEqual(errors, []);
  await context.close();
}

await checkServedFiles();
const browser = await chromium.launch();
try {
  await checkShell(browser);
  await checkPlaybackJourney(browser);
  console.log(`Preview ${origin} at ${revision} passed: served files, worker/signed-in shell and legal demo journey (${browser.version()}).`);
} finally {
  await browser.close();
}
