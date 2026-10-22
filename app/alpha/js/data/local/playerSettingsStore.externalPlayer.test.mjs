import test from "node:test";
import assert from "node:assert/strict";
import { PlayerSettingsStore, normalizePlayerSettings } from "./playerSettingsStore.js";

test("external player defaults to in-browser playback and keeps the Android chooser id", () => {
  assert.equal(PlayerSettingsStore.getDefaults().browserExternalPlayer, "disabled");
  for (const id of ["chooser", "lenna", "outplayer", "infuse", "vlc"]) {
    assert.equal(normalizePlayerSettings({ browserExternalPlayer: id }).browserExternalPlayer, id);
  }
  assert.equal(normalizePlayerSettings({ browserExternalPlayer: "not-a-player" }).browserExternalPlayer, "disabled");
});
