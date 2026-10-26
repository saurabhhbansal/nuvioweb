import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  isSettingsRoute,
  readSettingsRouteSection,
  SETTINGS_ROUTE,
  SETTINGS_SECTION_ROUTE
} from "./settingsRoutes.js";

test("the index route shows no section", () => {
  assert.equal(readSettingsRouteSection(SETTINGS_ROUTE, {}), null);
  assert.equal(readSettingsRouteSection(SETTINGS_ROUTE, { section: "appearance" }), null);
});

test("the section route carries the section it was opened for", () => {
  assert.equal(
    readSettingsRouteSection(SETTINGS_SECTION_ROUTE, { section: "playback" }),
    "playback"
  );
  assert.equal(
    readSettingsRouteSection(SETTINGS_SECTION_ROUTE, { section: "appearance" }),
    "appearance"
  );
});

test("a section route without a usable section falls back to the index", () => {
  assert.equal(readSettingsRouteSection(SETTINGS_SECTION_ROUTE, {}), null);
  assert.equal(readSettingsRouteSection(SETTINGS_SECTION_ROUTE, { section: "" }), null);
  assert.equal(readSettingsRouteSection(SETTINGS_SECTION_ROUTE, { section: "   " }), null);
  assert.equal(readSettingsRouteSection(SETTINGS_SECTION_ROUTE, null), null);
});

test("an unknown route name is never treated as a section", () => {
  assert.equal(readSettingsRouteSection("home", { section: "appearance" }), null);
  assert.equal(readSettingsRouteSection(null, { section: "appearance" }), null);
});

test("both Settings pages count as Settings", () => {
  assert.equal(isSettingsRoute(SETTINGS_ROUTE), true);
  assert.equal(isSettingsRoute(SETTINGS_SECTION_ROUTE), true);
  assert.equal(isSettingsRoute("home"), false);
  assert.equal(isSettingsRoute(undefined), false);
});

// Trakt and Simkl sign-in polling, and the live Downloads refresh, each
// checked for "settings" alone and so stopped on the section page the browser
// shows them on. Every check in the screen goes through isSettingsRoute.
test("the settings screen never compares the route with \"settings\" alone", () => {
  const source = readFileSync(new URL("./settingsScreen.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /getCurrent\(\)\s*[!=]==\s*["']settings["']/);
});
