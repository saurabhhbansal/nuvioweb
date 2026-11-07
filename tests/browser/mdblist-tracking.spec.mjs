import { test, expect } from "@playwright/test";
import { installFakeAccount, openSignedInHome } from "./fakeAccount.mjs";

// MDBList tracking end to end against a stand-in for api.mdblist.com: connect
// with an API key, pick MDBList as the watch progress source, and check every
// call goes straight to MDBList as a CORS "simple" request (MDBList answers its
// preflight with 405).
const MDBLIST = "https://api.mdblist.com";

test("MDBList connects with an API key and becomes a watch progress source", async ({ page, context }) => {
  const calls = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:4371") return route.continue();
    if (url.origin !== MDBLIST) return route.abort("blockedbyclient");
    calls.push({
      path: url.pathname,
      method: request.method(),
      key: url.searchParams.get("apikey"),
      contentType: request.headers()["content-type"] || "",
      authorization: request.headers()["authorization"] || ""
    });
    const json = (body) =>
      route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    if (url.searchParams.get("apikey") !== "fixture-mdblist-key") {
      return route.fulfill({ status: 403, headers: { "Access-Control-Allow-Origin": "*" }, body: '{"error":"Invalid API key"}' });
    }
    if (url.pathname === "/user") return json({ user_id: 1, username: "fixture" });
    if (url.pathname === "/sync/playback") return json([]);
    if (url.pathname === "/sync/watched" && request.method() === "GET") return json({ movies: [], shows: [] });
    return json({ ok: true });
  });
  await installFakeAccount(context);
  await openSignedInHome(page, { expect });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator('#settings [data-focus-key="nav:trakt"]').click();

  const row = page.locator('[data-focus-key="tracking:desktop:mdblist"]');
  await expect(row).toContainText("Not connected");
  await row.click();
  await page.locator('[data-focus-key="tracking:desktop:mdblist:connect"]').click();

  // A wrong key is refused and nothing is saved.
  const field = page.locator('[data-text-dialog-role="field"]');
  await field.fill("wrong-key");
  await page.locator('[data-text-dialog-action="save"]').click();
  await expect(page.locator(".settings-text-dialog-message.error")).toBeVisible();
  await field.fill("fixture-mdblist-key");
  await page.locator('[data-text-dialog-action="save"]').click();
  await expect(row).toContainText("Connected");

  // MDBList is now offered as the watch progress source.
  await page.locator('[data-focus-key="tracking:desktop:behavior"]').click();
  await page.locator('[data-focus-key="tracking:desktop:progress"]').click();
  await page.locator('[data-dialog-option-id="mdblist"]').click();
  await expect(page.locator('[data-focus-key="tracking:desktop:progress"]')).toContainText("MDBList");

  await page.locator('[data-focus-key="tracking:desktop:mdblist:refresh"]').click();
  await expect.poll(() => calls.some((call) => call.path === "/sync/playback")).toBe(true);
  for (const call of calls) {
    expect(call.authorization).toBe("");
    expect(call.contentType).not.toMatch(/application\/json/);
  }
  expect(calls.every((call) => call.method !== "OPTIONS")).toBe(true);

  // Disconnecting keeps the key (ratings use it) and hands progress back to Nuvio Sync.
  await page.locator('[data-focus-key="tracking:desktop:mdblist:disconnect"]').click();
  await page.locator('[data-dialog-option-id="disconnect"]').click();
  await expect(row).toContainText("Not connected");
  await expect(page.locator('[data-focus-key="tracking:desktop:progress"]')).toContainText("Nuvio Sync");
  const saved = await page.evaluate(() => localStorage.getItem("mdbListSettings"));
  expect(saved).toContain("fixture-mdblist-key");
});

test("MDBList's watchlist and lists show up as the Library", async ({ page, context }) => {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:4371") return route.continue();
    if (url.origin !== MDBLIST) return route.abort("blockedbyclient");
    const json = (body) =>
      route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) });
    if (url.pathname === "/lists/user") return json([{ id: 7, name: "Favourites", type: "static" }]);
    if (url.pathname === "/watchlist/items")
      return json({ movies: [{ title: "Arrival", release_year: 2016, imdb_id: "tt2543164", mediatype: "movie" }], shows: [] });
    if (url.pathname === "/lists/7/items")
      return json({ movies: [], shows: [{ title: "Dark", release_year: 2017, imdb_id: "tt5753856", mediatype: "show" }] });
    return json([]);
  });
  await context.addInitScript(() => {
    const scoped = (value) => JSON.stringify({ __profileScoped: true, version: 1, profiles: { 1: value } });
    localStorage.setItem("mdbListSettings", scoped({ apiKey: "fixture-mdblist-key", trackingEnabled: true }));
    localStorage.setItem("traktSettings", scoped({ librarySourceMode: "mdblist", watchProgressSource: "nuvio_sync" }));
  });
  await installFakeAccount(context);
  await openSignedInHome(page, { expect });
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.locator('#library .library-grid-card[data-item-id="tt2543164"]')).toBeVisible();
  await expect(page.locator("#library")).toContainText("MDBLIST · 1 title");
  // The user's static lists are offered next to the watchlist.
  await page.locator('#library [data-action="toggleLibraryFilters"]').click();
  await page.locator('#library .library-picker-anchor[data-picker="list"]').click();
  await page.locator('#library .library-picker-option[data-picker="list"]', { hasText: "Favourites" }).click();
  await expect(page.locator('#library .library-grid-card[data-item-id="tt5753856"]')).toBeVisible();
  await expect(page.locator('#library .library-grid-card[data-item-id="tt2543164"]')).toHaveCount(0);
});
