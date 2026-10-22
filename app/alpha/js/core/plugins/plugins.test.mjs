import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { load } from "cheerio/slim";
import CryptoJS from "crypto-js";
import { createPluginCache } from "./pluginCache.js";
import { buildProxyRequest, createPluginFetch, isBlockedTarget, NeedsProxyError, normalizeProxyUrl } from "./pluginNetwork.js";
import { isRepoUrl, isTemplateUrl, manifestUrlFor, parseManifest, scraperKey } from "./pluginRepo.js";
import { createPluginRepoLoader } from "./pluginRepoLoader.js";
import { createAxiosShim, runScraperCode } from "./pluginSandbox.js";
import { runScraperInWorker } from "./pluginWorkerClient.js";
import { createPluginRuntime, normalizeSources } from "../player/pluginRuntime.js";

const fixture = (name) => readFileSync(new URL(`../../../../../tests/fixtures/plugins/example-repo/${name}`, import.meta.url), "utf8");
const REPO = "https://plugins.example.invalid/repo/manifest.json";
const APP_ORIGIN = "https://app.example.invalid";

function textResponse(body, status = 200) {
  return { ok: status < 400, status, statusText: "", headers: new Map(), text: async () => body };
}

function fixtureFetch(calls = []) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const href = String(url);
    if (href === REPO) return textResponse(fixture("manifest.json"));
    if (href === "https://plugins.example.invalid/repo/example-source.js") return textResponse(fixture("example-source.js"));
    if (href.startsWith("https://media.example.invalid/")) return textResponse(fixture("page.html"));
    throw new TypeError("Failed to fetch");
  };
}

function memoryStore() {
  const data = new Map();
  return {
    get: (key, fallback = null) => (data.has(key) ? structuredClone(data.get(key)) : fallback),
    set: (key, value) => data.set(key, structuredClone(value))
  };
}

const modules = (fetchImpl) => ({ cheerio: { load }, cryptoJs: CryptoJS, axios: createAxiosShim(fetchImpl) });

// Runs the sandbox in-process, standing in for the Web Worker.
function inProcessRunner(fetchCalls) {
  return async ({ code, args, proxy }) => {
    let needsProxy = false;
    const fetchImpl = createPluginFetch({ fetchImpl: fixtureFetch(fetchCalls), proxy, appOrigin: APP_ORIGIN, onNeedsProxy: () => (needsProxy = true) });
    try {
      const streams = await runScraperCode({ code, args, fetchImpl, modules: modules(fetchImpl) });
      return { ok: true, streams, needsProxy };
    } catch (error) {
      return { ok: false, streams: [], needsProxy, error: error.message };
    }
  };
}

test("URL templates are not repositories", () => {
  assert.equal(isTemplateUrl("https://host.example/stream/{tmdbId}"), true);
  assert.equal(isTemplateUrl("https://host.example/stream/%7BtmdbId%7D"), true);
  assert.equal(isRepoUrl("https://host.example/stream/{tmdbId}"), false);
  assert.equal(isRepoUrl("https://user:pass@host.example/manifest.json"), false);
  assert.equal(isRepoUrl("ftp://host.example/manifest.json"), false);
  assert.equal(isRepoUrl(REPO), true);
  assert.equal(manifestUrlFor("https://host.example/repo/"), "https://host.example/repo/manifest.json");
  assert.equal(manifestUrlFor(REPO), REPO);
});

test("manifest parsing keeps same-origin scrapers and refuses foreign code", () => {
  const manifest = parseManifest(JSON.parse(fixture("manifest.json")), REPO);
  assert.equal(manifest.name, "Example Plugin Repository");
  assert.deepEqual(manifest.scrapers.map((entry) => entry.id), ["example-source", "example-tv-only"]);
  assert.equal(manifest.scrapers[0].codeUrl, "https://plugins.example.invalid/repo/example-source.js");
  assert.deepEqual(manifest.scrapers[1].supportedTypes, ["tv"]);
  assert.equal(manifest.scrapers[1].enabledByDefault, false);
  assert.throws(() => parseManifest({ name: "x" }, REPO), /manifest/);
});

test("legacy template sources are dropped from local storage", () => {
  const sources = normalizeSources([
    { id: "a", name: "Old template", urlTemplate: "https://host.example/{tmdbId}.m3u8" },
    { id: "b", name: "Repo", url: REPO },
    { id: "c", name: "Repo again", url: REPO }
  ]);
  assert.deepEqual(sources.map((source) => source.id), ["b"]);
});

test("plugin requests cannot reach this app, loopback or the local network", () => {
  for (const target of [
    "http://localhost:8080/", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/",
    "http://172.20.0.1/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://printer.local/",
    `${APP_ORIGIN}/nuvio.env.js`, "file:///etc/passwd", "data:text/plain,x", "https://user:pw@host.example/", "not a url"
  ]) {
    assert.equal(isBlockedTarget(target, APP_ORIGIN), true, target);
  }
  assert.equal(isBlockedTarget("https://media.example.invalid/a", APP_ORIGIN), false);
});

test("blocked targets are refused before any request is made", async () => {
  const calls = [];
  const pluginFetch = createPluginFetch({ fetchImpl: fixtureFetch(calls), appOrigin: APP_ORIGIN });
  await assert.rejects(pluginFetch("http://127.0.0.1:4371/"), /not allowed/);
  await assert.rejects(pluginFetch(`${APP_ORIGIN}/`), /not allowed/);
  assert.equal(calls.length, 0);
});

test("direct CORS or network failures become needs-proxy, cookies are never sent", async () => {
  const calls = [];
  let flagged = false;
  const pluginFetch = createPluginFetch({ fetchImpl: fixtureFetch(calls), appOrigin: APP_ORIGIN, onNeedsProxy: () => (flagged = true) });
  await assert.rejects(pluginFetch("https://cors-blocked.example.invalid/"), NeedsProxyError);
  assert.equal(flagged, true);
  await pluginFetch("https://media.example.invalid/movie/1");
  assert.equal(calls.at(-1).init.credentials, "omit");
});

test("with a proxy set, requests go to the proxy with the target and headers", async () => {
  const calls = [];
  const proxy = { url: "https://proxy.example.invalid/fetch", token: "user-proxy-token" };
  const pluginFetch = createPluginFetch({ fetchImpl: async (url, init) => (calls.push({ url, init }), textResponse("ok")), proxy, appOrigin: APP_ORIGIN });
  await pluginFetch("https://media.example.invalid/a", { headers: { Referer: "https://media.example.invalid/" } });
  const sent = new URL(calls[0].url);
  assert.equal(sent.origin + sent.pathname, "https://proxy.example.invalid/fetch");
  assert.equal(sent.searchParams.get("url"), "https://media.example.invalid/a");
  assert.deepEqual(JSON.parse(sent.searchParams.get("headers")), { Referer: "https://media.example.invalid/" });
  assert.equal(calls[0].init.headers.Authorization, "Bearer user-proxy-token");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(buildProxyRequest(proxy, "https://a.example/").init.method, "GET");
});

test("proxy URL must be https (or a proxy on this machine) without query or credentials", () => {
  assert.equal(normalizeProxyUrl("https://proxy.example.invalid/"), "https://proxy.example.invalid/");
  assert.equal(normalizeProxyUrl("http://localhost:8787/"), "http://localhost:8787/");
  assert.equal(normalizeProxyUrl("http://proxy.example.invalid/"), "");
  assert.equal(normalizeProxyUrl("https://proxy.example.invalid/?url="), "");
  assert.equal(normalizeProxyUrl("https://u:p@proxy.example.invalid/"), "");
});

test("the fixture scraper runs with the cheerio, crypto-js and fetch shims", async () => {
  const fetchImpl = createPluginFetch({ fetchImpl: fixtureFetch(), appOrigin: APP_ORIGIN });
  const streams = await runScraperCode({ code: fixture("example-source.js"), args: ["603", "movie", null, null], fetchImpl, modules: modules(fetchImpl) });
  assert.equal(streams.length, 2, "javascript: links are dropped");
  assert.match(streams[0].title, /^Open fixture \([0-9a-f]{8}\)$/);
  assert.equal(streams[0].quality, "1080p");
  assert.equal(streams[0].headers, null);
  assert.deepEqual(streams[1].headers, { Referer: "https://media.example.invalid/" });
});

test("sandboxed code cannot see storage or worker globals and must export getStreams", async () => {
  const code = `module.exports.getStreams = async () => [{ url: "https://a.example/v.mp4", name: [typeof indexedDB, typeof importScripts, typeof localStorage, typeof caches].join(",") }];`;
  const [stream] = await runScraperCode({ code, fetchImpl: async () => textResponse("") });
  assert.equal(stream.name, "undefined,undefined,undefined,undefined");
  await assert.rejects(runScraperCode({ code: "const x = 1;" }), /getStreams/);
  const globalStyle = await runScraperCode({ code: `function getStreams() { return [{ url: "https://a.example/v.mp4" }]; }` });
  assert.equal(globalStyle.length, 1);
});

test("axios shim maps to fetch and parses JSON", async () => {
  const calls = [];
  const axios = createAxiosShim(async (url, init) => (calls.push({ url, init }), textResponse('{"ok":true}')));
  const response = await axios.get("https://api.example.invalid/x", { params: { q: "a b" } });
  assert.deepEqual(response.data, { ok: true });
  assert.equal(calls[0].url, "https://api.example.invalid/x?q=a+b");
  await axios.post("https://api.example.invalid/y", { a: 1 });
  assert.equal(calls[1].init.body, '{"a":1}');
  assert.equal(calls[1].init.headers["Content-Type"], "application/json");
});

test("repo loader caches manifest and code, and falls back to the cache when offline", async () => {
  let online = true;
  let now = 0;
  const calls = [];
  const base = fixtureFetch(calls);
  const loader = createPluginRepoLoader({
    cache: createPluginCache({ idb: null }),
    fetchImpl: async (url, init) => {
      if (!online) throw new TypeError("offline");
      return base(url, init);
    },
    now: () => now,
    appOrigin: APP_ORIGIN
  });
  const manifest = await loader.loadManifest(REPO);
  const code = await loader.loadScraperCode(manifest.scrapers[0]);
  assert.match(code, /getStreams/);
  assert.equal(calls.length, 2);
  online = false;
  now = 7 * 60 * 60 * 1000;
  assert.deepEqual(await loader.loadManifest(REPO), manifest);
  assert.equal(await loader.loadScraperCode(manifest.scrapers[0]), code);
  await assert.rejects(createPluginRepoLoader({ cache: createPluginCache({ idb: null }), appOrigin: APP_ORIGIN }).loadManifest("http://127.0.0.1/manifest.json"), /not allowed/);
});

class FakeWorker {
  constructor(behaviour) {
    this.behaviour = behaviour;
    this.terminated = false;
    FakeWorker.last = this;
  }
  postMessage(message) {
    this.message = message;
    if (this.behaviour === "reply") queueMicrotask(() => this.onmessage({ data: { ok: true, streams: [{ url: "https://a.example/v.mp4" }], needsProxy: false } }));
    if (this.behaviour === "error") queueMicrotask(() => this.onerror({ message: "boom", preventDefault() {} }));
  }
  terminate() {
    this.terminated = true;
  }
}

test("the worker is terminated after a result, an error or a timeout", async () => {
  const ok = await runScraperInWorker({ code: "x", args: [] }, { workerFactory: () => new FakeWorker("reply"), appOrigin: APP_ORIGIN });
  assert.equal(ok.ok, true);
  assert.equal(FakeWorker.last.terminated, true);
  assert.equal(FakeWorker.last.message.appOrigin, APP_ORIGIN);

  const failed = await runScraperInWorker({ code: "x", args: [] }, { workerFactory: () => new FakeWorker("error") });
  assert.equal(failed.ok, false);
  assert.equal(FakeWorker.last.terminated, true);

  const hung = await runScraperInWorker({ code: "x", args: [], timeoutMs: 20 }, { workerFactory: () => new FakeWorker("hang") });
  assert.equal(hung.timedOut, true);
  assert.equal(FakeWorker.last.terminated, true);

  const unavailable = await runScraperInWorker({ code: "x", args: [] }, { workerFactory: () => { throw new Error("no workers"); } });
  assert.equal(unavailable.ok, false);
});

test("runtime turns an installed repo into real stream rows", async () => {
  const store = memoryStore();
  const fetchCalls = [];
  const runtime = createPluginRuntime({
    store,
    loader: createPluginRepoLoader({ cache: createPluginCache({ idb: null }), fetchImpl: fixtureFetch(fetchCalls), appOrigin: APP_ORIGIN }),
    runScraper: inProcessRunner(fetchCalls)
  });
  runtime.saveSources([{ id: "repo", name: "Example", url: REPO, enabled: true }]);

  const movie = await runtime.execute({ tmdbId: "603", mediaType: "movie" });
  assert.equal(movie.length, 1, "the disabled tv-only scraper does not run");
  const [group] = movie;
  assert.equal(group.sourceName, "Example Source");
  assert.equal(group.sourceId, scraperKey(REPO, "example-source"));
  assert.equal(group.streams[0].url, "https://media.example.invalid/video/open-1080.mp4");
  assert.equal(group.streams[0].behaviorHints, undefined);
  assert.deepEqual(group.streams[1].behaviorHints.proxyHeaders.request, { Referer: "https://media.example.invalid/" });
  assert.ok(movie.every((entry) => entry.streams.every((stream) => !/[{}]/.test(stream.url))), "no template rows");
  assert.ok(fetchCalls.some((call) => call.url === "https://media.example.invalid/movie/603"));

  runtime.setScraperEnabled(scraperKey(REPO, "example-tv-only"), true);
  const series = await runtime.execute({ tmdbId: "1399", mediaType: "series", season: 1, episode: 2 });
  assert.equal(series.length, 2);
  assert.ok(fetchCalls.some((call) => call.url === "https://media.example.invalid/tv/1399/1/2"));

  runtime.setScraperEnabled(scraperKey(REPO, "example-source"), false);
  runtime.setScraperEnabled(scraperKey(REPO, "example-tv-only"), false);
  assert.deepEqual(await runtime.execute({ tmdbId: "603", mediaType: "movie" }), []);
});

test("runtime records needs-proxy when the browser blocks a scraper", async () => {
  const store = memoryStore();
  const runtime = createPluginRuntime({
    store,
    loader: createPluginRepoLoader({ cache: createPluginCache({ idb: null }), fetchImpl: fixtureFetch(), appOrigin: APP_ORIGIN }),
    runScraper: async () => ({ ok: false, streams: [], needsProxy: true, error: "blocked" })
  });
  runtime.saveSources([{ id: "repo", name: "Example", url: REPO }]);
  assert.deepEqual(await runtime.execute({ tmdbId: "603", mediaType: "movie" }), []);
  assert.equal(runtime.getScraperStatus(scraperKey(REPO, "example-source")).needsProxy, true);
  const [repo] = await runtime.describeSources();
  assert.equal(repo.scrapers[0].status.needsProxy, true);
});

test("proxy settings are off by default and reject unsafe URLs", () => {
  const runtime = createPluginRuntime({ store: memoryStore(), loader: {}, runScraper: async () => ({}) });
  assert.deepEqual(runtime.getProxySettings(), { url: "", token: "" });
  assert.throws(() => runtime.setProxySettings({ url: "http://proxy.example.invalid/" }), /invalid-proxy-url/);
  runtime.setProxySettings({ url: "https://proxy.example.invalid/", token: " t " });
  assert.deepEqual(runtime.getProxySettings(), { url: "https://proxy.example.invalid/", token: "t" });
  runtime.setProxySettings({ url: "" });
  assert.deepEqual(runtime.getProxySettings(), { url: "", token: "" });
});

test("rows from the worker are cleaned again on the main thread", async () => {
  const forged = [{ url: "javascript:alert(1)" }, ...Array.from({ length: 300 }, (_, i) => ({ url: `https://a.example/${i}.mp4`, name: "x".repeat(1000) }))];
  const runtime = createPluginRuntime({
    store: memoryStore(),
    loader: createPluginRepoLoader({ cache: createPluginCache({ idb: null }), fetchImpl: fixtureFetch(), appOrigin: APP_ORIGIN }),
    runScraper: async () => ({ ok: true, streams: forged, needsProxy: false })
  });
  runtime.saveSources([{ id: "repo", name: "Example", url: REPO }]);
  const [group] = await runtime.execute({ tmdbId: "603", mediaType: "movie" });
  assert.equal(group.streams.length, 200);
  assert.ok(group.streams.every((stream) => stream.url.startsWith("https://") && stream.name.length <= 200));
});
