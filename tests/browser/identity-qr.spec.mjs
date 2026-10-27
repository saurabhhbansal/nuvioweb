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

async function installQrFixture(context, { qrImageUrl = null, webUrl = null, holdExchange = false, holdOwner = false, holdPoll = false, pollStatus = "approved", expiresIn = 600000 } = {}) {
  const requests = [];
  const unexpected = [];
  const exchangeGate = holdExchange ? gate() : null;
  const exchangeStarted = deferred();
  const ownerGate = holdOwner ? gate() : null;
  const ownerStarted = deferred();
  const pollGate = holdPoll ? gate() : null;
  const pollStarted = deferred();
  let externalRendererRequests = 0;
  // The posted task runs after the response's application microtask chain,
  // including early cancellation checks that deliberately never consume JSON.
  await context.addInitScript(() => {
    globalThis.__qrConsumed = {};
    const original = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      const response = await original(...args);
      const path = new URL(response.url).pathname;
      setTimeout(() => { globalThis.__qrConsumed[path] = (globalThis.__qrConsumed[path] || 0) + 1; }, 0);
      return response;
    };
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:4371") return route.continue();
    if (url.hostname.includes("qrserver")) externalRendererRequests += 1;
    if (url.origin !== identityOrigin) {
      if (!["https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://image.tmdb.org"].includes(url.origin) && !((url.origin === "https://v3-cinemeta.strem.io" && ["/manifest.json", "/catalog/movie/top.json", "/catalog/series/top.json"].includes(url.pathname)) || (url.origin === "https://opensubtitles-v3.strem.io" && url.pathname === "/manifest.json"))) {
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
      const redirect = String(request.postDataJSON()?.p_redirect_base_url || "");
      requests.push({ operation, redirect });
      // Mirrors the live service: only a "/tv-login" base is accepted and the
      // approval link is built from it.
      if (!redirect.includes("/tv-login")) {
        return json({ code: "P0001", message: "Invalid TV login redirect base URL" }, 400);
      }
      return json([{
        code: "fixture-qr-code",
        web_url: webUrl || `${redirect}?code=fixture-qr-code`,
        qr_image_url: qrImageUrl,
        expires_at_millis: Date.now() + expiresIn,
        poll_interval_seconds: 1
      }]);
    }
    if (operation === "poll_tv_login_session") {
      requests.push({ operation });
      pollStarted.resolve();
      if (pollGate) await pollGate.promise;
      return json([{ status: pollStatus }]);
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
    pollStarted: pollStarted.promise,
    releasePoll: () => pollGate?.release(),
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
  await expect(page.locator("#qr-code-text")).toContainText("fixture-qr-code");
  await expect(page.locator("#qr-refresh-btn")).toBeEnabled();
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
  expect(fixture.requests.filter((entry) => entry.operation === "start_tv_login_session").map((entry) => entry.redirect)).toEqual(["https://nuvio.tv/tv-login"]);
  const link = page.locator("#qr-login-link a");
  await expect(link).toBeVisible();
  expect(await link.evaluate((anchor) => ({ href: anchor.href, target: anchor.target, rel: anchor.rel }))).toEqual({
    href: "https://nuvio.tv/tv-login?code=fixture-qr-code",
    target: "_blank",
    rel: "noopener noreferrer"
  });
  await expect(page.locator('#profileSelection .profile-card[data-profile-id="1"]')).toBeVisible({ timeout: 15000 });
  expect(fixture.externalRendererRequests()).toBe(0);
  expect(fixture.unexpected).toEqual([]);
});

test("a start response pointing at another site shows neither a QR nor a link", async ({ context, page }) => {
  const fixture = await installQrFixture(context, { webUrl: "https://elsewhere.example.invalid/tv-login?code=fixture-qr-code" });
  await openQrScreen(page);
  await expect(page.locator('#qr-container [data-state="unavailable"]')).toBeVisible();
  expect(await page.locator("#qr-container canvas, #qr-container img").count()).toBe(0);
  expect(await page.locator("#qr-login-link a").count()).toBe(0);
  expect(fixture.unexpected).toEqual([]);
});

test("leaving the QR screen removes the code-bearing link", async ({ context, page }) => {
  const fixture = await installQrFixture(context, { pollStatus: "pending" });
  await openQrScreen(page);
  await expect(page.locator("#qr-login-link a")).toBeVisible();
  // The only way off the QR screen while signed out: back to email sign-in.
  await page.locator("#qr-browser-back-btn").click();
  expect(await page.locator("#qr-login-link a").count()).toBe(0);
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

test("leaving during a held owner resolution leaves no persisted account", async ({ context, page }) => {
  const fixture = await installQrFixture(context, { holdOwner: true });
  await openQrScreen(page);
  await fixture.ownerStarted;
  // The only way off the QR screen while signed out: back to email sign-in.
  await page.locator("#qr-browser-back-btn").click();
  await expect.poll(() => page.evaluate(() => history.state?.route)).not.toBe("profileSelection");
  const beforeRelease = await page.evaluate(() => ({
    access: localStorage.getItem("access_token"),
    refresh: localStorage.getItem("refresh_token"),
    owner: localStorage.getItem("nuvioAccountOwnerMarker")
  }));
  expect(beforeRelease).toEqual({ access: null, refresh: null, owner: null });
  fixture.releaseOwner();
  await expect.poll(() => page.evaluate(() => globalThis.__qrConsumed["/rest/v1/rpc/get_sync_owner"] || 0)).toBe(1);
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
  await page.reload();
  await expect(page.locator("#profileSelection, .desktop-auth-qr").first()).toBeVisible();
  const afterReload = await page.evaluate(() => ({
    access: localStorage.getItem("access_token"),
    refresh: localStorage.getItem("refresh_token"),
    owner: localStorage.getItem("nuvioAccountOwnerMarker")
  }));
  expect(afterReload).toEqual({ access: null, refresh: null, owner: null });
  expect(fixture.unexpected).toEqual([]);
});

test("leaving the screen during a held exchange has no later token or navigation side effect", async ({ context, page }) => {
  const fixture = await installQrFixture(context, { holdExchange: true });
  await openQrScreen(page);
  await fixture.exchangeStarted;
  // The only way off the QR screen while signed out: back to email sign-in.
  await page.locator("#qr-browser-back-btn").click();
  await expect(page.locator("#desktop-auth-email")).toBeVisible();
  await expect.poll(() => page.evaluate(() => history.state?.route)).not.toBe("profileSelection");
  fixture.releaseExchange();
  await expect.poll(() => page.evaluate(() => globalThis.__qrConsumed["/functions/v1/tv-logins-exchange"] || 0)).toBe(1);
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


test("held QR polls stay serialized across multiple interval ticks", async ({ context, page }) => {
  const fixture = await installQrFixture(context, { holdPoll: true, holdOwner: true });
  await page.clock.install();
  await openQrScreen(page);
  await page.clock.runFor(2200);
  await fixture.pollStarted;
  await page.clock.runFor(6500);
  expect(fixture.requests.filter((entry) => entry.operation === "poll_tv_login_session")).toHaveLength(1);
  fixture.releasePoll();
  await fixture.ownerStarted;
  fixture.releaseOwner();
  await expect(page.locator('#profileSelection .profile-card[data-profile-id="1"]')).toBeVisible();
  expect(fixture.requests.filter((entry) => entry.operation === "exchange")).toHaveLength(1);
  expect(fixture.unexpected).toEqual([]);
});

for (const mode of ["server", "deadline"]) {
  test(`QR ${mode} expiry cancels the attempt and cannot publish a late approval`, async ({ context, page }) => {
    const fixture = await installQrFixture(context, mode === "server"
      ? { pollStatus: "expired" } : { holdPoll: true, expiresIn: 3500 });
    await page.clock.install();
    await openQrScreen(page);
    await page.clock.runFor(2200);
    await fixture.pollStarted;
    await page.clock.runFor(2500);
    await expect(page.locator("#qr-status")).toContainText(/expired/i);
    fixture.releasePoll();
    await page.clock.runFor(5000);
    expect(fixture.requests.filter((entry) => entry.operation === "exchange")).toHaveLength(0);
    expect(await page.evaluate(() => [localStorage.getItem("access_token"), localStorage.getItem("nuvioAccountOwnerMarker")])).toEqual([null, null]);
    expect(fixture.unexpected).toEqual([]);
  });
}


test("an already elapsed QR start leaves Refresh available", async ({ context, page }) => {
  const fixture = await installQrFixture(context, { expiresIn: -1000 });
  await page.goto("/");
  await page.locator(".desktop-auth-qr").click();
  await expect(page.locator("#qr-refresh-btn")).toBeEnabled();
  await expect(page.locator("#qr-status")).not.toContainText(/preparing/i);
  expect(fixture.requests.filter((entry) => entry.operation === "exchange")).toHaveLength(0);
  expect(fixture.unexpected).toEqual([]);
});


test("unknown foreign destinations are recorded even when blocked", async ({ context, page }) => {
  const fixture = await installQrFixture(context);
  await page.goto("https://unlisted.fixture.invalid/probe").catch(() => {});
  expect(fixture.unexpected).toEqual([expect.objectContaining({ origin: "https://unlisted.fixture.invalid" })]);
});
