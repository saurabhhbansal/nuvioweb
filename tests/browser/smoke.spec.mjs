import { test, expect } from "@playwright/test";
import { enterPastStartup, installFakeAccount, openSignedInHome, signInWithFakeAccount } from "./fakeAccount.mjs";
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

test("signed-in user navigates core screens and keeps the session and screen on reload", async ({ page, context },testInfo) => {
  const failures=[];page.on("pageerror",(error)=>failures.push(error.message));
  const account = await installFakeAccount(context);
  await openSignedInHome(page, { expect });
  for (const [label,screen] of [["Search","search"],["Library","library"],["Settings","settings"]]) {
    await page.getByRole("button", {name:label,exact:true}).click();
    await expect(page.locator(`#${screen}`)).toBeVisible();
  }
  await page.screenshot({path:testInfo.outputPath("signed-in-settings.png")});
  await page.reload();
  // The one profile was chosen before, so the reload goes straight back in.
  await expect(page.locator("#settings")).toBeVisible();
  await expect(page.locator("#account .desktop-auth-card")).toHaveCount(0);
  expect(account.unexpected).toEqual([]);
  expect(failures).toEqual([]);
});

test("sign-in offers no way in without an account", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#account .desktop-auth-card")).toBeVisible();
  await expect(page.getByText("Continue without account")).toHaveCount(0);
  await expect(page.locator('[data-action="continueGuest"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Sign in with QR", exact: true }).click();
  await expect(page.locator("#account .qr-layout")).toBeVisible();
  await expect(page.getByText("Continue without account")).toHaveCount(0);
  await expect(page.locator("#qr-back-btn")).toHaveCount(0);
  // Back from QR sign-in returns to the email form, never into the app.
  await page.locator("#qr-browser-back-btn").click();
  await expect(page.locator("#account .desktop-auth-card")).toBeVisible();
});

test("signed out, Home, a title, Settings and a leftover guest flag all land on sign-in", async ({ page, context }) => {
  // What a former guest left behind: the old bypass flag and local data.
  await context.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("skipAuthQrGate", "true");
    localStorage.setItem("hasSeenAuthQrOnFirstLaunch", "true");
    localStorage.setItem("hasEverSelectedProfile", "true");
    localStorage.setItem("profiles", JSON.stringify([{ id: "1", profileIndex: 1, name: "Old guest", isPrimary: true }]));
    localStorage.setItem("installedAddonUrls", JSON.stringify({ __profileScoped: true, version: 1, profiles: { "1": ["http://127.0.0.1:4373/basic"] } }));
  });
  const settled = () => page.evaluate(() => window.__NUVIO_CURRENT_ROUTE__ || null);
  for (const path of ["/", "/#/library", "/#/detail/movie/fixture%3Aoriginal", "/#/settings"]) {
    await page.goto(path);
    await expect(page.locator("#account .desktop-auth-card")).toBeVisible();
    await expect.poll(settled).toBe("authSignIn");
    await expect(page.locator("#home")).toBeHidden();
    await expect(page.locator("#detail")).toBeHidden();
    await expect(page.locator("#settings")).toBeHidden();
  }
  expect(await page.evaluate(() => localStorage.getItem("skipAuthQrGate"))).toBeNull();
  // Local data is left alone while signed out.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("profiles"))[0].name)).toBe("Old guest");
  // A navigation that slips through while signed out is refused as well.
  await page.evaluate(() => { location.hash = "#/settings"; });
  await expect.poll(settled).toBe("authSignIn");
  await expect(page.locator("#settings")).toBeHidden();
});

test("a link opened while signed out opens after sign-in", async ({ page, context }) => {
  await installFakeAccount(context, { signedIn: false });
  await page.goto("/#/settings");
  await expect(page.locator("#account .desktop-auth-card")).toBeVisible();
  await signInWithFakeAccount(page);
  await enterPastStartup(page, { expect });
  await expect(page.locator("#settings")).toBeVisible();
});
