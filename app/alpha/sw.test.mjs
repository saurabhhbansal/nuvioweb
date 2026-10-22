import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("app shell precaches the local IMDb badge and Profile logo but not addon or catalog API responses", async () => {
  const source = await readFile(new URL("./sw.js", import.meta.url), "utf8");

  assert.match(source, /assets\/icons\/imdb_logo_2016\.svg/);
  assert.match(source, /assets\/brand\/app_logo_wordmark\.png/);
  assert.match(source, /if \(url\.origin !== self\.location\.origin\) return;/);
  assert.doesNotMatch(source, /manifest\.json.*cache\.put|catalog.*cache\.put/i);
});

test("external playback push uses privacy-safe text and notification clicks focus only this worker scope", async () => {
  const source = await readFile(new URL("./sw.js", import.meta.url), "utf8");
  assert.match(source, /self\.addEventListener\("push"/);
  assert.match(source, /Playback updated\. Tap to return to NuvioWeb\./);
  assert.match(source, /Playback completed\. Tap to return to NuvioWeb\./);
  assert.match(source, /data: \{ type: "external-playback-return" \}/);
  assert.match(source, /self\.addEventListener\("notificationclick"/);
  assert.match(source, /self\.clients\.matchAll\(\{ type: "window", includeUncontrolled: true \}\)/);
  assert.match(source, /String\(client\.url \|\| ""\)\.startsWith\(scope\)/);
  assert.match(source, /self\.clients\.openWindow\(scope\)/);
  assert.doesNotMatch(source, /webapp:\/\//);
});

// sw.js is a classic worker script with a build-time placeholder for the locale
// list, so running it means substituting that first -- the same step
// scripts/build.mjs performs -- and standing in for the worker globals it
// closes over. Asserting on the source text would pass on a `reload` written
// anywhere in the file; this fails unless the entries actually carry it.
const TEST_LOCALES = ["./res/values/strings.xml", "./res/values-de/strings.xml", "./res/values-fr/strings.xml"];

async function loadServiceWorker({ scriptUrl = "https://example.test/sw.js" } = {}) {
  const source = (await readFile(new URL("./sw.js", import.meta.url), "utf8"))
    .replace("__NUVIO_LOCALE_ASSETS__", JSON.stringify(TEST_LOCALES))
    .replaceAll("__NUVIO_APP_VERSION__", "0.0.0-test");

  const cached = [];
  const listeners = new Map();
  const calls = { skipWaiting: 0 };
  const scope = new URL("./", scriptUrl).href;
  const workerSelf = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    skipWaiting: () => {
      calls.skipWaiting += 1;
    },
    clients: { claim: () => {} },
    location: new URL(scriptUrl),
    registration: { scope }
  };
  const cacheStub = {
    addAll: async (requests) => cached.push(...requests),
    put: async () => {},
    match: async () => null
  };
  const cachesStub = { open: async () => cacheStub, match: async () => null };
  // Relative entries resolve against the worker URL in a browser and have no
  // base here, so the request is stood in for rather than constructed.
  class RequestStub {
    constructor(url, init = {}) {
      this.url = String(url);
      this.cache = init.cache;
    }
  }
  // The optional icon font is fetched during install behind its own try/catch.
  const fetchStub = async () => {
    throw new Error("no network in test");
  };

  new Function("self", "caches", "Request", "fetch", source)(
    workerSelf,
    cachesStub,
    RequestStub,
    fetchStub
  );
  return { listeners, cached, calls, scope };
}

async function runServiceWorkerInstall(options) {
  const worker = await loadServiceWorker(options);
  const install = worker.listeners.get("install");
  assert.equal(typeof install, "function", "sw.js must register an install handler");
  let pending = null;
  install({
    waitUntil: (promise) => {
      pending = promise;
    }
  });
  await pending;
  return worker.cached;
}

// True when the worker answers the request itself, false when it lets the
// browser go to the network untouched.
function handles(worker, url, mode = "no-cors") {
  let responded = false;
  worker.listeners.get("fetch")({
    request: { method: "GET", url, mode },
    respondWith: (promise) => {
      responded = true;
      promise?.catch?.(() => {});
    }
  });
  return responded;
}

test("every precached app shell entry bypasses the HTTP cache", async () => {
  const cached = await runServiceWorkerInstall();

  // Build assets are served with a seven-day lifetime, so an entry fetched
  // through the HTTP cache fills a brand-new cache with the previous build.
  assert.ok(cached.length > 20, `expected the whole app shell, got ${cached.length} entries`);
  const reusingHttpCache = cached.filter((request) => request.cache !== "reload");
  assert.deepEqual(
    // A raw string entry has no .url, and that is exactly the regression.
    reusingHttpCache.map((request) => String(request?.url ?? request)),
    [],
    "these entries could be answered by a previous build's bytes"
  );
  assert.ok(
    cached.some((request) => request.url === "./app.bundle.js"),
    "the application bundle is the entry this exists to keep current"
  );
});

test("only listed paths are served from the cache, not every path under the scope", async () => {
  const worker = await loadServiceWorker();
  assert.equal(handles(worker, "https://example.test/app.bundle.js?v=2"), true);
  assert.equal(handles(worker, "https://example.test/css/base.css"), true);
  assert.equal(handles(worker, "https://example.test/res/values-de/strings.xml"), true);
  // The old "./" entry matched these by suffix; none of them is in the shell.
  assert.equal(handles(worker, "https://example.test/api/catalog.json"), false);
  assert.equal(handles(worker, "https://example.test/assets/libs/hls.min.js"), false);
  assert.equal(handles(worker, "https://example.test/other/app.bundle.js"), false);
  assert.equal(handles(worker, "https://example.test/"), false);
  assert.equal(handles(worker, "https://elsewhere.test/app.bundle.js"), false);
});

test("a sub-path deploy matches its own files and its own nuvio.env.js", async () => {
  const worker = await loadServiceWorker({ scriptUrl: "https://example.test/nuvio/sw.js" });
  assert.equal(handles(worker, "https://example.test/nuvio/app.bundle.js"), true);
  assert.equal(handles(worker, "https://example.test/nuvio/nuvio.env.js"), true);
  assert.equal(handles(worker, "https://example.test/app.bundle.js"), false);
  assert.equal(handles(worker, "https://example.test/nuvio.env.js"), false);
});

test("install precaches English only, not every locale", async () => {
  const cached = await runServiceWorkerInstall();
  const urls = cached.map((request) => request.url);
  assert.ok(urls.includes("./res/values/strings.xml"));
  assert.ok(!urls.some((url) => url.includes("values-")), urls.join(", "));
  assert.ok(!urls.includes("./"), "the bare scope entry matched every path");
});

test("the page can ask for its active locale to be cached, and nothing else", async () => {
  const worker = await loadServiceWorker();
  const message = worker.listeners.get("message");
  for (const locale of ["de", "../../etc", "xx"]) {
    let pending = null;
    message({ data: { type: "CACHE_LOCALE", locale }, waitUntil: (promise) => (pending = promise) });
    await pending;
  }
  assert.deepEqual(
    worker.cached.map((request) => request.url),
    ["./res/values-de/strings.xml"]
  );
});

test("a new worker waits until the page sends SKIP_WAITING", async () => {
  const worker = await loadServiceWorker();
  let pending = null;
  worker.listeners.get("install")({ waitUntil: (promise) => (pending = promise) });
  await pending;
  assert.equal(worker.calls.skipWaiting, 0, "install must not take over an open page");
  worker.listeners.get("message")({ data: { type: "SKIP_WAITING" } });
  assert.equal(worker.calls.skipWaiting, 1);
});
