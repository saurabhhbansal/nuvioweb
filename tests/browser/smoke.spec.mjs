import { test, expect } from "@playwright/test";
test.beforeEach(async ({ context }) => {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && url.port === "4371") await route.continue();
    else await route.abort("blockedbyclient");
  });
});
test("built application starts and renders the signed-out form without an uncaught exception", async ({ page },testInfo) => {
  const failures=[]; page.on("pageerror",(error)=>failures.push(error.message));
  await page.goto("/");
  await expect(page.locator("#account .desktop-auth-card")).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByText("Nuvio failed to start",{exact:true})).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath("startup.png")});
  expect(failures).toEqual([]);
});

test("first load uses same-origin fonts and draws icons as glyphs, not words", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");
  const icon = page.locator("#account .desktop-auth-input-icon").first();
  await expect(icon).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('24px "Material Icons"'))).toBe(true);
  // "mail_outline" set as text is several times wider than it is tall.
  const box = await icon.boundingBox();
  expect(box.width).toBeLessThan(box.height * 2);
  expect(requests.filter((url) => !url.startsWith("http://127.0.0.1:4371/"))).toEqual([]);
  // Screens outside sign-in are not part of the first load.
  expect(requests.some((url) => /\/chunks\/playerScreen-/.test(url))).toBe(false);
});

test("empty sign-in submits an actionable validation error", async ({ page }) => {
  await page.goto("/");
  await page.locator('.desktop-auth-submit').click();
  await expect(page.getByRole("alert")).toHaveText("Enter your email address and password.");
});

test("unreachable backend reports failure and re-enables sign-in", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="email"]').fill("smoke@example.invalid");
  await page.locator('input[type="password"]').fill("fixture-password-not-a-real-account");
  await page.locator('.desktop-auth-submit').click();
  await expect(page.getByRole("alert")).toHaveText("Sign-in failed. Check your email and password.");
  await expect(page.locator('.desktop-auth-submit')).toBeEnabled();
});

async function enterGuest(page) {
  await page.goto("/");
  await page.locator('[data-action="continueGuest"]').click();
  await expect(page.locator('#home')).toBeVisible();
}

test("guest navigates core screens and retains guest mode/profile choices on reload", async ({ page },testInfo) => {
  const failures=[];page.on("pageerror",(error)=>failures.push(error.message));
  await enterGuest(page);
  for (const [label,screen] of [["Search","search"],["Library","library"],["Settings","settings"]]) {
    await page.getByRole("button", {name:label,exact:true}).click();
    await expect(page.locator(`#${screen}`)).toBeVisible();
  }
  await page.screenshot({path:testInfo.outputPath("guest-settings.png")});
  await page.reload();
  await expect(page.locator('#profileSelection')).toBeVisible();
  await expect(page.locator('#profileSelection [data-profile-id="1"]')).toContainText("Profile 1");
  expect(failures).toEqual([]);
});
