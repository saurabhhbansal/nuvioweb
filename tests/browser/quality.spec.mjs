import { test, expect } from "@playwright/test";
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
  ["quality-1080", 1920, 1080, "original-1080p.mp4"],
  ["quality-2160", 3840, 2160, "original-2160p.mp4"],
  ["quality-hls", 3840, 2160, "2160p/stream.m3u8"],
  ["quality-dash", 3840, 2160, "2160p/manifest.mpd"],
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
    await page.locator('[data-action="playStream"]').click();
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
    const initial = await video.evaluate((video) => ({
      width: video.videoWidth,
      height: video.videoHeight,
      src: video.currentSrc,
      duration: video.duration,
      error: video.error?.code || null,
    }));
    expect(initial.duration).toBeGreaterThan(1);
    await video.evaluate(async (video) => {
      video.pause();
      video.currentTime = 0.4;
      await video.play();
    });
    await expect
      .poll(() => video.evaluate((video) => video.currentTime))
      .toBeGreaterThan(0.6);
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
      expect(initial.src).toMatch(/^blob:http:\/\/127\.0\.0\.1:4371\//);
      expect(
        media.some((entry) => entry.path === "/media/quality/2160p/init.mp4"),
      ).toBe(true);
      expect(
        media.some(
          (entry) => entry.path === "/media/quality/2160p/segment.m4s",
        ),
      ).toBe(true);
    }
    const engineEvents = await page.evaluate(
      () => globalThis.__qualityEngineEvents,
    );
    await testInfo.attach("actual-quality-observation", {
      body: JSON.stringify({ scenario, initial, media, engineEvents }),
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
      expect(
        rejected.some(
          (entry) => entry.path === "/media/quality/cors-denied/stream.m3u8",
        ),
      ).toBe(true);
    else expect(failed.some((entry) => entry.status === status)).toBe(true);
    if (["quality-expired", "quality-hls-cors"].includes(scenario)) {
      await expect.poll(() => applicationLogs.length).toBeGreaterThan(0);
      if (scenario === "quality-hls-cors")
        expect(JSON.stringify(await Promise.all(applicationLogs))).toContain(
          "switching player engine",
        );
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
