import { test, expect } from "@playwright/test";

const signUpUrl = "https://nuvio.tv/account/signup";

test.beforeEach(async ({ context }) => {
  // No real network: nuvio.tv is answered with a stub so the new tab can load.
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && url.port === "4371") return route.continue();
    if (url.origin === "https://nuvio.tv") {
      return route.fulfill({ status: 200, contentType: "text/html", body: "<title>stub</title>" });
    }
    return route.abort("blockedbyclient");
  });
});

test("the sign-in screen offers Sign up on nuvio.tv with a come-back hint", async ({ page }) => {
  await page.goto("/");
  const link = page.locator("#account .desktop-auth-signup-link");
  await expect(link).toBeVisible();
  await expect(link).toHaveAccessibleName("Sign up");
  expect(await link.evaluate((anchor) => ({ href: anchor.href, target: anchor.target, rel: anchor.rel }))).toEqual({
    href: signUpUrl,
    target: "_blank",
    rel: "noopener noreferrer"
  });
  await expect(page.locator("#account .desktop-auth-signup-hint")).toHaveText(
    "Opens nuvio.tv in a new tab. Come back here to sign in."
  );
});

test("Sign up sits between QR and Continue without account in focus order and opens from Enter", async ({ page, context }) => {
  await page.goto("/");
  const link = page.locator("#account .desktop-auth-signup-link");
  await expect(page.locator("#account .desktop-auth-signup-prompt")).toHaveCount(0);
  await expect(link).toHaveAttribute("aria-describedby", "desktop-auth-signup-hint");
  await page.locator("#account .desktop-auth-qr").focus();
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#account .desktop-auth-guest")).toBeFocused();
  await link.focus();
  const [popup] = await Promise.all([context.waitForEvent("page"), page.keyboard.press("Enter")]);
  await popup.waitForLoadState("domcontentloaded");
  expect(popup.url()).toBe(signUpUrl);
});

test("Sign up opens nuvio.tv in a new tab without a handle back to this page or any token", async ({ page, context }) => {
  await page.goto("/");
  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page.locator("#account .desktop-auth-signup-link").click()
  ]);
  await popup.waitForLoadState("domcontentloaded");
  // Exactly the sign-up page: no return parameter, code, email or token is added.
  expect(popup.url()).toBe(signUpUrl);
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  expect(await popup.evaluate(() => document.referrer)).toBe("");
  // This tab stays on the signed-out form, with nothing stored.
  await expect(page.locator("#account .desktop-auth-card")).toBeVisible();
  expect(await page.evaluate(() => ({
    access: localStorage.getItem("access_token"),
    refresh: localStorage.getItem("refresh_token")
  }))).toEqual({ access: null, refresh: null });
});
