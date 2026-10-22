import assert from "node:assert/strict";
import test from "node:test";

// The real Trakt write paths, with the network switched off and back on.
const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); }
};
globalThis.__NUVIO_PLATFORM__ = "browser";
globalThis.__NUVIO_ENV__ = { TRAKT_CLIENT_ID: "fixture-public-client", NUVIO_ENABLE_TRAKT_BRIDGE: "true" };

const { Platform } = await import("../../platform/index.js");
Platform.current = null;
const { TraktAuthStore } = await import("../local/traktAuthStore.js");
const { TraktScrobbleService } = await import("./traktScrobbleService.js");
const { watchedItemsRepository } = await import("./watchedItemsRepository.js");
const { clearTrackerOutbox, flushTrackerOutbox, readTrackerOutbox } = await import("./trackerOutbox.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

function signIn() {
  TraktAuthStore.saveToken({
    access_token: "fixture-access",
    refresh_token: "fixture-refresh",
    expires_in: 86400,
    created_at: Math.floor(Date.now() / 1000)
  });
}

function useNetwork(t, handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    return handler(String(url));
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

const ok = () => new Response("{}", { status: 201, headers: { "Content-Type": "application/json" } });

test("a finish recorded offline reaches Trakt later with the time it was watched", async (t) => {
  storage.clear();
  signIn();
  let up = false;
  const calls = useNetwork(t, () => {
    if (!up) throw new TypeError("Failed to fetch");
    return ok();
  });
  const watchedAt = Date.UTC(2026, 9, 20, 21, 15, 0);
  await watchedItemsRepository.mark({ contentId: "tt0111161", contentType: "movie", title: "Fixture", watchedAt });
  await settle();
  const saved = readTrackerOutbox();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].kind, "history");
  assert.equal(saved[0].payload.watchedAt, watchedAt);

  up = true;
  await flushTrackerOutbox({ profileId: "1" });
  const history = calls.filter((call) => call.url.endsWith("/sync/history"));
  assert.equal(history.length, 2);
  assert.equal(history[1].body.movies[0].watched_at, new Date(watchedAt).toISOString());
  assert.deepEqual(readTrackerOutbox(), []);
});

test("an episode's history entry carries its watch time on the episode", async (t) => {
  storage.clear();
  signIn();
  const calls = useNetwork(t, () => ok());
  const watchedAt = Date.UTC(2026, 9, 21, 8, 0, 0);
  await watchedItemsRepository.mark({ contentId: "tt0903747", contentType: "series", season: 2, episode: 3, watchedAt });
  await settle();
  const body = calls.find((call) => call.url.endsWith("/sync/history")).body;
  assert.deepEqual(body.shows[0].seasons, [{ number: 2, episodes: [{ number: 3, watched_at: new Date(watchedAt).toISOString() }] }]);
});

test("losing the network does not switch scrobbling off, and the last position waits", async (t) => {
  storage.clear();
  clearTrackerOutbox();
  signIn();
  let up = false;
  const calls = useNetwork(t, () => {
    if (!up) throw new TypeError("Failed to fetch");
    return ok();
  });
  const context = { contentId: "tt0111161", contentType: "movie", title: "Fixture", imdbId: "tt0111161", progressPercent: 35 };
  // More failures than the old limit of three.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    TraktScrobbleService.reportPosition({ ...context, progressPercent: 30 + attempt });
    await settle();
  }
  const saved = readTrackerOutbox();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].kind, "position");
  assert.equal(saved[0].payload.progressPercent, 34);

  up = true;
  TraktScrobbleService.reportPosition({ ...context, progressPercent: 50 });
  await settle();
  const pauses = calls.filter((call) => call.url.endsWith("/scrobble/pause"));
  assert.equal(pauses.at(-1).body.progress, 50);
  // The successful send also flushed what was waiting.
  await settle();
  assert.deepEqual(readTrackerOutbox(), []);
});

test("a stop past the watched mark offline is saved as a finish, not a position", async (t) => {
  storage.clear();
  clearTrackerOutbox();
  signIn();
  useNetwork(t, () => { throw new TypeError("Failed to fetch"); });
  TraktScrobbleService.stop({ contentId: "tt0111161", contentType: "movie", imdbId: "tt0111161", progressPercent: 95 });
  await settle();
  const saved = readTrackerOutbox();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].kind, "history");
  assert.equal(saved[0].key, "tt0111161::");
  assert.ok(saved[0].payload.watchedAt > 0);
  // Marking it watched saves under the same key, so only one finish goes out.
  await watchedItemsRepository.mark({ contentId: "tt0111161", contentType: "movie" });
  await settle();
  assert.equal(readTrackerOutbox().filter((entry) => entry.kind === "history").length, 1);
});

test("un-watching drops a finish saved offline", async (t) => {
  storage.clear();
  clearTrackerOutbox();
  signIn();
  useNetwork(t, () => { throw new TypeError("Failed to fetch"); });
  await watchedItemsRepository.mark({ contentId: "tt0068646", contentType: "movie" });
  await settle();
  assert.equal(readTrackerOutbox().length, 1);
  await watchedItemsRepository.unmark("tt0068646");
  await settle();
  assert.equal(readTrackerOutbox().filter((entry) => entry.kind === "history").length, 0);
});

test("refusals still count toward giving up", async (t) => {
  storage.clear();
  clearTrackerOutbox();
  signIn();
  const calls = useNetwork(t, () => new Response("{}", { status: 422 }));
  const context = { contentId: "tt0111161", contentType: "movie", imdbId: "tt0111161", progressPercent: 20 };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    TraktScrobbleService.reportPosition({ ...context, progressPercent: 20 + attempt });
    await settle();
  }
  assert.equal(calls.filter((call) => call.url.endsWith("/scrobble/pause")).length, 3);
  assert.deepEqual(readTrackerOutbox(), []);
});
