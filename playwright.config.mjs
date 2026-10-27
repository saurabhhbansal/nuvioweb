import { defineConfig, devices } from "@playwright/test";
// Default runs are Chromium-only (CI: browser.yml). Firefox and WebKit run the
// playback quality and audio remux specs on demand (CI: browser-engines.yml, manual).
const engineSpecs = ["**/quality.spec.mjs", "**/remux-audio.spec.mjs"];
const webkitProject = process.env.NUVIO_PLAYWRIGHT_WEBKIT === "1"
  ? [{ name: "webkit", testMatch: engineSpecs, use: { ...devices["Desktop Safari"] } }]
  : [];
const firefoxProject = process.env.NUVIO_PLAYWRIGHT_FIREFOX === "1"
  ? [{ name: "firefox", testMatch: engineSpecs, use: { ...devices["Desktop Firefox"] } }]
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
    ...webkitProject,
    ...firefoxProject
  ],
  webServer: [
    { command: "node tests/browser/server.mjs", env: { NUVIO_PWA_TEST: "1", NUVIO_ADDON_TEST: "1" }, url: "http://127.0.0.1:4371", reuseExistingServer: false, timeout: 15000 },
    { command: "node tests/fixtures/addons/server.mjs", url: "http://127.0.0.1:4373/health", reuseExistingServer: false, timeout: 15000 }
  ]
});
