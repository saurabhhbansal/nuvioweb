import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context, request }) => {
  await request.post("/__test/build?revision=0");
  // Context routing covers page and worker-owned outgoing fetches in Chromium.
  // Worker update scripts are deliberately served by the real loopback server.
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:4371") await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test("real worker replaces a stale cached shell and refreshes runtime config", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("#account .desktop-auth-card")).toBeVisible();
  // Upstream deliberately disables automatic registration on localhost.
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.reload();
  expect(await page.evaluate(() => globalThis.__NUVIO_PWA_APP__)).toBe(0);
  const oldCache = await page.evaluate(async () => (await caches.keys()).find((key) => key.endsWith("-fixture-0")));
  expect(oldCache).toBeTruthy();
  expect(await page.evaluate(async (key) => (await (await caches.open(key)).match("/app.bundle.js")).text(), oldCache)).toContain("__NUVIO_PWA_APP__=0");

  await request.post("/__test/build?revision=1");
  // An active old worker intentionally keeps the old shell until an update activates.
  expect(await page.evaluate(async () => (await fetch("/app.bundle.js")).text())).toContain("__NUVIO_PWA_APP__=0");
  expect(await page.evaluate(async () => (await fetch("/nuvio.env.js")).text())).toContain("__NUVIO_PWA_CONFIG__=1");
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  // The new build installs and then waits: the open page keeps the old one
  // until the user taps "Reload", which posts SKIP_WAITING.
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting))).toBe(true);
  expect(await page.evaluate(async () => (await fetch("/app.bundle.js")).text())).toContain("__NUVIO_PWA_APP__=0");
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting.postMessage({ type: "SKIP_WAITING" }));
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter((key) => key.startsWith("nuvio-app-shell-")))).toEqual([oldCache.replace(/0$/, "1")]);
  await expect.poll(() => page.evaluate(async () => (await fetch("/app.bundle.js")).text())).toContain("__NUVIO_PWA_APP__=1");
  await page.reload();
  expect(await page.evaluate(() => globalThis.__NUVIO_PWA_APP__)).toBe(1);
  expect(await page.evaluate(() => globalThis.__NUVIO_PWA_CONFIG__)).toBe(1);
  await expect(page.locator("#account .desktop-auth-card")).toBeVisible();
});

test("preview host revalidates unversioned assets, protects config and supports navigation fallback", async ({ page, request }) => {
  for (const path of ["/", "/app.bundle.js", "/css/base.css"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-cache");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  }
  for (const path of ["/sw.js", "/nuvio.env.js"]) {
    expect((await request.get(path)).headers()["cache-control"]).toContain("no-store");
  }
  expect((await request.get("/missing.js")).status()).toBe(404);
  expect((await request.get("/api/unavailable")).status()).toBe(404);
  await page.goto("/library");
  await expect(page.locator("#account .desktop-auth-card")).toBeVisible();
  await page.reload();
  await expect(page.locator("#account .desktop-auth-card")).toBeVisible();
});
