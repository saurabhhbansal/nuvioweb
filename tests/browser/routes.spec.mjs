import { test, expect } from "@playwright/test";
import { enterPastStartup, installFakeAccount } from "./fakeAccount.mjs";

// Real URLs: reloading a title stays on it, a shared link opens it after the
// normal sign-in step, and Back still works. Local fixtures only.
const provider = "http://127.0.0.1:4373";
const detailHash = "#/detail/movie/fixture%3Aoriginal";

test.beforeEach(async ({ context }) => {
  await context.route("**/*", async (route) => {
    if (["http://127.0.0.1:4371", provider].includes(new URL(route.request().url()).origin))
      await route.continue();
    else await route.abort("blockedbyclient");
  });
  await installFakeAccount(context, { addons: [`${provider}/source-order`] });
  await context.addInitScript(
    (provider) =>
      localStorage.setItem(
        "installedAddonUrls",
        JSON.stringify({
          __profileScoped: true,
          version: 1,
          profiles: { 1: [`${provider}/source-order`] }
        })
      ),
    provider
  );
});

// Signed in already; the profile and setup steps run before any screen.
async function continueSignedIn(page) {
  await enterPastStartup(page, { expect });
}

const detailPlay = (page) => page.locator('#detail button[data-action="playDefault"]');

test("reloading a detail page stays on it and Back returns Home", async ({ page }) => {
  await page.goto("/");
  await continueSignedIn(page);
  await expect(page).toHaveURL(/#\/$/);
  await page.locator('#home .home-poster-card[data-item-id="fixture:original"]').first().click();
  await expect(detailPlay(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${detailHash.replace(/[/%]/g, "\\$&")}$`));

  await page.reload();
  // A reload runs the normal startup steps first; the link waits for them.
  await continueSignedIn(page);
  await expect(detailPlay(page)).toBeVisible();
  await expect(page.locator("#detail")).toContainText("Original Legal Fixture");
  expect(new URL(page.url()).hash).toBe(detailHash);

  // Again, now that the profile was chosen and setup is done: straight to
  // the title.
  await page.reload();
  await expect(detailPlay(page)).toBeVisible();
  await expect(page.locator("#profileSelection")).toBeHidden();
  expect(new URL(page.url()).hash).toBe(detailHash);

  await page.goBack();
  await expect(page.locator('#home .home-poster-card[data-item-id="fixture:original"]').first()).toBeVisible();
  expect(new URL(page.url()).hash).toBe("#/");
});

test("a shared title link opens that title after the sign-in step", async ({ page }) => {
  await page.goto(`/${detailHash}`);
  await continueSignedIn(page);
  await expect(detailPlay(page)).toBeVisible();
  await expect(page.locator("#detail")).toContainText("Original Legal Fixture");
  expect(new URL(page.url()).hash).toBe(detailHash);

  // The source list has a URL of its own, holding IDs only.
  await detailPlay(page).click();
  await expect(page.locator('[data-action="playStream"]').first()).toBeVisible();
  const streamHash = new URL(page.url()).hash;
  expect(streamHash).toBe("#/stream/movie/fixture%3Aoriginal");

  await page.goBack();
  await expect(detailPlay(page)).toBeVisible();
  await page.goBack();
  expect(new URL(page.url()).hash).toBe("#/");
  await expect(page.locator('#home .home-poster-card[data-item-id="fixture:original"]').first()).toBeVisible();
});

test("a shared source-list link shows the title, not Untitled", async ({ page }) => {
  // The link holds IDs only; the screen looks the title up itself.
  await page.goto("/#/stream/movie/fixture%3Aoriginal");
  await continueSignedIn(page);
  await expect(page.locator('[data-action="playStream"]').first()).toBeVisible();
  const title = page.locator("#stream .stream-route-title");
  await expect(title).toHaveText("Original Legal Fixture");
  await expect(page.locator("#stream")).not.toContainText("Untitled");
  await expect(page.locator("#stream .stream-route-backdrop")).toHaveAttribute(
    "style",
    /poster\.svg/
  );
  expect(new URL(page.url()).hash).toBe("#/stream/movie/fixture%3Aoriginal");
});
