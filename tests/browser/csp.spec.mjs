import { test, expect } from "@playwright/test";

// The loopback server sends deploy/cloudflare/_headers, so these run the
// built app under the same Content-Security-Policy the preview serves.
test.beforeEach(async ({ context }) => {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && url.port === "4371") await route.continue();
    else await route.abort("blockedbyclient");
  });
  await context.addInitScript(() => {
    globalThis.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      globalThis.__cspViolations.push(`${event.effectiveDirective} ${event.blockedURI || "inline"}`);
    });
  });
});

test("the app shell is served with the strict policy and the worker with its own", async ({ request }) => {
  const shell = await request.get("/");
  const csp = shell.headers()["content-security-policy"] || "";
  for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"]) {
    expect(csp).toContain(directive);
  }
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  expect(shell.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(shell.headers()["permissions-policy"]).toContain("camera=()");

  const worker = await request.get("/plugin-worker.bundle.js");
  const workerCsp = worker.headers()["content-security-policy"] || "";
  expect(workerCsp).toContain("'unsafe-eval'");
  expect(workerCsp).not.toContain("frame-ancestors");
});

test("startup raises no CSP violation", async ({ page }) => {
  const consoleReports = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) consoleReports.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator("#account .desktop-auth-card")).toBeVisible();
  await expect(page.getByText("Nuvio could not start", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__cspViolations)).toEqual([]);
  expect(consoleReports).toEqual([]);
});

test("image fallbacks still run although inline handlers are blocked", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#account .desktop-auth-card")).toBeVisible();
  const result = await page.evaluate(async () => {
    const holder = document.createElement("div");
    holder.innerHTML =
      '<img data-img-fallback="hide-reveal" src="/missing-fixture-image.png" alt="" /><span hidden>label</span>' +
      '<img onerror="globalThis.__inlineRan=true" src="/missing-fixture-image-2.png" alt="" />';
    document.body.appendChild(holder);
    const [image, , blocked] = holder.children;
    await new Promise((resolve) => {
      const done = () => (image.hidden ? resolve() : setTimeout(done, 20));
      done();
    });
    await new Promise((resolve) => (blocked.complete ? resolve() : blocked.addEventListener("error", resolve, { once: true })));
    return { hidden: image.hidden, revealed: !holder.children[1].hidden, inlineRan: Boolean(globalThis.__inlineRan) };
  });
  expect(result).toEqual({ hidden: true, revealed: true, inlineRan: false });
});
