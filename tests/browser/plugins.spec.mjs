import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Runs the built plugin worker (dist/plugin-worker.bundle.js) in Chromium with
// the original fixture scraper. Fixture hosts use .invalid, so nothing leaves the machine.
const scraper = readFileSync(new URL("../fixtures/plugins/example-repo/example-source.js", import.meta.url), "utf8");
const page_html = readFileSync(new URL("../fixtures/plugins/example-repo/page.html", import.meta.url), "utf8");

async function runInWorker(page, code, args = ["603", "movie", null, null], timeoutMs = 5000) {
  return page.evaluate(async ({ code, args, timeoutMs }) => {
    const { runScraperInWorker } = await import("/__fixture/source/js/core/plugins/pluginWorkerClient.js");
    return runScraperInWorker({ code, args, timeoutMs }, { workerFactory: () => new Worker("/plugin-worker.bundle.js") });
  }, { code, args, timeoutMs });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/__fixture/harness");
});

test("the worker runs a scraper with cheerio and crypto-js and returns clean rows", async ({ page }) => {
  // Same scraper logic, but parsing an inline page so no network is needed.
  const offline = scraper.replace(
    /const response = await fetch\([^;]+;\n\s*const \$ = cheerio\.load\(await response\.text\(\)\);/,
    `const $ = cheerio.load(${JSON.stringify(page_html)});`
  );
  expect(offline).not.toBe(scraper);
  const result = await runInWorker(page, offline);
  expect(result.ok).toBe(true);
  expect(result.streams).toHaveLength(2);
  expect(result.streams[0]).toMatchObject({ url: "https://media.example.invalid/video/open-1080.mp4", quality: "1080p", headers: null });
  expect(result.streams[0].title).toMatch(/^Open fixture \([0-9a-f]{8}\)$/);
  expect(result.streams[1].headers).toEqual({ Referer: "https://media.example.invalid/" });
});

test("a failed direct request is reported as needing a proxy", async ({ page }) => {
  // DNS for .invalid can be slow on some machines; allow for it.
  const result = await runInWorker(page, scraper, ["603", "movie", null, null], 20000);
  expect(result.ok).toBe(false);
  expect(result.needsProxy).toBe(true);
});

test("plugin code cannot reach this app, loopback or the app's storage", async ({ page }) => {
  const probe = `
    async function getStreams() {
      const attempts = [];
      for (const target of [location.origin + "/nuvio.env.js", "http://127.0.0.1:4373/health", "http://localhost:4371/"]) {
        try { await fetch(target); attempts.push("reached"); } catch (error) { attempts.push(String(error.message)); }
      }
      return [{ url: "https://a.example.invalid/v.mp4", name: attempts.join("|"), title: [typeof indexedDB, typeof importScripts, typeof localStorage].join(",") }];
    }
    module.exports = { getStreams };
  `;
  const result = await runInWorker(page, probe);
  expect(result.ok).toBe(true);
  expect(result.streams[0].name).not.toContain("reached");
  expect(result.streams[0].title).toBe("undefined,undefined,undefined");
});

test("a scraper that never finishes is stopped at the timeout", async ({ page }) => {
  const started = Date.now();
  const result = await runInWorker(page, "module.exports = { getStreams: () => { for (;;) {} } };", [], 500);
  expect(result.timedOut).toBe(true);
  expect(Date.now() - started).toBeLessThan(5000);
});
