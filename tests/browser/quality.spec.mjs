import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const provenance = JSON.parse(await readFile(new URL("../fixtures/media/quality/provenance.json", import.meta.url), "utf8"));
const nativeProvenance = JSON.parse(await readFile(new URL("../fixtures/media/quality/native-provenance.json", import.meta.url), "utf8"));
const adaptiveProvenance = JSON.parse(await readFile(new URL("../fixtures/media/quality/adaptive-provenance.json", import.meta.url), "utf8"));
const provider = "http://127.0.0.1:4373";
test.beforeEach(async ({ context, request }) => {
  await request.delete(`${provider}/__fixture/requests`);
  await context.route("**/*", async (route) => {
    if (
      ["http://127.0.0.1:4371", provider].includes(
        new URL(route.request().url()).origin,
      )
    )
      await route.continue();
    else await route.abort("blockedbyclient");
  });
});
async function openSource(page, context, scenario) {
  await context.addInitScript(
    ({ provider, scenario }) => {
      localStorage.setItem(
        "installedAddonUrls",
        JSON.stringify({
          __profileScoped: true,
          version: 1,
          profiles: { 1: [`${provider}/${scenario}`] },
        }),
      );
      globalThis.__qualityEngineEvents = [];
      globalThis.__qualitySourceErrors = [];
      document.addEventListener("error", event => {
        if (event.target?.tagName === "SOURCE" && event.target.parentElement?.tagName === "VIDEO") {
          globalThis.__qualitySourceErrors.push({ target: "SOURCE", videoError: event.target.parentElement.error?.code || null });
        }
      }, true);
      for (const name of ["hlstrackschanged", "dashtrackschanged"])
        document.addEventListener(
          name,
          (event) => {
            if (
              globalThis.__qualityEngineEvents.length < 8 &&
              ["hls.js", "dash.js"].includes(event.detail?.playbackEngine)
            )
              globalThis.__qualityEngineEvents.push(
                event.detail.playbackEngine,
              );
          },
          true,
        );
    },
    { provider, scenario },
  );
  await page.goto("/");
  await page.locator('[data-action="continueGuest"]').click();
  await page
    .locator('#home .home-poster-card[data-item-id="fixture:original"]')
    .first()
    .click();
  await page.locator('button[data-action="playDefault"]').click();
  await expect(page.locator('[data-action="playStream"]')).toHaveCount(1);
}
for (const [scenario, width, height, file] of [
  ["quality-1080", 1920, 1080, "native-1080p.mp4"],
  ["quality-2160", 3840, 2160, "native-2160p.mp4"],
  ["quality-hls", 3840, 2160, "canonical2160p/stream.m3u8"],
  ["quality-dash", 3840, 2160, "canonical2160p/manifest.mpd"],
]) {
  test(`bundled ${scenario} preserves original dimensions and supports seek`, async ({
    page,
    context,
    request,
  }, testInfo) => {
    const media = [];
    page.on("response", (response) => {
      if (response.url().startsWith(`${provider}/media/quality/`))
        media.push({
          path: new URL(response.url()).pathname,
          status: response.status(),
        });
    });
    await openSource(page, context, scenario);
    await expect(page.locator('[data-action="playStream"]')).toContainText(
      `Provider size: ${width} × ${height} (unverified)`,
    );
    // These fixtures are H.264. A capable engine must decode them; an engine
    // that reports no H.264 support must still surface an explicit, actionable
    // failure instead of hanging. Do not assume Chromium's codec set.
    const original = provenance.files.find(entry => entry.file === (scenario === "quality-1080" ? "original-1080p.mp4" : "original-2160p.mp4"));
    const canonicalAdaptive = adaptiveProvenance.files.find(entry => entry.source === original.file);
    const servedSourceSha256 = file.startsWith("native-")
      ? nativeProvenance.files.find(entry => entry.file === file).sha256
      : canonicalAdaptive.packaged.find(entry => entry.file === file).sha256;
    const expectedDuration = file.startsWith("native-") ? original.observed.duration : canonicalAdaptive.duration;
    const predictionType = `video/mp4; codecs="${original.codec}"`;
    const nativePrediction = await page.evaluate(
      type => document.createElement("video").canPlayType(type), predictionType,
    );
    const supportsFixtureCodec = nativePrediction !== "";
    await page.locator('[data-action="playStream"]').click();
    if (!supportsFixtureCodec) {
      const overlay = page.locator("#playerStartupErrorOverlay");
      await expect(overlay).toHaveAttribute("aria-hidden", "false");
      await expect(overlay).toBeVisible();
      await expect(overlay.locator(".player-startup-error-title")).toHaveText(
        "Playback Error",
      );
      await expect(
        overlay.locator(".player-startup-error-message"),
      ).not.toBeEmpty();
      await testInfo.attach("unsupported-codec", {
        body: JSON.stringify({ scenario, outcome: "UNSUPPORTED_DIAGNOSTIC_NO_DECODE", engine: testInfo.project.name, predictionType, nativePrediction, originalEncodedSourceSha256: original.sha256, servedSourceSha256, message: await overlay.innerText() }),
        contentType: "application/json",
      });
      await overlay.getByRole("button", { name: "Go Back", exact: true }).click();
      await expect(page.locator('[data-action="playStream"]')).toBeVisible();
      return;
    }
    const video = page.locator("video");
    await expect
      .poll(
        () =>
          video.evaluate((video) => ({
            width: video.videoWidth,
            height: video.videoHeight,
            error: video.error?.code || null,
          })),
        { timeout: 15000 },
      )
      .toEqual({ width, height, error: null });
    await expect
      .poll(() => video.evaluate((video) => video.currentTime))
      .toBeGreaterThan(0.1);
    // Native and adaptive cases use separately inventoried lossless canonical
    // containers. Original encoded packets/dimensions remain unchanged.
    await expect.poll(() => video.evaluate(video => video.duration))
      .toBeGreaterThan(expectedDuration - 0.05);
    const initial = await video.evaluate((video) => ({
      width: video.videoWidth,
      height: video.videoHeight,
      src: video.currentSrc,
      duration: video.duration,
      error: video.error?.code || null,
    }));
    expect(initial.duration).toBeGreaterThan(1);
    await video.evaluate((video) => {
      globalThis.__qualitySeekObservation = { seeked: false, playRejection: null };
      video.addEventListener("seeked", () => { globalThis.__qualitySeekObservation.seeked = true; }, { once: true });
      video.pause();
      video.currentTime = 0.4;
      // Some WebKit/GStreamer builds resolve play() only at the end of this
      // short clip, despite a real seeked event and advancing media clock.
      // Observe actual delivery instead of waiting past the observed frames.
      video.play().catch(error => { globalThis.__qualitySeekObservation.playRejection = error.message; });
    });
    await expect.poll(() => video.evaluate(video => ({
      seeked: globalThis.__qualitySeekObservation.seeked,
      advanced: video.currentTime > 0.6,
      seeking: video.seeking,
      ended: video.ended,
      error: video.error?.code || null,
      playRejection: globalThis.__qualitySeekObservation.playRejection,
    }))).toEqual({ seeked: true, advanced: true, seeking: false, ended: false, error: null, playRejection: null });
    expect(
      await video.evaluate((video) => video.error?.code || null),
    ).toBeNull();
    if (scenario === "quality-1080") {
      const playbackFailures = [];
      page.on("console", (message) => {
        if (message.type() === "warning" && message.text().startsWith("Playback failed"))
          playbackFailures.push(message.text());
      });
      const timeBeforeTrackError = await video.evaluate((video) => video.currentTime);
      await video.evaluate((video) => {
        const track = document.createElement("track");
        track.kind = "subtitles";
        video.appendChild(track);
        track.dispatchEvent(new Event("error", { bubbles: false }));
        track.remove();
      });
      await expect.poll(() => video.evaluate((video) => video.currentTime))
        .toBeGreaterThan(timeBeforeTrackError + 0.1);
      expect(playbackFailures).toEqual([]);
      await expect(page.locator('[data-action="playPause"] .player-control-icon')).toHaveAttribute("style", /ic_player_pause\.svg/);
      expect(await video.evaluate((video) => video.error?.code || null)).toBeNull();
    }
    expect(
      media.some(
        (entry) =>
          entry.path === `/media/quality/${file}` &&
          [200, 206].includes(entry.status),
      ),
    ).toBe(true);
    if (scenario === "quality-1080" || scenario === "quality-2160")
      expect(initial.src).toBe(`${provider}/media/quality/${file}`);
    else {
      // Both paths must fetch inventoried, packet-identical canonical segments
      // and actually decode/seek at 4K above.
      // A native HLS fallback is legitimate; DASH still requires the MSE path.
      if (scenario === "quality-hls" && initial.src === `${provider}/media/quality/${file}`) {
        expect(initial.src).toBe(`${provider}/media/quality/canonical2160p/stream.m3u8`);
      } else {
        expect(initial.src).toMatch(/^blob:http:\/\/127\.0\.0\.1:4371\//);
      }
      expect(media.some(entry => entry.path === "/media/quality/canonical2160p/init.mp4" && [200, 206].includes(entry.status))).toBe(true);
      expect(media.some(entry => entry.path === "/media/quality/canonical2160p/segment.m4s" && [200, 206].includes(entry.status))).toBe(true);
    }
    const engineEvents = await page.evaluate(
      () => globalThis.__qualityEngineEvents,
    );
    await testInfo.attach("actual-quality-observation", {
      body: JSON.stringify({ scenario, outcome: "ORIGINAL_DECODE_AND_SEEK", engine: testInfo.project.name, predictionType, nativePrediction, originalEncodedSourceSha256: original.sha256, servedSourceSha256, initial, media, engineEvents }),
      contentType: "application/json",
    });
    const observed = await (
      await request.get(`${provider}/__fixture/requests`)
    ).json();
    expect(
      observed.every(
        (entry) => !entry.authorizationPresent && !entry.apiKeyPresent,
      ),
    ).toBe(true);
  });
}
for (const [scenario, status] of [
  ["quality-expired", 410],
  ["quality-restricted", 403],
  ["quality-hls-cors", 200],
]) {
  test(`bundled ${scenario} surfaces playback failure and allows return`, async ({
    page,
    context,
    request,
  }, testInfo) => {
    const failed = [];
    const rejected = [];
    const applicationLogs = [];
    page.on("console", (message) => {
      if (
        message.type() === "warning" &&
        message.text().startsWith("Playback failed during startup")
      )
        applicationLogs.push(
          Promise.all(message.args().map((arg) => arg.jsonValue())),
        );
    });
    page.on("requestfailed", (request) => {
      if (request.url().startsWith(`${provider}/media/quality/`))
        rejected.push({
          path: new URL(request.url()).pathname,
          error: request.failure()?.errorText || "unknown",
        });
    });
    page.on("response", (response) => {
      if (response.url().startsWith(`${provider}/media/quality/`))
        failed.push({
          path: new URL(response.url()).pathname,
          status: response.status(),
        });
    });
    await openSource(page, context, scenario);
    if (scenario === "quality-expired")
      await expect(page.locator('[data-action="playStream"]')).toContainText(
        "Provider-declared link expiry has passed",
      );
    await page.locator('[data-action="playStream"]').click();
    const overlay = page.locator("#playerStartupErrorOverlay");
    await expect(overlay).toHaveAttribute("aria-hidden", "false");
    await expect(overlay).toBeVisible();
    await expect(overlay.locator(".player-startup-error-title")).toHaveText(
      "Playback Error",
    );
    await expect(
      overlay.locator(".player-startup-error-message"),
    ).not.toBeEmpty();
    if (scenario !== "quality-hls-cors")
      await expect(
        overlay.locator(".player-startup-error-message"),
      ).toContainText("The browser could not load this source");
    if (scenario === "quality-hls-cors")
      // Engines report a blocked manifest as either a failed request or a
      // failed response. Either observation plus the visible overlay and the
      // switching-engine log below proves the same product behaviour.
      expect(
        rejected.some(
          (entry) => entry.path === "/media/quality/cors-denied/stream.m3u8",
        ) ||
          failed.some(
            (entry) =>
              entry.path === "/media/quality/cors-denied/stream.m3u8",
          ),
      ).toBe(true);
    else if (testInfo.project.name !== "webkit" || failed.some(entry => entry.status === status)) {
      // Retain the direct browser-status requirement wherever it is exposed.
      expect(failed.some((entry) => entry.status === status)).toBe(true);
    } else {
      // WebKit's native media request can fail before Playwright exposes its
      // HTTP response (status 0 / Load request cancelled). Require the actual
      // browser GET and same-path failure before issuing a separate fixture
      // control HEAD; never present that control status as browser evidence.
      const path = `/media/quality/${scenario === "quality-expired" ? "expired" : "restricted"}.mp4`;
      expect(rejected.some(entry => entry.path === path)).toBe(true);
      const browserRequests = await (await request.get(`${provider}/__fixture/requests`)).json();
      expect(browserRequests.some(entry => entry.method === "GET" && entry.path === path)).toBe(true);
      const fixtureControl = await request.head(`${provider}${path}`);
      expect(fixtureControl.status()).toBe(status);
      await testInfo.attach("native-http-failure-evidence", {
        body: JSON.stringify({ browserObservation: "GET_AND_REQUEST_FAILED_HTTP_STATUS_NOT_EXPOSED", path, rejected: rejected.filter(entry => entry.path === path), fixtureControl: { method: "HEAD", status: fixtureControl.status(), scope: "INDEPENDENT_FIXTURE_CONTROL_NOT_BROWSER_RESPONSE" } }),
        contentType: "application/json",
      });
    }
    if (["quality-expired", "quality-hls-cors"].includes(scenario)) {
      await expect.poll(() => applicationLogs.length).toBeGreaterThan(0);
      if (scenario === "quality-hls-cors") {
        // Engines classify the denied manifest differently: Chromium falls back
        // and logs the switching warning, Firefox's HLS.js reports a fatal
        // network error directly. Either way the failure must be classified,
        // not swallowed, and must never include the signed query.
        const logs = JSON.stringify(await Promise.all(applicationLogs));
        if (!/switching player engine|"mediaErrorCode":2/.test(logs)) {
          // WebKit may dispatch a real, code-less child SOURCE failure even
          // while hls.js owns the route. The browser's rejected manifest plus
          // captured SOURCE target and matching generic reason are evidence;
          // fabricating media code2 or an HTTP cause would be incorrect.
          expect(logs).toMatch(/"mediaErrorCode":0/);
          expect(await page.evaluate(() => globalThis.__qualitySourceErrors))
            .toContainEqual({ target: "SOURCE", videoError: null });
          await expect(overlay).toContainText("Reason: startup-source-error");
        }
      }
      expect(JSON.stringify(await Promise.all(applicationLogs))).not.toContain(
        "synthetic-private-media",
      );
      await page.screenshot({ path: testInfo.outputPath("source-error.png") });
    }
    await testInfo.attach("actual-source-failure", {
      body: JSON.stringify({
        scenario,
        failed,
        rejected,
        message: await overlay.innerText(),
      }),
      contentType: "application/json",
    });
    await overlay.getByRole("button", { name: "Go Back", exact: true }).click();
    await expect(page.locator('[data-action="playStream"]')).toBeVisible();
  });
}
