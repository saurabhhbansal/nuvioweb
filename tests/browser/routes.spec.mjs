import { test, expect } from "@playwright/test";

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

async function continueAsGuest(page) {
  await page.locator('[data-action="continueGuest"]').click();
}

const detailPlay = (page) => page.locator('#detail button[data-action="playDefault"]');

test("reloading a detail page stays on it and Back returns Home", async ({ page }) => {
  await page.goto("/");
  await continueAsGuest(page);
  await expect(page).toHaveURL(/#\/$/);
  await page.locator('#home .home-poster-card[data-item-id="fixture:original"]').first().click();
  await expect(detailPlay(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${detailHash.replace(/[/%]/g, "\\$&")}$`));

  await page.reload();
  // A reload runs the normal profile step first; the link waits for it.
  await page.locator('#profileSelection [data-profile-id="1"]').click();
  await page.getByRole("button", { name: "Skip setup", exact: true }).click();
  await expect(detailPlay(page)).toBeVisible();
  await expect(page.locator("#detail")).toContainText("Original Legal Fixture");
  expect(new URL(page.url()).hash).toBe(detailHash);

  // Again, now that setup is done: profile choice goes straight to the title.
  await page.reload();
  await page.locator('#profileSelection [data-profile-id="1"]').click();
  await expect(detailPlay(page)).toBeVisible();
  await expect(page.locator("#profileSelection")).toBeHidden();
  expect(new URL(page.url()).hash).toBe(detailHash);

  await page.goBack();
  await expect(page.locator('#home .home-poster-card[data-item-id="fixture:original"]').first()).toBeVisible();
  expect(new URL(page.url()).hash).toBe("#/");
});

test("a shared title link opens that title after the sign-in step", async ({ page }) => {
  await page.goto(`/${detailHash}`);
  await continueAsGuest(page);
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
