import { test, expect } from "@playwright/test";
import { installFakeAccount, openSignedInHome } from "./fakeAccount.mjs";

// Source labels from a header check in the browser. The fixture add-on lists
// original multi-audio clips (tests/fixtures/media/multi-audio) served with
// CORS range reads, one copy on a host without CORS, and one source that needs
// request headers.
test.skip(({ browserName }) => browserName === "webkit", "Safari lists a file's tracks itself");

const provider = "http://127.0.0.1:4373";

test.beforeEach(async ({ context, request }) => {
  await request.delete(`${provider}/__fixture/requests`);
  await context.route("**/*", async (route) => {
    if (["http://127.0.0.1:4371", provider].includes(new URL(route.request().url()).origin))
      await route.continue();
    else await route.abort("blockedbyclient");
  });
  await context.addInitScript((provider) => {
    localStorage.setItem(
      "installedAddonUrls",
      JSON.stringify({ __profileScoped: true, version: 1, profiles: { 1: [`${provider}/playability`] } })
    );
  }, provider);
  await installFakeAccount(context, { addons: [`${provider}/playability`] });
});

async function openSources(page) {
  await openSignedInHome(page, { expect });
  await page.locator('#home .home-poster-card[data-item-id="fixture:original"]').first().click();
  await page.locator('button[data-action="playDefault"]').click();
  const sources = page.locator('[data-action="playStream"]');
  await expect(sources).toHaveCount(5);
  return (name) => sources.filter({ hasText: name }).locator(".stream-route-source-hint");
}

test("source cards say what this browser will do with each file", async ({ page, request }) => {
  const hint = await openSources(page);
  const converts = await page.evaluate(async () =>
    (await import("/js/core/player/remux/remuxAudio.js").catch(() => null))?.canTranscodeInThisBrowser?.() ??
    (typeof AudioEncoder === "function" &&
      (await AudioEncoder.isConfigSupported({ codec: "opus", sampleRate: 48000, numberOfChannels: 2 })).supported)
  );

  await expect(hint("aac-first")).toHaveText("Plays here");
  await expect(hint("aac-first")).toHaveAttribute("data-source-hint-tone", "positive");
  await expect(hint("aac-first")).toHaveAttribute("title", "H.264 · AAC");
  await expect(hint("ac3-first")).toHaveText(converts ? "Audio converted" : "Change audio track");
  await expect(hint("ac3-only")).toHaveText(converts ? "Audio converted" : "No sound here");
  // A link problem outranks the header; a host without CORS gets no label.
  await expect(hint("needs-headers")).toHaveText("Needs headers");
  await expect(hint("no-cors")).toHaveCount(0);

  // Header reads only, never a whole file, and never the header-restricted source.
  const requests = await (await request.get(`${provider}/__fixture/requests`)).json();
  const media = requests.filter((entry) => entry.path.includes("/multi-audio/"));
  expect(media.some((entry) => entry.path.endsWith("multi-audio.webm"))).toBe(false);
  expect(media.length).toBeLessThan(40);
});

test("turning the check off removes the labels and the reads", async ({ page, request, context }) => {
  await context.addInitScript(() =>
    localStorage.setItem(
      "streamBadgeSettings",
      JSON.stringify({ __profileScoped: true, version: 1, profiles: { 1: { checkPlayability: false } } })
    )
  );
  const hint = await openSources(page);
  await expect(hint("needs-headers")).toHaveText("Needs headers");
  await page.waitForTimeout(1500);
  await expect(page.locator(".stream-route-source-hint")).toHaveCount(1);
  const requests = await (await request.get(`${provider}/__fixture/requests`)).json();
  expect(requests.some((entry) => entry.path.includes("/multi-audio/"))).toBe(false);
});
