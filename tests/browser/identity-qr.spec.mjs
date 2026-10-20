import { test, expect } from "@playwright/test";

const identityOrigin = "https://identity.example.invalid";
const account = { id: "fixture-qr-user", owner: "fixture-qr-owner", email: "qr@example.invalid" };

function token(subject) {
  return `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({
    sub: subject,
    email: account.email,
    exp: 4102444800
  })).toString("base64url")}.synthetic`;
}
const anonymousToken = token("fixture-qr-anonymous");
const accountToken = token("fixture-qr-account");

function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function installQrFixture(context, { qrImageUrl = null, holdExchange = false, holdOwner = false } = {}) {
  const requests = [];
  const unexpected = [];
  const exchangeGate = holdExchange ? gate() : null;
  const exchangeStarted = deferred();
  const ownerGate = holdOwner ? gate() : null;
  const ownerStarted = deferred();
  let externalRendererRequests = 0;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:4371") return route.continue();
    if (url.hostname.includes("qrserver")) externalRendererRequests += 1;
    if (url.origin !== identityOrigin) {
      if (url.hostname.includes("evil") || url.hostname.includes("qrserver")) {
        unexpected.push({ origin: url.origin, path: url.pathname });
      }
      return route.abort("blockedbyclient");
    }
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const operation = url.pathname.replace("/rest/v1/rpc/", "");
    if (url.pathname === "/auth/v1/signup") {
      requests.push({ operation: "anonymous-signup" });
      return json({ access_token: anonymousToken, refresh_token: "fixture-anonymous-refresh", user: { id: "fixture-anonymous" } });
    }
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "anonymous") {
      requests.push({ operation: "anonymous-token" });
      return json({ access_token: anonymousToken, refresh_token: "fixture-anonymous-refresh" });
    }
    if (operation === "start_tv_login_session") {
      requests.push({ operation });
      return json([{
        code: "fixture-qr-code",
        qr_content: "https://nuvioweb.example.invalid/qr/fixture",
        qr_image_url: qrImageUrl,
        expires_at_millis: Date.now() + 600000,
        poll_interval_seconds: 1
      }]);
    }
    if (operation === "poll_tv_login_session") {
      requests.push({ operation });
      return json([{ status: "approved" }]);
    }
    if (url.pathname === "/functions/v1/tv-logins-exchange") {
      requests.push({ operation: "exchange" });
      exchangeStarted.resolve();
      if (exchangeGate) await exchangeGate.promise;
      return json({ access_token: accountToken, refresh_token: "fixture-qr-refresh" });
    }
    if (operation === "get_sync_owner") {
      requests.push({ operation });
      ownerStarted.resolve();
      if (ownerGate) await ownerGate.promise;
      return json(account.owner);
    }
    if (operation === "sync_pull_profiles") {
      requests.push({ operation });
      return json([{ profile_index: 1, name: "Fixture QR", is_primary: true }]);
    }
    if (operation === "get_avatar_catalog") return json([]);
    if (url.pathname === "/rest/v1/addons" && request.method() === "GET") return json([]);
    if (url.pathname === "/rest/v1/plugins" && request.method() === "GET") return json([]);
    if ([
      "sync_pull_profile_locks", "sync_pull_profile_settings_blob", "sync_pull_home_catalog_settings",
      "sync_pull_collections", "sync_pull_plugins", "sync_pull_watched_items", "sync_pull_watch_progress",
      "sync_pull_library", "sync_pull_trakt_credentials", "sync_pull_simkl_credentials",
      "sync_pull_provider_credentials"
    ].includes(operation)) {
      requests.push({ operation });
      return json([]);
    }
    if (["register_current_device", "sync_seed_provider_credentials", "sync_push_profile_settings_blob", "sync_push_watched_items"].includes(operation) && request.method() === "POST") {
      requests.push({ operation });
      return json(null);
    }
    unexpected.push({ operation, method: request.method() });
    return json({ error: "unimplemented QR fixture operation" }, 400);
  });
  return {
    requests,
    unexpected,
    exchangeStarted: exchangeStarted.promise,
    ownerStarted: ownerStarted.promise,
    releaseExchange: () => exchangeGate?.release(),
    releaseOwner: () => ownerGate?.release(),
    externalRendererRequests: () => externalRendererRequests
  };
}

async function openQrScreen(page) {
  await page.goto("/");
  await expect(page.locator(".desktop-auth-qr")).toBeVisible();
  await page.locator(".desktop-auth-qr").click();
  await expect(page.locator("#qr-status")).toBeVisible();
}

test("the actual QR screen completes a synthetic current flow with a safe local image", async ({ context, page }) => {
  const fixture = await installQrFixture(context, { qrImageUrl: "/assets/brand/app_logo_wordmark.png" });
  await openQrScreen(page);
  await expect(page.locator("#qr-container img.qr-image")).toBeVisible();
  expect(await page.locator("#qr-container img.qr-image").getAttribute("src")).toContain("/assets/brand/app_logo_wordmark.png");
  await expect(page.locator('#profileSelection .profile-card[data-profile-id="1"]')).toBeVisible({ timeout: 15000 });
  const stored = await page.evaluate(() => ({
    access: localStorage.getItem("access_token"),
    refresh: localStorage.getItem("refresh_token"),
    anonymous: localStorage.getItem("is_anonymous_session"),
    owner: localStorage.getItem("nuvioAccountOwnerMarker")
  }));
  expect(stored).toEqual({
    access: accountToken,
    refresh: "fixture-qr-refresh",
    anonymous: null,
    owner: account.owner
  });
  expect(fixture.requests.some((entry) => entry.operation === "exchange")).toBe(true);
  expect(fixture.externalRendererRequests()).toBe(0);
  expect(fixture.unexpected).toEqual([]);
});

test("a missing upstream image is rendered locally from the login URL", async ({ context, page }) => {
  const fixture = await installQrFixture(context, { qrImageUrl: null });
  await openQrScreen(page);
  await expect(page.locator("#qr-container canvas.qr-image-canvas")).toBeVisible();
  await expect(page.locator('#profileSelection .profile-card[data-profile-id="1"]')).toBeVisible({ timeout: 15000 });
  expect(fixture.externalRendererRequests()).toBe(0);
  expect(fixture.unexpected).toEqual([]);
});

test("a hostile QR image URL is inert and the login URL is rendered locally", async ({ context, page }) => {
  const fixture = await installQrFixture(context, {
    qrImageUrl: 'https://evil.example.invalid/qr.png" onerror="globalThis.__qrXss=1'
  });
  await openQrScreen(page);
  await expect(page.locator("#qr-container canvas.qr-image-canvas")).toBeVisible();
  expect(await page.locator("#qr-container img").count()).toBe(0);
  expect(await page.evaluate(() => globalThis.__qrXss)).toBeUndefined();
  expect(fixture.externalRendererRequests()).toBe(0);
  expect(fixture.unexpected.some((entry) => entry.origin.includes("evil.example.invalid"))).toBe(false);
  await expect(page.locator('#profileSelection .profile-card[data-profile-id="1"]')).toBeVisible({ timeout: 15000 });
  expect(fixture.unexpected).toEqual([]);
});

test("leaving during a held owner resolution has no later publication", async ({ context, page }) => {
  const fixture = await installQrFixture(context, { holdOwner: true });
  await openQrScreen(page);
  await fixture.ownerStarted;
  await page.locator("#qr-back-btn").click();
  await expect.poll(() => page.evaluate(() => history.state?.route)).not.toBe("profileSelection");
  fixture.releaseOwner();
  await page.waitForTimeout(1200);
  const stored = await page.evaluate(() => ({
    access: localStorage.getItem("access_token"),
    refresh: localStorage.getItem("refresh_token"),
    owner: localStorage.getItem("nuvioAccountOwnerMarker"),
    route: history.state?.route || null
  }));
  expect(stored.access).toBeNull();
  expect(stored.refresh).toBeNull();
  expect(stored.owner).toBeNull();
  expect(stored.route).not.toBe("profileSelection");
  expect(fixture.unexpected).toEqual([]);
});

test("leaving the screen during a held exchange has no later token or navigation side effect", async ({ context, page }) => {
  const fixture = await installQrFixture(context, { holdExchange: true });
  await openQrScreen(page);
  await fixture.exchangeStarted;
  await page.locator("#qr-back-btn").click();
  await expect(page.locator("#desktop-auth-email")).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => history.state?.route)).not.toBe("profileSelection");
  fixture.releaseExchange();
  await page.waitForTimeout(1200);
  const stored = await page.evaluate(() => ({
    access: localStorage.getItem("access_token"),
    refresh: localStorage.getItem("refresh_token"),
    route: history.state?.route || null
  }));
  expect(stored.access).toBeNull();
  expect(stored.refresh).toBeNull();
  expect(stored.route).not.toBe("profileSelection");
  expect(fixture.requests.some((entry) => entry.operation === "get_sync_owner")).toBe(false);
  expect(fixture.unexpected).toEqual([]);
});
