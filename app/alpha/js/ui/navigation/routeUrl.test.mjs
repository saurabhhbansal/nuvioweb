import assert from "node:assert/strict";
import test from "node:test";
import { parseRouteHash, serializeRouteHash } from "./routeUrl.js";

test("top-level screens serialize and parse", () => {
  for (const [route, hash] of [
    ["home", "#/"],
    ["search", "#/search"],
    ["library", "#/library"],
    ["settings", "#/settings"]
  ]) {
    assert.equal(serializeRouteHash(route, {}), hash);
    assert.deepEqual(parseRouteHash(hash), { route, params: {} });
  }
  assert.deepEqual(parseRouteHash(""), { route: "home", params: {} });
  assert.deepEqual(parseRouteHash("#"), { route: "home", params: {} });
  assert.deepEqual(parseRouteHash("#/library/"), { route: "library", params: {} });
});

test("detail round-trips type and id only", () => {
  const hash = serializeRouteHash("detail", {
    itemId: "tt0111161",
    itemType: "movie",
    fallbackTitle: "Some title",
    addonBaseUrl: "https://addon.example/abc/manifest.json",
    backdrop: "https://images.example/b.jpg"
  });
  assert.equal(hash, "#/detail/movie/tt0111161");
  assert.deepEqual(parseRouteHash(hash), {
    route: "detail",
    params: { itemId: "tt0111161", itemType: "movie" }
  });
  assert.equal(
    serializeRouteHash("detail", { id: "tt1", itemType: "series" }),
    "#/detail/series/tt1"
  );
});

test("ids with colons are encoded and decoded", () => {
  const hash = serializeRouteHash("detail", { itemId: "tmdb:603", itemType: "movie" });
  assert.equal(hash, "#/detail/movie/tmdb%3A603");
  assert.equal(parseRouteHash(hash).params.itemId, "tmdb:603");
  assert.equal(parseRouteHash("#/detail/movie/tmdb:603").params.itemId, "tmdb:603");
});

test("stream keeps the episode and never auto-plays from a link", () => {
  const hash = serializeRouteHash("stream", {
    itemId: "tt0903747",
    itemType: "series",
    videoId: "tt0903747:1:2",
    season: 1,
    episode: 2,
    streamUrl: "https://media.example/a.mp4?token=secret",
    preferredStreamId: "abc"
  });
  assert.equal(hash, "#/stream/series/tt0903747?video=tt0903747%3A1%3A2&season=1&episode=2");
  assert.deepEqual(parseRouteHash(hash), {
    route: "stream",
    params: {
      itemId: "tt0903747",
      itemType: "series",
      videoId: "tt0903747:1:2",
      season: 1,
      episode: 2,
      manualSelection: true
    }
  });
  assert.equal(
    serializeRouteHash("stream", { itemId: "tt1", itemType: "movie", videoId: "tt1" }),
    "#/stream/movie/tt1"
  );
  assert.deepEqual(parseRouteHash("#/stream/movie/tt1").params, {
    itemId: "tt1",
    itemType: "movie",
    videoId: "tt1",
    manualSelection: true
  });
});

test("screens without a URL of their own serialize to null", () => {
  for (const route of ["player", "account", "authSignIn", "profileSelection", "castDetail"]) {
    assert.equal(serializeRouteHash(route, { itemId: "tt1", itemType: "movie" }), null);
  }
  assert.equal(serializeRouteHash("detail", { itemType: "movie" }), null);
  assert.equal(serializeRouteHash("detail", { itemId: "tt1" }), null);
});

test("values that are not ids never reach or come from the URL", () => {
  for (const itemId of [
    "https://media.example/a.mp4",
    "http://x",
    "has space",
    "a/b",
    "x".repeat(200),
    "",
    "<script>"
  ]) {
    assert.equal(serializeRouteHash("detail", { itemId, itemType: "movie" }), null, itemId);
  }
  assert.equal(serializeRouteHash("detail", { itemId: "tt1", itemType: "Movie Type" }), null);
  assert.equal(
    serializeRouteHash("stream", {
      itemId: "tt1",
      itemType: "movie",
      videoId: "https://media.example/a.mp4"
    }),
    "#/stream/movie/tt1"
  );
});

test("unknown or malformed hashes parse to null", () => {
  for (const hash of [
    "#/player",
    "#/account",
    "#/detail",
    "#/detail/movie",
    "#/detail/movie/tt1/extra",
    "#/detail//tt1",
    "#/detail/movie/https%3A%2F%2Fevil.example",
    "#/detail/movie/%E0%A4%A",
    "#/unknown/movie/tt1",
    "#search",
    "#access_token=abc",
    "#/settings//"
  ]) {
    assert.equal(parseRouteHash(hash), null, hash);
  }
  assert.deepEqual(parseRouteHash("#/stream/movie/tt1?season=1").params, {
    itemId: "tt1",
    itemType: "movie",
    videoId: "tt1",
    manualSelection: true
  });
});
