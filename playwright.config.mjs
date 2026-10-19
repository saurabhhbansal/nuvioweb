import { defineConfig, devices } from "@playwright/test";
// WebKit cannot run on every workstation (this project's ARM64 development host
// is missing system libraries), so its project is opt-in. CI sets
// NUVIO_PLAYWRIGHT_WEBKIT=1 and runs `--project=webkit`; the default local
// `npx playwright test` stays Chromium-only and cannot fail on a missing browser.
const webkitProject = process.env.NUVIO_PLAYWRIGHT_WEBKIT === "1"
  ? [{ name: "webkit", testMatch: "**/engine-capabilities.spec.mjs", use: { ...devices["Desktop Safari"] } }]
  : [];
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30000,
  expect: { timeout: 10000 },
  retries: 0,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4371", trace: "retain-on-failure", screenshot: "only-on-failure", serviceWorkers: "block" },
  projects: [
    { name: "chromium", testIgnore: "**/pwa.spec.mjs", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-pwa", testMatch: "**/pwa.spec.mjs", use: { ...devices["Desktop Chrome"], serviceWorkers: "allow" } },
    ...webkitProject
  ],
  webServer: [
    { command: "node tests/browser/server.mjs", env: { NUVIO_PWA_TEST: "1", NUVIO_ADDON_TEST: "1" }, url: "http://127.0.0.1:4371", reuseExistingServer: false, timeout: 15000 },
    { command: "node tests/fixtures/addons/server.mjs", url: "http://127.0.0.1:4373/health", reuseExistingServer: false, timeout: 15000 }
  ]
});
