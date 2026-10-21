// In-browser verification of the opt-in QuickJS engine assets.
//
// This spec is independent of the application bundle and preview: it builds the
// ignored engine assets, serves them from an ephemeral loopback origin with the
// exact MIME types, and executes the reviewed broker-bound prototype in
// Chromium. The transport is synthetic and in-memory; no real network is used.
import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPluginEngineAssets, ENGINE_ASSET_NAMES } from "../../app/alpha/scripts/pluginEngineAssets.mjs";

const outdir = path.resolve("app/alpha/dist/plugin-engine-browser-test");
const fixturePath = fileURLToPath(new URL("../fixtures/plugins/representative-plugin.js", import.meta.url));
const representativeCode = readFileSync(fixturePath, "utf8");

let server;
let baseUrl;
let manifest;
let assetBytes;
let networkViolations = [];

test.beforeAll(async () => {
  const result = await buildPluginEngineAssets({ outdir });
  manifest = result.manifest;
  assetBytes = {
    js: await readFile(path.join(outdir, ENGINE_ASSET_NAMES.js)),
    wasm: await readFile(path.join(outdir, ENGINE_ASSET_NAMES.wasm))
  };
  const html = `<!doctype html><meta charset="utf-8"><title>plugin-engine</title><script type="module" src="/${ENGINE_ASSET_NAMES.js}"></script>`;
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname === "/" || pathname === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }
    if (pathname === `/${ENGINE_ASSET_NAMES.js}`) {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(assetBytes.js);
      return;
    }
    if (pathname === `/${ENGINE_ASSET_NAMES.wasm}`) {
      response.writeHead(200, { "content-type": "application/wasm" });
      response.end(assetBytes.wasm);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("missing");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (!server) return;
  // Chromium can hold keep-alive sockets to the loopback fixture origin, which
  // would make server.close() wait forever during runner cleanup.
  server.closeAllConnections?.();
  let timer;
  await Promise.race([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => (timer = setTimeout(resolve, 2000)))]);
  clearTimeout(timer);
});

async function openEngine(page) {
  const pageErrors = [];
  networkViolations = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message).slice(0, 120)));
  // Only the ephemeral fixture origin may be contacted; any other origin is an
  // unexpected remote code/asset load and fails the test.
  await page.context().route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl) return route.continue();
    networkViolations.push(url.origin);
    return route.abort("blockedbyclient");
  });
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(globalThis.__nuvioPluginEngine), null, { timeout: 20_000 });
  return pageErrors;
}

function runEngine(page, args) {
  return page.evaluate((payload) => globalThis.__nuvioPluginEngine.run(payload), args);
}

test("manifest matches the served bytes and declares explicit opt-in", () => {
  expect(manifest.defaultEnabled).toBe(false);
  expect(manifest.loadPolicy).toBe("explicit-opt-in-lazy");
  expect(manifest.enginePackage).toBe("quickjs-emscripten");
  expect(manifest.files.find((file) => file.name === ENGINE_ASSET_NAMES.js).sha256).toBe(createHash("sha256").update(assetBytes.js).digest("hex"));
  expect(manifest.files.find((file) => file.name === ENGINE_ASSET_NAMES.wasm).sha256).toBe(createHash("sha256").update(assetBytes.wasm).digest("hex"));
});

test("the representative fixture executes in the selected browser and normalizes its output", async ({ page }) => {
  const requestedPaths = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === baseUrl) requestedPaths.push(url.pathname);
  });
  const pageErrors = await openEngine(page);
  const wasmResponse = page.waitForResponse((response) => response.url().endsWith(`/${ENGINE_ASSET_NAMES.wasm}`), { timeout: 20_000 });
  const result = await runEngine(page, { code: representativeCode, input: { tmdbId: 603, mediaType: "movie" }, allowedHosts: [] });
  const response = await wasmResponse;
  expect(result.ok).toBe(true);
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0].sourceId).toBe("fixture-plugin");
  expect(result.groups[0].streams).toHaveLength(1);
  expect(result.groups[0].streams[0].url).toBe("https://media.example.com/fixture-1080.mp4");
  expect(result.dropped).toBeGreaterThanOrEqual(1);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/wasm");
  expect(requestedPaths).toContain(`/${ENGINE_ASSET_NAMES.js}`);
  expect(requestedPaths).toContain(`/${ENGINE_ASSET_NAMES.wasm}`);
  expect(pageErrors).toEqual([]);
  expect(networkViolations).toEqual([]);
});

test("the VM has no ambient host globals", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const result = await runEngine(page, {
    code: `async function resolve() {
      return [{ sourceId: "globals", sourceName: "globals", streams: [{ url: "https://media.example.com/s", description: [typeof fetch, typeof require, typeof process, typeof XMLHttpRequest, typeof WebSocket, typeof importScripts].join(",") }] }];
    }`,
    input: {}
  });
  expect(result.ok).toBe(true);
  expect(result.groups[0].streams[0].description).toBe("undefined,undefined,undefined,undefined,undefined,undefined");
  expect(pageErrors).toEqual([]);
  expect(networkViolations).toEqual([]);
});

test("an allowed synthetic fetch crosses only the broker transport", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const result = await runEngine(page, {
    code: `async function resolve(api) {
      const response = await api.fetch("https://allowed.example/data");
      const body = JSON.parse(response.body);
      return [{ sourceId: "net", sourceName: "net", streams: [{ url: "https://media.example.com/s", description: response.status + ":" + body.value }] }];
    }`,
    input: {},
    allowedHosts: ["allowed.example"]
  });
  expect(result.ok).toBe(true);
  expect(result.groups[0].streams[0].description).toBe("200:42");
  expect(result.transportCalls).toBe(1);
  expect(pageErrors).toEqual([]);
  expect(networkViolations).toEqual([]);
});

test("a denied host is rejected before any transport dispatch", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const result = await runEngine(page, {
    code: `async function resolve(api) { await api.fetch("https://evil.example/x"); return []; }`,
    input: {},
    allowedHosts: ["allowed.example"]
  });
  expect(result.ok).toBe(false);
  expect(result.error).toBe("host");
  expect(result.transportCalls).toBe(0);
  expect(pageErrors).toEqual([]);
  expect(networkViolations).toEqual([]);
});

test("the wall-clock deadline stops an infinite loop", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const result = await runEngine(page, { code: "async function resolve(){ while (true) {} }", input: {}, limits: { timeMs: 800 } });
  expect(result.ok).toBe(false);
  expect(result.error).toBe("timeout");
  expect(pageErrors).toEqual([]);
  expect(networkViolations).toEqual([]);
});

test("the memory budget bounds an allocation bomb", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const result = await runEngine(page, { code: 'async function resolve(){ return "x".repeat(64 * 1024 * 1024); }', input: {}, limits: { memoryBytes: 1024 * 1024, timeMs: 3000 } });
  expect(result.ok).toBe(false);
  expect(result.error).toBe("memory");
  expect(pageErrors).toEqual([]);
  expect(networkViolations).toEqual([]);
});

test("an oversized result is rejected by the output budget", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const result = await runEngine(page, {
    code: 'async function resolve(){ return [{ sourceId: "big", sourceName: "big", streams: [{ url: "https://media.example.com/s", description: "x".repeat(500) }] }]; }',
    input: {},
    limits: { outputBytes: 64 }
  });
  expect(result.ok).toBe(false);
  expect(result.error).toBe("output-size");
  expect(pageErrors).toEqual([]);
  expect(networkViolations).toEqual([]);
});

test("cancellation aborts suspended transport and the next VM still works", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const result = await runEngine(page, {
    code: 'async function resolve(api) { try { await api.fetch("https://allowed.example/slow"); } catch {} return []; }',
    allowedHosts: ["allowed.example"], cancelOnDispatch: true, limits: { timeMs: 2000 }
  });
  expect(result.ok).toBe(false);
  expect(result.error).toBe("cancelled");
  expect(result.transportCalls).toBe(1);
  expect(result.transportAborted).toBe(true);
  expect((await runEngine(page, { code: "async function resolve() { return []; }" })).ok).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(networkViolations).toEqual([]);
});

test("a host deadline propagates abort even when transport ignores cancellation", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const result = await runEngine(page, {
    code: 'async function resolve(api) { await api.fetch("https://allowed.example/slow"); return []; }',
    allowedHosts: ["allowed.example"], limits: { timeMs: 100 }
  });
  expect(result.ok).toBe(false);
  expect(result.error).toBe("timeout");
  expect(result.transportAborted).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(networkViolations).toEqual([]);
});

test("test-only session is default-off, opt-in executes once and strips arbitrary input", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const descriptor = {
    id: "session", name: "session", allowedHosts: ["allowed.example"],
    code: 'async function resolve(api, input) { return [{ sourceId: "session", sourceName: "session", streams: [{ url: "https://media.example/s", description: Object.keys(input).sort().join(",") }] }]; }'
  };
  const disabled = await page.evaluate((descriptor) => globalThis.__nuvioPluginEngine.runSession({ descriptor }), descriptor);
  expect(disabled.first).toEqual({ ok: false, error: "disabled" });
  expect(disabled.status.executions).toBe(0);
  const enabled = await page.evaluate((descriptor) => globalThis.__nuvioPluginEngine.runSession({
    enabled: true, descriptor, input: { tmdbId: 603, accessToken: "synthetic-must-not-cross" }
  }), descriptor);
  expect(enabled.first.ok).toBe(true);
  expect(enabled.first.groups[0].streams[0].description).toBe("episode,mediaType,season,tmdbId");
  expect(enabled.first.logs).toBeUndefined();
  expect(enabled.second).toEqual({ ok: false, error: "session-quota" });
  expect(pageErrors).toEqual([]);
  expect(networkViolations).toEqual([]);
});

test("nonfinite budgets and multi-byte output fail closed in browser", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const invalid = await runEngine(page, { code: "async function resolve(){ return []; }", limits: { timeMs: Infinity } });
  expect(invalid.error).toBe("limits");
  const oversized = await runEngine(page, { code: 'async function resolve(){ return "é".repeat(80); }', limits: { outputBytes: 100 } });
  expect(oversized.error).toBe("output-size");
  expect(pageErrors).toEqual([]);
  expect(networkViolations).toEqual([]);
});

test("restricted CommonJS getStreams and response-like fetch normalize flat streams", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const result = await page.evaluate(() => globalThis.__nuvioPluginEngine.runGetStreams({
    descriptor: { id: "api-regression", name: "api-regression", allowedHosts: ["allowed.example"],
      code: 'module.exports.getStreams = async function(id, type) { var response = await fetch("https://allowed.example/data"); var body = await response.json(); return [{ url: body.url, description: id + ":" + type + ":" + response.status }]; };' },
    input: { tmdbId: 603, mediaType: "movie" }
  }));
  expect(result.ok).toBe(true);
  expect(result.groups[0].streams[0].description).toBe("603:movie:200");
  expect(result.transportCalls).toBe(1);
  expect(pageErrors).toEqual([]);
  expect(networkViolations).toEqual([]);
});

test("restricted API refuses credential headers before dispatch", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const result = await page.evaluate(() => globalThis.__nuvioPluginEngine.runGetStreams({
    descriptor: { id: "api-regression", name: "api-regression", allowedHosts: ["allowed.example"],
      code: 'module.exports.getStreams = async function() { await fetch("https://allowed.example/data", { headers: { Authorization: "synthetic-must-not-cross" } }); return []; };' }
  }));
  expect(result.ok).toBe(false);
  expect(result.transportCalls).toBe(0);
  expect(JSON.stringify(result)).not.toContain("synthetic-must-not-cross");
  expect(pageErrors).toEqual([]);
  expect(networkViolations).toEqual([]);
});

test("an unexpected external request is blocked and recorded", async ({ page }) => {
  await openEngine(page);
  await page.evaluate(() => fetch("https://example.com/probe").catch(() => {}));
  expect(networkViolations).toEqual(["https://example.com"]);
});
