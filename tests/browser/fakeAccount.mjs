// A signed-in Nuvio account for browser specs that are not about identity.
//
// NuvioWeb needs an account for everything past sign-in (docs/DECISIONS.md,
// 2026-10-27), so specs that used to run as a guest run as this account. It
// fakes the identity/sync backend the test build points at
// (https://identity.example.invalid) with a small in-memory store: what the
// app pushes comes back on the next pull, so data survives a reload the way
// it does against the real service. Nothing here leaves the test browser.
//
// Identity behaviour itself (owner boundaries, refresh, sign-out, two
// accounts) is covered by identity-sync.spec.mjs and identity-qr.spec.mjs.

export const FAKE_IDENTITY_ORIGIN = "https://identity.example.invalid";
export const fakeAccount = {
  id: "fixture-user-signed-in",
  owner: "fixture-owner-signed-in",
  email: "signed-in@example.invalid",
  password: "synthetic-password"
};

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

// An unsigned token the app can read (sub, email, exp). Far-future expiry, so
// startup never needs a refresh.
export const fakeAccessToken = `${base64url('{"alg":"none"}')}.${base64url(
  JSON.stringify({ sub: fakeAccount.id, email: fakeAccount.email, exp: 4102444800 })
)}.synthetic`;
export const fakeRefreshToken = "fixture-refresh-signed-in";

const KEY_FIELDS = ["content_id", "content_type", "season", "episode", "progress_key", "video_id"];
const rowKey = (row) => KEY_FIELDS.map((field) => String(row?.[field] ?? "")).join("|");
// A delete key names only some fields; it matches every row that agrees on them.
const matchesKey = (row, key) =>
  Object.entries(key || {}).every(([field, value]) => String(row?.[field] ?? "") === String(value ?? ""));

function upsertRows(current, incoming) {
  const rows = new Map(current.map((row) => [rowKey(row), row]));
  for (const row of Array.isArray(incoming) ? incoming : []) rows.set(rowKey(row), { ...row });
  return [...rows.values()];
}

/**
 * Fakes the account backend for this browser context and, unless
 * `signedIn: false`, starts every page already signed in to it (as a returning
 * user whose session was saved on this device).
 *
 * Call it after any catch-all `context.route("**\/*")` of the spec: the route
 * registered last is consulted first.
 *
 * @param {import("@playwright/test").BrowserContext} context
 * @param {{ addons?: Array<string | { url: string, name?: string }>, signedIn?: boolean }} [options]
 *   addons: add-ons (base URL, or URL and custom name) the account already
 *   has on profile 1, matching what the spec seeds locally, so the first pull
 *   keeps them.
 *   identityOrigin: the backend origin the build points at, when it is not
 *   the test build's (scripts/verify-preview.mjs answers a deployed preview's
 *   backend with this fake, so it never reaches the real service).
 */
export async function installFakeAccount(
  context,
  { addons = [], signedIn = true, identityOrigin = FAKE_IDENTITY_ORIGIN } = {}
) {
  const store = new Map();
  const unexpected = [];
  let profiles = [{ profile_index: 1, name: "Fixture", is_primary: true }];
  store.set(
    "addons:1",
    addons.map((addon, index) => ({
      ...(typeof addon === "string" ? { url: addon } : addon),
      enabled: true,
      sort_order: index,
      profile_id: 1,
      user_id: fakeAccount.owner
    }))
  );
  const get = (kind, profileId) => store.get(`${kind}:${profileId}`) || [];
  const set = (kind, profileId, rows) => store.set(`${kind}:${profileId}`, rows);

  await context.route(`${identityOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    let body = {};
    try {
      body = request.postDataJSON() || {};
    } catch {
      body = {};
    }
    const session = { access_token: fakeAccessToken, refresh_token: fakeRefreshToken, expires_in: 3600, user: fakeAccount };

    if (url.pathname === "/auth/v1/token") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        if (body.email !== fakeAccount.email || body.password !== fakeAccount.password) {
          return json({ error: "invalid fixture login" }, 400);
        }
        return json(session);
      }
      if (grant === "refresh_token" && body.refresh_token === fakeRefreshToken) return json(session);
      return json({ error: "invalid_grant" }, 401);
    }
    if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204, body: "" });
    if (request.headers().authorization !== `Bearer ${fakeAccessToken}`) {
      // Public reads the app makes without a session.
      if (url.pathname === "/rest/v1/rpc/get_avatar_catalog") return json([]);
      unexpected.push({ path: url.pathname, reason: "missing-session" });
      return json({ error: "fixture session required" }, 401);
    }
    if (url.pathname === "/auth/v1/user") return json(fakeAccount);

    const profileId = String(body.p_profile_id ?? url.searchParams.get("profile_id")?.replace("eq.", "") ?? 1);
    if (request.method() === "GET" && url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      if (table === "addons" || table === "tv_addons") return json(get("addons", profileId));
      if (table === "plugins") return json(get("plugins", profileId));
      if (table === "profiles") return json(profiles);
      unexpected.push({ path: url.pathname, reason: "unknown-table" });
      return json([]);
    }

    const operation = url.pathname.replace("/rest/v1/rpc/", "");
    switch (operation) {
      case "get_sync_owner":
        return json(fakeAccount.owner);
      case "get_avatar_catalog":
      case "sync_pull_profile_locks":
      case "sync_pull_home_catalog_settings":
      case "sync_pull_collections":
      case "sync_pull_provider_credentials":
        return json([]);
      case "get_sync_overview":
        return json({});
      case "register_current_device":
      case "sync_seed_provider_credentials":
      case "sync_push_provider_credentials":
      case "sync_delete_provider_credentials":
      case "sync_push_home_catalog_settings":
      case "sync_push_collections":
        return json(null);
      case "sync_pull_profiles":
        return json(profiles);
      case "sync_push_profiles":
        profiles = (Array.isArray(body.p_profiles) ? body.p_profiles : []).map((row) => ({
          ...row,
          is_primary: Number(row.profile_index) === 1
        }));
        return json(null);
      case "sync_pull_addons":
        return json(get("addons", profileId));
      case "sync_push_addons":
        set("addons", profileId, (body.p_addons || []).map((row) => ({ ...row, profile_id: Number(profileId) })));
        return json(null);
      case "sync_push_plugins":
        set("plugins", profileId, body.p_plugins || []);
        return json(null);
      case "sync_pull_library": {
        const offset = Number(body.p_offset || 0);
        const limit = Number(body.p_limit || 1000);
        return json(get("library", profileId).slice(offset, offset + limit));
      }
      case "sync_push_library_items":
        set("library", profileId, upsertRows(get("library", profileId), body.p_items));
        return json(null);
      case "sync_pull_watched_items": {
        const page = Math.max(1, Number(body.p_page || 1));
        const size = Number(body.p_page_size || 1000);
        return json(get("watched", profileId).slice((page - 1) * size, page * size));
      }
      case "sync_push_watched_items":
        set("watched", profileId, upsertRows(get("watched", profileId), body.p_items));
        return json(null);
      case "sync_pull_watch_progress":
        return json(get("progress", profileId));
      case "sync_push_watch_progress":
        set("progress", profileId, upsertRows(get("progress", profileId), body.p_entries));
        return json(null);
      case "sync_pull_profile_settings_blob": {
        const blob = store.get(`settings:${profileId}`);
        return json(blob ? [{ settings_json: blob }] : []);
      }
      case "sync_push_profile_settings_blob":
        store.set(`settings:${profileId}`, body.p_settings_json);
        return json(null);
      case "sync_delete_library_items":
      case "sync_delete_watched_items":
      case "sync_delete_watch_progress": {
        const kind = { sync_delete_library_items: "library", sync_delete_watched_items: "watched" }[operation] || "progress";
        const keys = Array.isArray(body.p_keys) ? body.p_keys : [];
        set(kind, profileId, get(kind, profileId).filter((row) => !keys.some((key) => matchesKey(row, key))));
        return json(null);
      }
      default:
        unexpected.push({ path: url.pathname, reason: "unknown-operation" });
        return json(null);
    }
  });

  if (signedIn) {
    // Once per tab: a reload keeps whatever the spec did to the session since
    // (a sign-out stays signed out).
    await context.addInitScript(
      ({ access, refresh, owner }) => {
        try {
          if (sessionStorage.getItem("__fakeAccountSeeded")) return;
          sessionStorage.setItem("__fakeAccountSeeded", "1");
          if (localStorage.getItem("access_token")) return;
          localStorage.setItem("access_token", access);
          localStorage.setItem("refresh_token", refresh);
          // The account this device last verified: no account-boundary reset
          // of what the spec seeded locally.
          localStorage.setItem("nuvioAccountOwnerMarker", owner);
        } catch {
          // Pages without storage (about:blank) need no session.
        }
      },
      { access: fakeAccessToken, refresh: fakeRefreshToken, owner: fakeAccount.owner }
    );
  }

  return { unexpected, store, profiles: () => profiles };
}

// Signs in through the email form, for specs that start signed out.
export async function signInWithFakeAccount(page) {
  await page.locator("#desktop-auth-email").fill(fakeAccount.email);
  await page.locator("#desktop-auth-password").fill(fakeAccount.password);
  await page.locator(".desktop-auth-submit").click();
}

// Opens the app signed in (installFakeAccount first) and goes through profile
// choice and Quick Setup, if they show, to Home.
export async function openSignedInHome(page, { expect, path = "/" } = {}) {
  await page.goto(path);
  await enterPastStartup(page, { expect });
  await expect(page.locator("#home")).toBeVisible();
}

// The screens a signed-in start can show before the app proper: the profile
// picker and, on a profile's first start, Quick Setup.
//
// Right after an email sign-in the sign-in screen is still the settled route
// while the token request and profile pull are in flight. That is not a
// startup screen: deciding on it would skip the profile picker that follows.
export async function enterPastStartup(page, { expect, profileId = "1" } = {}) {
  const profileCard = page.locator(`#profileSelection [data-profile-id="${profileId}"]`);
  const skipSetup = page.getByRole("button", { name: "Skip setup", exact: true });
  const settled = () =>
    page.evaluate(() => {
      const route = history.state?.route || null;
      return route && window.__NUVIO_CURRENT_ROUTE__ === route ? route : null;
    });
  const settledPastSignIn = async () => {
    const route = await settled();
    return route === "authSignIn" || route === "authQrSignIn" ? null : route;
  };
  await expect.poll(settledPastSignIn).not.toBeNull();
  if ((await settled()) === "profileSelection") {
    await profileCard.click();
    await expect.poll(settled).not.toBe("profileSelection");
  }
  await expect.poll(settled).not.toBeNull();
  if ((await settled()) === "quickSetup") {
    await skipSetup.click();
    await expect.poll(settled).not.toBe("quickSetup");
  }
}
