import test from "node:test";
import assert from "node:assert/strict";
import { buildStreamTitleParams } from "./streamTitleMeta.js";

test("fills movie title, logo, backdrop, year and genres from meta", () => {
  const out = buildStreamTitleParams(
    {
      name: "Film",
      logo: "logo.png",
      background: "bg.jpg",
      poster: "p.jpg",
      releaseInfo: "2021-2022",
      genres: ["A", "B", "C", "D"]
    },
    { itemId: "x", itemType: "movie" }
  );
  assert.deepEqual(out, {
    itemTitle: "Film",
    logo: "logo.png",
    backdrop: "bg.jpg",
    poster: "p.jpg",
    year: "2021",
    genres: "A • B • C"
  });
});

test("falls back to the poster for the backdrop and keeps fields already given", () => {
  const out = buildStreamTitleParams(
    { name: "Film", poster: "p.jpg" },
    { itemType: "movie", itemTitle: "Given" }
  );
  assert.equal(out.itemTitle, undefined);
  assert.equal(out.backdrop, "p.jpg");
});

test("finds the series episode by video id, then by season and episode", () => {
  const meta = {
    name: "Show",
    videos: [
      { id: "s:1:1", season: 1, episode: 1, title: "Pilot" },
      { id: "s:1:2", season: 1, number: 2, name: "Second" }
    ]
  };
  const byId = buildStreamTitleParams(meta, { itemType: "series", videoId: "s:1:1" });
  assert.equal(byId.episodeTitle, "Pilot");
  assert.equal(byId.season, 1);
  assert.equal(byId.episode, 1);
  assert.equal(byId.genres, undefined);

  const byNumber = buildStreamTitleParams(meta, { itemType: "series", season: "1", episode: "2" });
  assert.equal(byNumber.episodeTitle, "Second");
  assert.equal(byNumber.season, undefined);
});

test("returns nothing for missing meta", () => {
  assert.deepEqual(buildStreamTitleParams(null, {}), {});
});
