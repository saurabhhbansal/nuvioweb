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
const wasmResponses = [];

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
      wasmResponses.push({ status: 200, type: "application/wasm" });
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
  await new Promise((resolve) => server.close(resolve));
});

async function openEngine(page) {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message).slice(0, 120)));
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

test("the representative fixture executes in Chromium and normalizes its output", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const result = await runEngine(page, { code: representativeCode, input: { tmdbId: 603, mediaType: "movie" }, allowedHosts: [] });
  expect(result.ok).toBe(true);
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0].sourceId).toBe("fixture-plugin");
  expect(result.groups[0].streams).toHaveLength(1);
  expect(result.groups[0].streams[0].url).toBe("https://media.example.com/fixture-1080.mp4");
  expect(result.dropped).toBeGreaterThanOrEqual(1);
  expect(pageErrors).toEqual([]);
  expect(wasmResponses.some((entry) => entry.status === 200 && entry.type === "application/wasm")).toBe(true);
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
});

test("the wall-clock deadline stops an infinite loop", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const result = await runEngine(page, { code: "async function resolve(){ while (true) {} }", input: {}, limits: { timeMs: 800 } });
  expect(result.ok).toBe(false);
  expect(result.error).toBe("timeout");
  expect(pageErrors).toEqual([]);
});

test("the memory budget bounds an allocation bomb", async ({ page }) => {
  const pageErrors = await openEngine(page);
  const result = await runEngine(page, { code: 'async function resolve(){ return "x".repeat(64 * 1024 * 1024); }', input: {}, limits: { memoryBytes: 1024 * 1024, timeMs: 3000 } });
  expect(result.ok).toBe(false);
  expect(result.error).toBe("memory");
  expect(pageErrors).toEqual([]);
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
});
