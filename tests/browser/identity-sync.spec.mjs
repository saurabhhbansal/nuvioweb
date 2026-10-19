import { test, expect } from "@playwright/test";

const identityOrigin = "https://identity.example.invalid";
const accounts = {
  A: { id: "fixture-user-a", owner: "fixture-owner-a", email: "a@example.invalid" },
  B: { id: "fixture-user-b", owner: "fixture-owner-b", email: "b@example.invalid" }
};
const library = (alias) => [{
  content_id: `fixture-library-${alias.toLowerCase()}`,
  content_type: "movie",
  name: `Fixture ${alias} Library marker`,
  poster_shape: "POSTER",
  genres: [],
  added_at: 1700000000000
}];

function token(alias) {
  const payload = { sub: accounts[alias].id, email: accounts[alias].email, exp: 4102444800 };
  return `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.synthetic`;
}

async function installIdentityFixture(context, { criticalGate = null, withCatalog = false, catalogGate = null, libraryGates = {}, allowLibraryWrites = false, backend = null, rejectLibraryWrites = false } = {}) {
  const requests = [];
  const unexpected = [];
  const settings = new Map();
  const libraries = backend?.libraries || new Map(Object.keys(accounts).map((alias) => [alias, library(alias)]));
  const libraryWrites = backend?.libraryWrites || [];
  const provider = "https://catalog.example.invalid";
  let catalogRequested = false;
  const emptyReads = new Set([
    "sync_pull_profile_locks", "sync_pull_profile_settings_blob", "sync_pull_home_catalog_settings",
    "sync_pull_collections", "sync_pull_plugins", "sync_pull_watched_items", "sync_pull_watch_progress",
    "sync_pull_trakt_credentials", "sync_pull_simkl_credentials", "sync_pull_provider_credentials"
  ]);
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:4371") return route.continue();
    if (url.origin === provider && withCatalog) {
      expect(request.headers().authorization).toBeUndefined();
      expect(request.headers().apikey).toBeUndefined();
      if (url.pathname === "/manifest.json") return route.fulfill({ json: {
        id: "fixture-catalog", name: "Synthetic catalog", version: "1.0.0", types: ["movie"],
        resources: ["catalog"], catalogs: [{ id: "fixture", type: "movie", name: "Fixture catalog" }]
      } });
      if (url.pathname.startsWith("/catalog/movie/fixture")) {
        catalogRequested = true;
        if (catalogGate) await catalogGate.promise;
        return route.fulfill({ json: { metas: [] } });
      }
      unexpected.push({ operation: url.pathname, reason: "unknown-catalog-path" });
      return route.abort("blockedbyclient");
    }
    if (url.origin !== identityOrigin) return route.abort("blockedbyclient");
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const operation = url.pathname.replace("/rest/v1/rpc/", "");
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      const body = request.postDataJSON();
      const alias = Object.keys(accounts).find((key) => accounts[key].email === body.email);
      if (!alias || body.password !== "synthetic-password") return json({ error: "invalid fixture login" }, 400);
      requests.push({ alias, operation: "password-login" });
      return json({ access_token: token(alias), refresh_token: `fixture-refresh-${alias}`, user: accounts[alias], expires_in: 3600 });
    }
    if (operation === "get_avatar_catalog" && request.method() === "POST") return json([]);
    const alias = Object.keys(accounts).find((key) => request.headers().authorization === `Bearer ${token(key)}`);
    if (!alias) {
      unexpected.push({ operation, reason: "missing-fixture-session" });
      return json({ error: "fixture session required" }, 401);
    }
    requests.push({ alias, operation });
    if (url.pathname === "/auth/v1/user") return json(accounts[alias]);
    if (operation === "get_sync_owner") return json(accounts[alias].owner);
    if (operation === "sync_pull_profiles") return json([{ profile_index: 1, name: `Fixture ${alias}`, is_primary: true }]);
    if (operation === "sync_pull_library") {
      if (libraryGates[alias]) await libraryGates[alias].promise;
      return json(libraries.get(alias));
    }
    if (allowLibraryWrites && operation === "sync_push_library" && request.method() === "POST") {
      const body = request.postDataJSON();
      expect(body.p_profile_id).toBe(1);
      expect(Array.isArray(body.p_items)).toBe(true);
      libraryWrites.push({ alias, profileId: body.p_profile_id, items: body.p_items });
      if (rejectLibraryWrites) return json({ error: "synthetic write unavailable" }, 503);
      libraries.set(alias, body.p_items);
      return json(null);
    }
    if (operation === "sync_pull_profile_settings_blob") {
      if (criticalGate) await criticalGate.promise;
      return json(settings.has(alias) ? [{ settings_json: settings.get(alias) }] : []);
    }
    // Quick Setup and initial migration write settings through the normal app.
    // Store only synthetic per-alias data; reject unknown mutations below.
    if (operation === "sync_push_profile_settings_blob" && request.method() === "POST") {
      const body = request.postDataJSON();
      expect(body.p_profile_id).toBe(1);
      expect(body.p_settings_json).toBeTruthy();
      settings.set(alias, body.p_settings_json);
      return json(null);
    }
    if (emptyReads.has(operation)) return json([]);
    if (url.pathname === "/rest/v1/addons" && request.method() === "GET") return json(withCatalog ? [{ url: provider, enabled: true, sort_order: 0 }] : []);
    if (url.pathname === "/rest/v1/plugins" && request.method() === "GET") return json([]);
    if (operation === "sync_push_watched_items" && request.method() === "POST") {
      const body = request.postDataJSON();
      expect(body.p_profile_id).toBe(1);
      expect(body.p_items).toEqual([]);
      return json(null);
    }
    if (["register_current_device", "sync_seed_provider_credentials"].includes(operation) && request.method() === "POST") return json(null);
    unexpected.push({ operation, method: request.method() });
    return json({ error: "unimplemented fixture operation" }, 400);
  });
  return { requests, unexpected, libraryWrites, catalogRequested: () => catalogRequested };
}

function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

async function signIn(page, alias) {
  await page.locator("#desktop-auth-email").fill(accounts[alias].email);
  await page.locator("#desktop-auth-password").fill("synthetic-password");
  await page.locator(".desktop-auth-submit").click();
  await expect(page.locator('#profileSelection .profile-card[data-profile-id="1"]')).toBeVisible();
  await page.locator('#profileSelection .profile-card[data-profile-id="1"]').click();
  await openLibrary(page);
}

async function openLibrary(page) {
  await expect.poll(() => page.evaluate(() => history.state?.route)).toMatch(/^(home|quickSetup)$/);
  if (await page.locator(".quick-setup-skip").isVisible()) await page.locator(".quick-setup-skip").click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.locator("#library")).toBeVisible();
}

async function expectLibrary(page, alias) {
  await expect(page.locator(`#library .library-grid-card[data-item-id="fixture-library-${alias.toLowerCase()}"]`)).toBeVisible();
  const other = alias === "A" ? "b" : "a";
  await expect(page.locator(`#library .library-grid-card[data-item-id="fixture-library-${other}"]`)).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("savedLibraryItems") || "[]").map((item) => item.contentId))).toEqual([`fixture-library-${alias.toLowerCase()}`]);
}

async function signOut(page) {
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.locator('#profileSelection [data-action="sign-out"]').click();
  await expect(page.locator("#desktop-auth-email")).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem("access_token"), localStorage.getItem("refresh_token")])).toEqual([null, null]);
}

test("built app hydrates nonempty Library and switches B to A to B without clearing storage", async ({ context, page }) => {
  const fixture = await installIdentityFixture(context);
  await page.goto("/");
  for (const alias of ["B", "A", "B"]) {
    const start = fixture.requests.length;
    await signIn(page, alias);
    await expectLibrary(page, alias);
    expect(fixture.requests.slice(start).some((entry) => entry.alias === alias && entry.operation === "sync_pull_library")).toBe(true);
    await signOut(page);
  }
  expect(fixture.unexpected).toEqual([]);
});

test("independent B contexts both hydrate Library while the first page stays open", async ({ browser, context, page }) => {
  const first = await installIdentityFixture(context);
  await page.goto("/");
  await signIn(page, "B");
  await expectLibrary(page, "B");
  const secondContext = await browser.newContext({ serviceWorkers: "block" });
  try {
    const second = await installIdentityFixture(secondContext);
    const receiver = await secondContext.newPage();
    await receiver.goto("http://127.0.0.1:4371");
    await signIn(receiver, "B");
    await expectLibrary(receiver, "B");
    expect(second.requests.some((entry) => entry.operation === "sync_pull_library")).toBe(true);
    expect(second.unexpected).toEqual([]);
    expect(first.unexpected).toEqual([]);
  } finally {
    await secondContext.close();
  }
});

test("Library hydration resumes after delayed critical settings settle", async ({ context, page }) => {
  const critical = gate();
  const fixture = await installIdentityFixture(context, { criticalGate: critical });
  try {
    await page.goto("/");
    await signIn(page, "B");
    await expect.poll(() => fixture.requests.some((entry) => entry.operation === "sync_pull_profile_settings_blob")).toBe(true);
    expect(fixture.requests.some((entry) => entry.operation === "sync_pull_library")).toBe(false);
    critical.release();
    await expectLibrary(page, "B");
    expect(fixture.requests.some((entry) => entry.operation === "sync_pull_library")).toBe(true);
    expect(fixture.unexpected).toEqual([]);
  } finally {
    critical.release();
  }
});

test("Library hydration reaches the bundled UI while catalog results remain pending", async ({ context, page }) => {
  const catalog = gate();
  const fixture = await installIdentityFixture(context, { withCatalog: true, catalogGate: catalog });
  try {
    await page.goto("/");
    await signIn(page, "B");
    await expect.poll(fixture.catalogRequested).toBe(true);
    await expectLibrary(page, "B");
    expect(fixture.requests.some((entry) => entry.operation === "sync_pull_library")).toBe(true);
    expect(fixture.unexpected).toEqual([]);
  } finally {
    catalog.release();
  }
});

test("late B Library response cannot overwrite A after logout and account switch", async ({ context, page }) => {
  const pendingB = gate();
  const fixture = await installIdentityFixture(context, { libraryGates: { B: pendingB } });
  try {
    await page.goto("/");
    await signIn(page, "B");
    await expect.poll(() => fixture.requests.some((entry) => entry.alias === "B" && entry.operation === "sync_pull_library")).toBe(true);
    await signOut(page);
    await signIn(page, "A");
    await expectLibrary(page, "A");
    const oldResponse = page.waitForResponse((response) => {
      const request = response.request();
      return new URL(response.url()).pathname === "/rest/v1/rpc/sync_pull_library" && request.headers().authorization === `Bearer ${token("B")}`;
    });
    pendingB.release();
    const response = await oldResponse;
    expect(response.status()).toBe(200);
    expect(await response.finished()).toBeNull();
    // Let fetch parsing and its store/UI continuations run after the old body.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expectLibrary(page, "A");
    expect(fixture.unexpected).toEqual([]);
  } finally {
    pendingB.release();
  }
});

test("reload rehydrates the same nonempty Library through a retained synthetic session", async ({ context, page }) => {
  const fixture = await installIdentityFixture(context);
  await page.goto("/");
  await signIn(page, "B");
  await expectLibrary(page, "B");
  const start = fixture.requests.length;
  await page.reload();
  // The existing single-profile startup policy re-enters the selected profile.
  await openLibrary(page);
  await expectLibrary(page, "B");
  await expect.poll(() => fixture.requests.slice(start).some((entry) => entry.operation === "sync_pull_library")).toBe(true);
  expect(fixture.requests.slice(start).some((entry) => entry.operation === "password-login")).toBe(false);
  expect(fixture.unexpected).toEqual([]);
});

test("removing the final saved item sends an empty current-account snapshot from the bundled UI", async ({ context, page }) => {
  const fixture = await installIdentityFixture(context, { allowLibraryWrites: true });
  await page.goto("/");
  await signIn(page, "B");
  await expectLibrary(page, "B");
  await page.locator('#library .library-grid-card[data-item-id="fixture-library-b"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove from Library", exact: true }).click();
  await expect(page.locator('#library .library-grid-card[data-item-id="fixture-library-b"]')).toHaveCount(0);
  await expect.poll(() => fixture.libraryWrites).toEqual([{ alias: "B", profileId: 1, items: [] }]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("savedLibraryItems") || "[]"))).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

test("clean independent receiver reflects deletion of the final cloud item on reload", async ({ browser, context, page }) => {
  const backend = { libraries: new Map(Object.keys(accounts).map((alias) => [alias, library(alias)])), libraryWrites: [] };
  const writer = await installIdentityFixture(context, { allowLibraryWrites: true, backend });
  await page.goto("/");
  await signIn(page, "B");
  await expectLibrary(page, "B");
  const receiverContext = await browser.newContext({ serviceWorkers: "block" });
  try {
    const observer = await installIdentityFixture(receiverContext, { backend });
    const receiver = await receiverContext.newPage();
    await receiver.goto("http://127.0.0.1:4371");
    await signIn(receiver, "B");
    await expectLibrary(receiver, "B");
    await page.locator('#library .library-grid-card[data-item-id="fixture-library-b"]').click({ button: "right" });
    await page.getByRole("menuitem", { name: "Remove from Library", exact: true }).click();
    await expect.poll(() => backend.libraryWrites).toEqual([{ alias: "B", profileId: 1, items: [] }]);
    expect(backend.libraries.get("B")).toEqual([]);
    expect(backend.libraries.get("A")).toEqual(library("A"));
    const start = observer.requests.length;
    await receiver.reload();
    await openLibrary(receiver);
    await expect.poll(() => observer.requests.slice(start).some((entry) => entry.operation === "sync_pull_library")).toBe(true);
    await expect(receiver.locator('#library .library-grid-card[data-item-id="fixture-library-b"]')).toHaveCount(0);
    expect(await receiver.evaluate(() => JSON.parse(localStorage.getItem("savedLibraryItems") || "[]"))).toEqual([]);
    expect(writer.unexpected).toEqual([]);
    expect(observer.unexpected).toEqual([]);
  } finally { await receiverContext.close(); }
});

test("failed local removal stays pending across reload and a competing nonempty cloud pull", async ({ context, page }) => {
  const fixture = await installIdentityFixture(context, { allowLibraryWrites: true, rejectLibraryWrites: true });
  await page.goto("/");
  await signIn(page, "B");
  await expectLibrary(page, "B");
  await page.locator('#library .library-grid-card[data-item-id="fixture-library-b"]').click({ button: "right" });
  const rejected = page.waitForResponse((response) => new URL(response.url()).pathname === "/rest/v1/rpc/sync_push_library");
  await page.getByRole("menuitem", { name: "Remove from Library", exact: true }).click();
  expect((await rejected).status()).toBe(503);
  await expect(page.locator('#library .library-grid-card[data-item-id="fixture-library-b"]')).toHaveCount(0);
  const start = fixture.requests.length;
  await page.reload();
  await openLibrary(page);
  await expect.poll(() => fixture.requests.slice(start).some((entry) => entry.operation === "sync_pull_library")).toBe(true);
  await expect(page.locator('#library .library-grid-card[data-item-id="fixture-library-b"]')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("savedLibraryItems") || "[]"))).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("savedLibrarySyncState")).profiles["1"].pending)).toBe(true);
  expect(fixture.unexpected).toEqual([]);
});
