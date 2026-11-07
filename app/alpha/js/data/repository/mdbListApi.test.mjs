import assert from "node:assert/strict";
import test from "node:test";

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear()
};

const { MdbListTracking, mdbListApiJson, mdbListApiRequest } = await import("./mdbListApi.js");
const { buildMdbListScrobblePayload } = await import("./mdbListScrobbleService.js");

function fakeFetch(status = 200, body = { ok: true }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
  };
  return { calls, fetchImpl };
}

test("tracking needs its own switch as well as a key", () => {
  assert.equal(MdbListTracking.isAuthenticated({ apiKey: "k", trackingEnabled: false }), false);
  assert.equal(MdbListTracking.isAuthenticated({ apiKey: " ", trackingEnabled: true }), false);
  assert.equal(MdbListTracking.isAuthenticated({ apiKey: "k", trackingEnabled: true }), true);
});

test("requests are CORS-simple: key in the query, no headers, JSON as a plain string body", async () => {
  const { calls, fetchImpl } = fakeFetch();
  const result = await mdbListApiRequest("/sync/watched", {
    method: "POST",
    query: { report_added: "true" },
    body: { movies: [{ ids: { imdb: "tt1" } }] },
    apiKey: "secret-key",
    fetchImpl
  });
  assert.equal(result.response.status, 200);
  const [{ url, init }] = calls;
  assert.equal(url.origin + url.pathname, "https://api.mdblist.com/sync/watched");
  assert.equal(url.searchParams.get("apikey"), "secret-key");
  assert.equal(url.searchParams.get("report_added"), "true");
  assert.equal(init.method, "POST");
  assert.equal(init.headers, undefined);
  assert.equal(init.credentials, "omit");
  assert.equal(typeof init.body, "string");
  assert.deepEqual(JSON.parse(init.body), { movies: [{ ids: { imdb: "tt1" } }] });
});

test("a refusal carries its status for the retry rules; no key never calls out", async () => {
  const { fetchImpl } = fakeFetch(429, { error: "Too many requests" });
  await assert.rejects(mdbListApiJson("/scrobble/start", { method: "POST", body: {}, apiKey: "k", fetchImpl }), (error) =>
    error.status === 429 && /Too many/.test(error.message)
  );
  const idle = fakeFetch();
  await assert.rejects(mdbListApiRequest("/sync/playback", { apiKey: "", fetchImpl: idle.fetchImpl }), (error) => error.status === 401);
  assert.equal(idle.calls.length, 0);
  await assert.rejects(mdbListApiRequest("https://elsewhere.invalid/x", { apiKey: "k", fetchImpl: idle.fetchImpl }));
});

test("scrobble payloads name the title by its ids and the episode by its numbers", () => {
  assert.deepEqual(buildMdbListScrobblePayload({ contentId: "tt0111161", contentType: "movie", progressPercent: 42.256 }), {
    movie: { ids: { imdb: "tt0111161" } },
    progress: 42.26
  });
  assert.deepEqual(
    buildMdbListScrobblePayload({ contentId: "tmdb:1399", contentType: "series", seasonNumber: 1, episodeNumber: 2, progressPercent: 120 }),
    { show: { ids: { tmdb: 1399 }, season: 1, episode: 2 }, progress: 100 }
  );
  assert.equal(buildMdbListScrobblePayload({ contentId: "kitsu:1", contentType: "movie" }), null);
  assert.equal(buildMdbListScrobblePayload({ contentId: "tt1", contentType: "series", seasonNumber: 1 }), null);
});
