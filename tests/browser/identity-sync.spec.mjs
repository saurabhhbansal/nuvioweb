import { test, expect } from "@playwright/test";

const identityOrigin = "https://identity.example.invalid";
const addonOrigin = "https://addons.example.invalid";
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

function token(alias, expiresIn = 4102444800) {
  const payload = { sub: accounts[alias].id, email: accounts[alias].email, exp: expiresIn };
  return `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.synthetic`;
}

function scopedKey(alias, profileId) {
  return `${alias}:${profileId}`;
}
const libraryKey = (alias, profileId) => `fixture-library-${alias.toLowerCase()}-${profileId}`;
const watchedKey = (alias, profileId) => `watched-${alias.toLowerCase()}-${profileId}`;
const progressKey = (alias, profileId) => `progress-${alias.toLowerCase()}-${profileId}`;
const addonUrl = (alias, profileId) => `${addonOrigin}/${alias.toLowerCase()}-${profileId}`;
const addonManifestId = (alias, profileId) => `fixture-addon-${alias.toLowerCase()}-${profileId}`;

function libraryRow(alias, profileId) {
  return {
    content_id: libraryKey(alias, profileId),
    content_type: "movie",
    name: `Fixture ${alias} profile ${profileId} Library`,
    poster_shape: "POSTER",
    genres: [],
    added_at: 1700000000000
  };
}
function watchedRow(alias, profileId, suffix = "") {
  return {
    content_id: `${watchedKey(alias, profileId)}${suffix}`,
    content_type: "movie",
    title: `Fixture ${alias} profile ${profileId} watched${suffix}`,
    watched_at: 1700000000000
  };
}
function progressRow(alias, profileId, suffix = "") {
  return {
    content_id: `${progressKey(alias, profileId)}${suffix}`,
    content_type: "movie",
    title: `Fixture ${alias} profile ${profileId} progress${suffix}`,
    position_ms: 60000,
    duration_ms: 120000,
    updated_at: 1700000000000
  };
}
function addonRow(alias, profileId) {
  return {
    url: addonUrl(alias, profileId),
    enabled: true,
    sort_order: 0,
    profile_id: Number(profileId),
    user_id: accounts[alias].owner
  };
}

export function nonemptyBackend() {
  const state = {
    libraries: new Map(),
    watched: new Map(),
    progress: new Map(),
    addons: new Map(),
    libraryWrites: [],
    unknownWrites: []
  };
  for (const alias of Object.keys(accounts)) {
    for (const profileId of [1, 2]) {
      const key = scopedKey(alias, profileId);
      state.libraries.set(key, [libraryRow(alias, profileId)]);
      state.watched.set(key, [watchedRow(alias, profileId)]);
      state.progress.set(key, [progressRow(alias, profileId)]);
      state.addons.set(key, [addonRow(alias, profileId)]);
    }
  }
  return state;
}

function profileRows(alias, twoProfiles) {
  if (!twoProfiles) {
    return [{ profile_index: 1, name: `Fixture ${alias}`, is_primary: true }];
  }
  return [
    {
      profile_index: 1,
      name: `Fixture ${alias}`,
      is_primary: true,
      uses_primary_addons: false
    },
    {
      profile_index: 2,
      name: `Fixture ${alias} Two`,
      is_primary: false,
      uses_primary_addons: false
    }
  ];
}

async function installIdentityFixture(context, {
  criticalGate = null,
  withCatalog = false,
  catalogGate = null,
  libraryGates = {},
  allowLibraryWrites = false,
  backend = null,
  rejectLibraryWrites = false,
  nonempty = false,
  twoProfiles = false
} = {}) {
  const requests = [];
  const completions = [];
  const unexpected = [];
  const settings = new Map();
  const state = backend || (nonempty ? nonemptyBackend() : null);
  const libraries = backend?.libraries || new Map(Object.keys(accounts).map((alias) => [alias, library(alias)]));
  const libraryWrites = state?.libraryWrites || backend?.libraryWrites || [];
  const provider = "https://catalog.example.invalid";
  let catalogRequested = false;
  let offline = false;
  let abortedIdentityRequests = 0;
  let refreshRejections = 0;
  const emptyReads = new Set([
    "sync_pull_profile_locks", "sync_pull_profile_settings_blob", "sync_pull_home_catalog_settings",
    "sync_pull_collections", "sync_pull_plugins", "sync_pull_trakt_credentials",
    "sync_pull_simkl_credentials", "sync_pull_provider_credentials"
  ]);
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:4371") return route.continue();
    if (offline && url.origin === identityOrigin) { abortedIdentityRequests += 1; return route.abort("failed"); }
    if (url.origin === addonOrigin && nonempty) {
      const match = url.pathname.match(/^\/([a-z])-(\d)(-new)?\/manifest\.json$/);
      if (!match) {
        unexpected.push({ operation: url.pathname, reason: "unknown-addon-path" });
        return route.abort("blockedbyclient");
      }
      const alias = match[1].toUpperCase();
      const profileId = match[2];
      if (!accounts[alias] || !["1", "2"].includes(profileId)) {
        unexpected.push({ operation: url.pathname, reason: "unknown-addon-account-or-profile" });
        return route.abort("blockedbyclient");
      }
      expect(request.headers().authorization).toBeUndefined();
      expect(request.headers().apikey).toBeUndefined();
      return route.fulfill({ json: {
        id: addonManifestId(alias, profileId),
        name: `Fixture ${alias} profile ${profileId} addon`,
        version: "1.0.0",
        types: ["movie"],
        resources: [],
        catalogs: []
      } });
    }
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
    if (url.origin !== identityOrigin) {
      // Inert inherited presentation resources are denied explicitly. Every
      // other foreign destination is an assertion failure, even if blocked.
      if (!["https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://image.tmdb.org"].includes(url.origin) && !((url.origin === "https://v3-cinemeta.strem.io" && ["/manifest.json", "/catalog/movie/top.json", "/catalog/series/top.json"].includes(url.pathname)) || (url.origin === "https://opensubtitles-v3.strem.io" && url.pathname === "/manifest.json"))) {
        unexpected.push({ origin: url.origin, path: url.pathname, reason: "unknown-destination" });
      }
      return route.abort("blockedbyclient");
    }
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const operation = url.pathname.replace("/rest/v1/rpc/", "");
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      const body = request.postDataJSON();
      const alias = Object.keys(accounts).find((key) => accounts[key].email === body.email);
      if (!alias || body.password !== "synthetic-password") return json({ error: "invalid fixture login" }, 400);
      requests.push({ alias, operation: "password-login" });
      completions.push({ alias, operation: "password-login" });
      return json({ access_token: token(alias), refresh_token: `fixture-refresh-${alias}`, user: accounts[alias], expires_in: 3600 });
    }
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      requests.push({ alias: null, operation: "refresh" });
      const body = request.postDataJSON();
      const alias = Object.keys(accounts).find((key) => `fixture-refresh-${key}` === body.refresh_token);
      if (!alias || offline) { refreshRejections += 1; return json({ error: "invalid_grant" }, 401); }
      completions.push({ alias, operation: "refresh" });
      return json({ access_token: token(alias), refresh_token: `fixture-refresh-${alias}` });
    }
    if (operation === "get_avatar_catalog" && request.method() === "POST") return json([]);
    const alias = Object.keys(accounts).find((key) => request.headers().authorization === `Bearer ${token(key)}`);
    if (!alias) {
      unexpected.push({ operation, reason: "missing-fixture-session" });
      return json({ error: "fixture session required" }, 401);
    }
    requests.push({ alias, operation });
    if (url.pathname === "/auth/v1/user") { completions.push({ alias, operation }); return json(accounts[alias]); }
    if (operation === "get_sync_owner") { completions.push({ alias, operation }); return json(accounts[alias].owner); }
    if (operation === "sync_pull_profiles") {
      completions.push({ alias, operation });
      return json(profileRows(alias, twoProfiles));
    }
    let body = {};
    try { body = request.postDataJSON() || {}; } catch { body = {}; }
    const rawProfile = body.p_profile_id ?? url.searchParams.get("profile_id")?.replace("eq.", "");
    const strictProfileOperations = new Set([
      "sync_pull_library", "sync_push_library_items", "sync_delete_library_items", "sync_pull_watched_items",
      "sync_push_watched_items", "sync_pull_watch_progress", "sync_push_watch_progress",
      "sync_push_profile_settings_blob"
    ]);
    if (strictProfileOperations.has(operation) && rawProfile == null) {
      unexpected.push({ operation, reason: "missing-profile-scope" });
      return json({ error: "missing fixture profile scope" }, 400);
    }
    const profileId = String(rawProfile ?? 1);
    if (operation === "sync_pull_library") {
      requests[requests.length - 1].profileId = profileId;
      if (libraryGates[alias]) await libraryGates[alias].promise;
      if (nonempty) {
        completions.push({ alias, operation, profileId });
        return json(state.libraries.get(scopedKey(alias, profileId)) || []);
      }
      return json(libraries.get(alias));
    }
    if (allowLibraryWrites && ["sync_push_library_items", "sync_delete_library_items"].includes(operation) && request.method() === "POST") {
      expect(profileId).toBe("1");
      const isDelete = operation === "sync_delete_library_items";
      const changes = isDelete ? body.p_keys : body.p_items;
      expect(Array.isArray(changes)).toBe(true);
      libraryWrites.push({ alias, profileId: Number(profileId), operation, changes });
      if (rejectLibraryWrites) return json({ error: "synthetic write unavailable" }, 503);
      let current = nonempty ? state.libraries.get(scopedKey(alias, profileId)) || [] : libraries.get(alias) || [];
      for (const change of changes) {
        current = current.filter(row => row.content_id !== change.content_id || row.content_type !== change.content_type);
        if (!isDelete) current.push(change);
      }
      if (nonempty) state.libraries.set(scopedKey(alias, profileId), current);
      else libraries.set(alias, current);
      completions.push({ alias, operation, profileId });
      return json(null);
    }
    if (url.pathname === "/rest/v1/addons" && request.method() === "GET") {
      requests[requests.length - 1].profileId = profileId;
      if (nonempty) {
        completions.push({ alias, operation: "addons", profileId });
        return json(state.addons.get(scopedKey(alias, profileId)) || []);
      }
      return json(withCatalog ? [{ url: provider, enabled: true, sort_order: 0 }] : []);
    }
    if (operation === "sync_pull_watched_items") {
      requests[requests.length - 1].profileId = profileId;
      if (nonempty) {
        completions.push({ alias, operation, profileId });
        return json(body.p_page && Number(body.p_page) > 1 ? [] : state.watched.get(scopedKey(alias, profileId)) || []);
      }
      return json([]);
    }
    if (operation === "sync_pull_watch_progress") {
      requests[requests.length - 1].profileId = profileId;
      if (nonempty) {
        completions.push({ alias, operation, profileId });
        return json(state.progress.get(scopedKey(alias, profileId)) || []);
      }
      return json([]);
    }
    if (operation === "sync_push_watched_items" && request.method() === "POST") {
      if (nonempty) {
        if (!Array.isArray(body.p_items)) return json({ error: "invalid watched snapshot" }, 400);
        state.watched.set(scopedKey(alias, profileId), body.p_items);
        completions.push({ alias, operation, profileId });
        return json(null);
      }
      expect(body.p_profile_id).toBe(1);
      expect(body.p_items).toEqual([]);
      return json(null);
    }
    if (operation === "sync_push_watch_progress" && request.method() === "POST") {
      if (!nonempty) {
        unexpected.push({ operation, method: request.method(), reason: "unexpected-progress-write" });
        return json({ error: "unimplemented fixture operation" }, 400);
      }
      if (!Array.isArray(body.p_items)) return json({ error: "invalid progress snapshot" }, 400);
      state.progress.set(scopedKey(alias, profileId), body.p_items);
      completions.push({ alias, operation, profileId });
      return json(null);
    }
    if (operation === "sync_pull_profile_settings_blob") {
      const settingsKey = nonempty ? `${alias}:${profileId}` : alias;
      if (criticalGate) await criticalGate.promise;
      completions.push({ alias, operation, profileId });
      return json(settings.has(settingsKey) ? [{ settings_json: settings.get(settingsKey) }] : []);
    }
    if (operation === "sync_pull_home_catalog_settings") {
      completions.push({ alias, operation, profileId });
      return json([]);
    }
    if (operation === "sync_push_profile_settings_blob" && request.method() === "POST") {
      const pushedProfile = String(body.p_profile_id);
      expect(["1", "2"]).toContain(pushedProfile);
      if (!nonempty) expect(pushedProfile).toBe("1");
      expect(body.p_settings_json).toBeTruthy();
      settings.set(nonempty ? `${alias}:${pushedProfile}` : alias, body.p_settings_json);
      completions.push({ alias, operation, profileId: pushedProfile });
      return json(null);
    }
    if (emptyReads.has(operation)) { completions.push({ alias, operation }); return json([]); }
    if (url.pathname === "/rest/v1/plugins" && request.method() === "GET") return json([]);
    if (["register_current_device", "sync_seed_provider_credentials"].includes(operation) && request.method() === "POST") {
      completions.push({ alias, operation });
      return json(null);
    }
    unexpected.push({ operation, method: request.method() });
    return json({ error: "unimplemented fixture operation" }, 400);
  });
  return {
    requests,
    completions,
    unexpected,
    libraryWrites,
    state,
    catalogRequested: () => catalogRequested,
    abortedIdentityRequests: () => abortedIdentityRequests,
    refreshRejections: () => refreshRejections,
    setOffline: (value) => { offline = Boolean(value); }
  };
}

function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

async function signIn(page, alias, profileId = "1") {
  await page.locator("#desktop-auth-email").fill(accounts[alias].email);
  await page.locator("#desktop-auth-password").fill("synthetic-password");
  await page.locator(".desktop-auth-submit").click();
  await expect(page.locator(`#profileSelection .profile-card[data-profile-id="${profileId}"]`)).toBeVisible();
  await page.locator(`#profileSelection .profile-card[data-profile-id="${profileId}"]`).click();
  await openLibrary(page);
}

async function selectProfile(page, profileId) {
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.locator("#profileSelection")).toBeVisible();
  await page.locator(`#profileSelection .profile-card[data-profile-id="${profileId}"]`).click();
  await openLibrary(page);
  await expectNonemptyLibrary(page, profileId);
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

async function expectNonemptyLibrary(page, profileId) {
  await expect.poll(() => page.locator("#library .library-grid-card").count()).toBe(1);
  const cards = await page.locator("#library .library-grid-card").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-item-id"))
  );
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatch(new RegExp(`^fixture-library-[ab]-${profileId}$`));
  const keys = await page.evaluate(() => JSON.parse(localStorage.getItem("savedLibraryItems") || "[]").map((item) => ({ contentId: item.contentId, profileId: String(item.profileId || "1") })));
  expect(keys.filter((item) => item.profileId === String(profileId)).map((item) => item.contentId)).toEqual(cards);
}

async function localSnapshot(page) {
  return page.evaluate(() => {
    const parse = (key, fallback) => {
      try { return JSON.parse(localStorage.getItem(key) || fallback); }
      catch { return fallback; }
    };
    return {
      watched: parse("watchedItems", []).map((item) => ({ contentId: item.contentId, profileId: String(item.profileId || "1") })),
      progress: parse("watchProgressItems", []).map((item) => ({ contentId: item.contentId, profileId: String(item.profileId || "1") })),
      addons: parse("installedAddonUrls", { profiles: {} }).profiles,
      library: parse("savedLibraryItems", []).map((item) => ({ contentId: item.contentId, profileId: String(item.profileId || "1") }))
    };
  });
}

async function expectExactScopedData(page, alias, profileId) {
  const snapshot = await localSnapshot(page);
  expect(snapshot.library.filter((item) => item.profileId === String(profileId)).map((item) => item.contentId)).toEqual([libraryKey(alias, profileId)]);
  expect(snapshot.watched.filter((item) => item.profileId === String(profileId)).map((item) => item.contentId)).toEqual([watchedKey(alias, profileId)]);
  expect(snapshot.progress.filter((item) => item.profileId === String(profileId)).map((item) => item.contentId)).toEqual([progressKey(alias, profileId)]);
  expect(snapshot.addons[String(profileId)]).toEqual([addonUrl(alias, profileId)]);
  const foreignAlias = alias === "A" ? "b" : "a";
  expect(snapshot.library.some((item) => item.contentId.includes(`-${foreignAlias}-`))).toBe(false);
  expect(snapshot.watched.some((item) => item.contentId.includes(`-${foreignAlias}-`))).toBe(false);
  expect(snapshot.progress.some((item) => item.contentId.includes(`-${foreignAlias}-`))).toBe(false);
  expect(Object.values(snapshot.addons).flat().some((url) => url.includes(`/${foreignAlias}-`))).toBe(false);
}

async function expectNoOtherProfileData(page, alias, profileId) {
  const snapshot = await localSnapshot(page);
  const currentProfile = String(profileId);
  const otherProfile = currentProfile === "1" ? "2" : "1";
  expect(snapshot.watched.filter((item) => item.profileId === currentProfile).map((item) => item.contentId)).not.toContain(watchedKey(alias, otherProfile));
  expect(snapshot.progress.filter((item) => item.profileId === currentProfile).map((item) => item.contentId)).not.toContain(progressKey(alias, otherProfile));
  expect(snapshot.addons[currentProfile]).not.toContain(addonUrl(alias, otherProfile));
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

test("removing the final saved item sends only its exact current-account delete from the bundled UI", async ({ context, page }) => {
  const fixture = await installIdentityFixture(context, { allowLibraryWrites: true });
  await page.goto("/");
  await signIn(page, "B");
  await expectLibrary(page, "B");
  await page.locator('#library .library-grid-card[data-item-id="fixture-library-b"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove from Library", exact: true }).click();
  await expect(page.locator('#library .library-grid-card[data-item-id="fixture-library-b"]')).toHaveCount(0);
  await expect.poll(() => fixture.libraryWrites).toEqual([{ alias: "B", profileId: 1, operation: "sync_delete_library_items", changes: [{ content_id: "fixture-library-b", content_type: "movie" }] }]);
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
    await expect.poll(() => backend.libraryWrites).toEqual([{ alias: "B", profileId: 1, operation: "sync_delete_library_items", changes: [{ content_id: "fixture-library-b", content_type: "movie" }] }]);
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
  const rejected = page.waitForResponse((response) => new URL(response.url()).pathname === "/rest/v1/rpc/sync_delete_library_items");
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

test("two profiles keep distinguishable nonempty add-on, watched, progress and Library sets", async ({ context, page }) => {
  const fixture = await installIdentityFixture(context, { nonempty: true, twoProfiles: true });
  await page.goto("/");
  await signIn(page, "B", "1");
  await expectNonemptyLibrary(page, "1");
  await expectExactScopedData(page, "B", 1);

  await selectProfile(page, "2");
  await expectExactScopedData(page, "B", 2);
  await expectNoOtherProfileData(page, "B", 2);
  expect((await localSnapshot(page)).library.filter((item) => item.profileId === "2").map((item) => item.contentId)).toEqual([libraryKey("B", 2)]);
  expect((await localSnapshot(page)).library.filter((item) => item.profileId === "2").map((item) => item.contentId)).not.toContain(libraryKey("B", 1));

  await selectProfile(page, "1");
  await expectExactScopedData(page, "B", 1);
  await expectNoOtherProfileData(page, "B", 1);
  expect((await localSnapshot(page)).library.filter((item) => item.profileId === "1").map((item) => item.contentId)).not.toContain(libraryKey("B", 2));

  await signOut(page);
  await signIn(page, "A", "1");
  await expectNonemptyLibrary(page, "1");
  await expectExactScopedData(page, "A", 1);

  // Complete B→A→B and A→B→A with all four nonempty domains,
  // including both profiles, in the same storage context.
  for (const alias of ["B", "A"]) {
    await signOut(page);
    await signIn(page, alias, "1");
    await expectExactScopedData(page, alias, 1);
    await selectProfile(page, "2");
    await expectExactScopedData(page, alias, 2);
    await expectNoOtherProfileData(page, alias, 2);
    await selectProfile(page, "1");
    await expectExactScopedData(page, alias, 1);
  }

  const operations = fixture.completions.map((entry) => `${entry.alias}:${entry.operation}:${entry.profileId ?? "-"}`);
  expect(operations).toContain("B:sync_pull_library:1");
  expect(operations).toContain("B:sync_pull_library:2");
  expect(operations).toContain("B:sync_pull_watched_items:2");
  expect(operations).toContain("B:sync_pull_watch_progress:2");
  expect(operations).toContain("A:sync_pull_library:1");
  expect(fixture.unexpected).toEqual([]);
});

test("a synthetic same-profile mutation appears only in an independent receiver context", async ({ browser, context, page }) => {
  const backend = nonemptyBackend();
  const writer = await installIdentityFixture(context, { nonempty: true, twoProfiles: true, backend });
  await page.goto("/");
  await signIn(page, "B", "1");
  await expectExactScopedData(page, "B", 1);

  // Fixture backend setup, not an application UI write: add one new key of each domain.
  backend.watched.set(scopedKey("B", 1), [...backend.watched.get(scopedKey("B", 1)), watchedRow("B", 1, "-new")]);
  backend.progress.set(scopedKey("B", 1), [...backend.progress.get(scopedKey("B", 1)), progressRow("B", 1, "-new")]);
  backend.libraries.set(scopedKey("B", 1), [...backend.libraries.get(scopedKey("B", 1)), { ...libraryRow("B", 1), content_id: `${libraryKey("B", 1)}-new`, name: "Fixture B profile 1 new Library" }]);
  backend.addons.set(scopedKey("B", 1), [...backend.addons.get(scopedKey("B", 1)), { ...addonRow("B", 1), url: addonUrl("B", 1).replace("/b-1", "/b-1-new") }]);

  const receiverContext = await browser.newContext({ serviceWorkers: "block" });
  try {
    const receiverFixture = await installIdentityFixture(receiverContext, { nonempty: true, twoProfiles: true, backend });
    const receiver = await receiverContext.newPage();
    await receiver.goto("http://127.0.0.1:4371");
    await signIn(receiver, "B", "1");
    const snapshot = await localSnapshot(receiver);
    expect(snapshot.library.map((item) => item.contentId)).toContain(`${libraryKey("B", 1)}-new`);
    expect(snapshot.watched.map((item) => item.contentId)).toContain(`${watchedKey("B", 1)}-new`);
    expect(snapshot.progress.map((item) => item.contentId)).toContain(`${progressKey("B", 1)}-new`);
    expect(snapshot.addons["1"]).toContain(addonUrl("B", 1).replace("/b-1", "/b-1-new"));
    expect(snapshot.library.map((item) => item.contentId).some((key) => key.includes("-a-"))).toBe(false);
    expect(snapshot.watched.map((item) => item.contentId).some((key) => key.includes("-a-"))).toBe(false);
    expect(snapshot.progress.map((item) => item.contentId).some((key) => key.includes("-a-"))).toBe(false);
    expect(Object.values(snapshot.addons).flat().some((url) => url.includes("/a-"))).toBe(false);

    const otherContext = await browser.newContext({ serviceWorkers: "block" });
    try {
      const otherFixture = await installIdentityFixture(otherContext, { nonempty: true, twoProfiles: true, backend });
      const other = await otherContext.newPage();
      await other.goto("http://127.0.0.1:4371");
      await signIn(other, "A", "1");
      await expectExactScopedData(other, "A", 1);
      const otherSnapshot = await localSnapshot(other);
      expect(otherSnapshot.library.map((item) => item.contentId)).not.toContain(`${libraryKey("B", 1)}-new`);
      expect(otherSnapshot.watched.map((item) => item.contentId)).not.toContain(`${watchedKey("B", 1)}-new`);
      expect(otherSnapshot.progress.map((item) => item.contentId)).not.toContain(`${progressKey("B", 1)}-new`);
      expect(receiverFixture.unexpected).toEqual([]);
      expect(otherFixture.unexpected).toEqual([]);
    } finally {
      await otherContext.close();
    }
    expect(writer.unexpected).toEqual([]);
  } finally {
    await receiverContext.close();
  }
});

test("expired access with a rejected refresh cannot resume an authenticated session", async ({ context, page }) => {
  const fixture = await installIdentityFixture(context);
  await page.goto("/");
  await signIn(page, "B");
  await expectLibrary(page, "B");
  const expired = token("B", Math.floor(Date.now() / 1000) - 3600);
  await page.evaluate((value) => {
    localStorage.setItem("access_token", value);
    localStorage.setItem("refresh_token", "fixture-refresh-revoked");
  }, expired);
  const refreshStart = fixture.requests.length;
  await page.reload();
  await expect(page.locator("#desktop-auth-email")).toBeVisible();
  await expect(page.locator("#profileSelection")).not.toBeVisible();
  expect(await page.evaluate(() => history.state?.route)).toMatch(/auth/i);
  await expect.poll(() => fixture.requests.slice(refreshStart).some((entry) => entry.operation === "refresh")).toBe(true);
  expect(fixture.refreshRejections()).toBeGreaterThan(0);
  expect(fixture.unexpected).toEqual([]);
});

test("offline reload cannot complete a new server-valid sync or introduce foreign account data", async ({ context, page }) => {
  const fixture = await installIdentityFixture(context);
  await page.goto("/");
  await signIn(page, "B");
  await expectLibrary(page, "B");
  fixture.setOffline(true);
  const before = fixture.completions.length;
  await page.reload();
  await page.waitForTimeout(2000);
  const snapshot = await localSnapshot(page);
  const route = await page.evaluate(() => history.state?.route || null);
  expect(fixture.completions.length).toBe(before);
  expect(fixture.abortedIdentityRequests()).toBeGreaterThan(0);
  expect(snapshot.library.every((item) => item.contentId.includes("-b") || item.contentId.includes("-b-"))).toBe(true);
  expect(snapshot.watched.every((item) => item.contentId.includes("-b") || item.contentId.includes("-b-"))).toBe(true);
  expect(route === null || route === "profileSelection" || route === "home" || route === "quickSetup").toBe(true);
  expect(fixture.unexpected).toEqual([]);
});


test("unknown foreign destinations are recorded even when blocked", async ({ context, page }) => {
  const fixture = await installIdentityFixture(context);
  await page.goto("https://unlisted.fixture.invalid/probe").catch(() => {});
  expect(fixture.unexpected).toEqual([expect.objectContaining({ origin: "https://unlisted.fixture.invalid" })]);
});

test("explicit UI deletion preserves an unseen concurrent Library addition", async ({ context, page }) => {
  const backend = { libraries: new Map(Object.keys(accounts).map(alias => [alias, library(alias)])), libraryWrites: [] };
  const fixture = await installIdentityFixture(context, { allowLibraryWrites: true, backend });
  await page.goto("/");
  await signIn(page, "B");
  await expectLibrary(page, "B");
  // A different writer adds a key after this app has pulled its older set.
  // This is backend setup, not an application Save-path claim.
  const concurrent = { ...library("B")[0], content_id: "fixture-concurrent-new-key" };
  backend.libraries.get("B").push(concurrent);
  await page.locator('#library .library-grid-card[data-item-id="fixture-library-b"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove from Library", exact: true }).click();
  await expect.poll(() => backend.libraryWrites.length).toBe(1);
  expect(backend.libraries.get("B").map(row => row.content_id)).toEqual([concurrent.content_id]);
  expect(backend.libraries.get("A")).toEqual(library("A"));
  expect(fixture.unexpected).toEqual([]);
});
