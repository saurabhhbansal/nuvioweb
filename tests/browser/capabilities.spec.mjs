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

for (const scenario of ["unknown-quality", "declared", "unsupported-mime", "conflicting-codecs"]) {
  test(`compact source card for ${scenario} still plays the original media`, async ({
    page,
    context,
    request,
  }, testInfo) => {
    await context.addInitScript(
      ({ provider, scenario }) =>
        localStorage.setItem(
          "installedAddonUrls",
          JSON.stringify({
            __profileScoped: true,
            version: 1,
            profiles: { 1: [`${provider}/${scenario}`] },
          }),
        ),
      { provider, scenario },
    );
    await page.goto("/");
    await page.locator('[data-action="continueGuest"]').click();
    await page
      .locator('#home .home-poster-card[data-item-id="fixture:original"]')
      .first()
      .click();
    await page.locator('button[data-action="playDefault"]').click();
    const source = page.locator('[data-action="playStream"]');
    await expect(source).toHaveCount(1);
    // No "unknown/unverified" lines and no hint without positive knowledge.
    await expect(source).not.toContainText(/unverified|unknown|Provider label|Browser predicts/i);
    await expect(source.locator(".stream-route-source-hint")).toHaveCount(0);
    if (scenario === "declared") {
      await page.setViewportSize({ width: 390, height: 844 });
      const metrics = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: window.innerWidth,
      }));
      expect(metrics.scroll).toBeLessThanOrEqual(metrics.width);
      await page.screenshot({ path: testInfo.outputPath("capability-390.png") });
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    await source.click();
    await expect
      .poll(() =>
        page.locator("video").evaluate((video) => ({
          width: video.videoWidth,
          height: video.videoHeight,
          error: video.error?.code || null,
        })),
      )
      .toEqual({ width: 640, height: 360, error: null });
    await expect
      .poll(() => page.locator("video").evaluate((video) => video.currentTime))
      .toBeGreaterThan(0.1);
    expect(
      await page.locator("video").evaluate((video) => video.currentSrc),
    ).toBe(`${provider}/media/procedural-vp8-opus.webm`);
    const requests = await (
      await request.get(`${provider}/__fixture/requests`)
    ).json();
    expect(
      requests.every(
        (request) => !request.authorizationPresent && !request.apiKeyPresent,
      ),
    ).toBe(true);
  });
}

test("header hint is visible and source metadata cannot render secret URLs or markup", async ({
  page,
}) => {
  await page.goto("/__fixture/harness");
  const output = await page.evaluate(async (provider) => {
    const { describeSource } =
      await import("/__fixture/source/js/core/streams/sourceCapabilities.js");
    const { normalizeSourceForDisplay, renderBrowserSourceCardContent } =
      await import("/__fixture/source/js/ui/components/browserStreamSourceCard.js");
    const source = {
      name: '<img src=x onerror="globalThis.__fixtureInjected=true">',
      url: `${provider}/media/procedural-vp8-opus.webm?token=synthetic-private-query`,
      video: { codec: "<script>bad</script>" },
      behaviorHints: {
        proxyHeaders: {
          request: { Authorization: "synthetic-private-header" },
        },
      },
      expiresAt: "2026-01-01T00:00:00Z",
    };
    source.sourceDescriptor = describeSource(source);
    const model = normalizeSourceForDisplay(source, {
      badgeSettings: { showAddonLogo: false },
      streamBadgesEnabled: false,
    });
    return {
      descriptor: source.sourceDescriptor,
      html: renderBrowserSourceCardContent(model),
      label: model.accessibleLabel,
    };
  }, provider);
  await page.locator("body").evaluate((body, html) => {
    body.innerHTML = html;
  }, output.html);
  // One compact hint: headers outrank the expiry.
  await expect(page.locator(".stream-route-source-hint")).toHaveCount(1);
  await expect(page.locator(".stream-route-source-hint")).toHaveText("Needs headers");
  await expect(page.locator("body img,body script")).toHaveCount(0);
  expect(
    await page.evaluate(() => globalThis.__fixtureInjected),
  ).toBeUndefined();
  expect(output.label).toContain("Needs headers");
  expect(
    JSON.stringify(output.descriptor) + output.html + output.label,
  ).not.toMatch(/synthetic-private|Authorization|token=/);
});

test("raw provider descriptors cannot bypass flattening or direct card redaction", async ({
  page,
}) => {
  await page.goto("/__fixture/harness");
  const output = await page.evaluate(async (provider) => {
    const { flattenStreams } =
      await import("/__fixture/source/js/core/streams/streamList.js");
    const { normalizeSourceForDisplay, renderBrowserSourceCardContent } =
      await import("/__fixture/source/js/ui/components/browserStreamSourceCard.js");
    const raw = {
      name: "Untrusted plugin metadata fixture",
      url: `${provider}/media/procedural-vp8-opus.webm`,
      sourceDescriptor: {
        contentType:
          "video/https://fixture.invalid?token=synthetic-private-type",
        video: {
          codec: "https://fixture.invalid?token=synthetic-private-codec",
          hdr: "x".repeat(10000),
        },
        audioTracks: Array(100).fill({
          codec: "https://fixture.invalid?token=synthetic-private-audio",
        }),
        requiredHeaderCount: "synthetic-private-header",
      },
    };
    const [stream] = flattenStreams({
      status: "success",
      data: [{ addonName: "Untrusted Fixture", streams: [raw] }],
    });
    const options = {
      badgeSettings: { showAddonLogo: false },
      streamBadgesEnabled: false,
    };
    const direct = normalizeSourceForDisplay(raw, options);
    return {
      descriptor: stream.sourceDescriptor,
      directHtml: renderBrowserSourceCardContent(direct),
      flattenedHtml: renderBrowserSourceCardContent(
        normalizeSourceForDisplay(stream, options),
      ),
    };
  }, provider);
  expect(output.descriptor.video).toMatchObject({ codec: null, hdr: null });
  expect(output.descriptor.audioTracks).toHaveLength(32);
  expect(output.descriptor.contentType).toBeNull();
  expect(JSON.stringify(output)).not.toMatch(
    /synthetic-private|token=|fixture.invalid|xxxx/,
  );
  for (const html of [output.directHtml, output.flattenedHtml]) {
    await page.locator("body").evaluate((body, html) => {
      body.innerHTML = html;
    }, html);
    await expect(
      page.getByText("Untrusted plugin metadata fixture", { exact: true }),
    ).toBeVisible();
  }
});

test("a header-restricted source reports header-required with a working return path", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await context.addInitScript(
    ({ provider }) =>
      localStorage.setItem(
        "installedAddonUrls",
        JSON.stringify({
          __profileScoped: true,
          version: 1,
          profiles: { 1: [`${provider}/startup-header-required`] },
        }),
      ),
    { provider },
  );
  await page.goto("/");
  await page.locator('[data-action="continueGuest"]').click();
  await page
    .locator('#home .home-poster-card[data-item-id="fixture:original"]')
    .first()
    .click();
  await page.locator('button[data-action="playDefault"]').click();
  const source = page.locator('[data-action="playStream"]');
  await expect(source).toHaveCount(1);
  await expect(source.locator(".stream-route-source-hint")).toHaveText("Needs headers");
  await source.click();
  const overlayBack = page.locator('[data-player-error-action="back"]');
  await expect(overlayBack).toBeVisible({ timeout: 45000 });
  await expect(page.locator(".player-startup-error-message")).toContainText(
    "requires special request headers",
  );
  await expect(page.locator(".player-startup-error-details")).toContainText(
    "Reason: header-required",
  );
  await expect(page.locator(".player-startup-error-details")).not.toContainText(
    "Reason: startup-stall",
  );
  const message = await page.locator(".player-startup-error-message").innerText();
  expect(message).not.toContain("..");
  await overlayBack.click();
  await expect
    .poll(() => page.evaluate(() => window.__NUVIO_CURRENT_ROUTE__))
    .toBe("stream");
});
