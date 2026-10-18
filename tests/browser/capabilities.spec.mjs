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

for (const scenario of ["unknown-quality", "declared", "unsupported-mime"]) {
  test(`bundled source evidence distinguishes ${scenario} without rewriting original playback`, async ({
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
    if (scenario === "unknown-quality") {
      await expect(source).toContainText("Provider label: 4k");
      await expect(source).toContainText("Format and codec unknown");
      await expect(source).toContainText("Resolution unknown · HDR unknown");
      await expect(source).toContainText("Browser support unknown");
    } else if (scenario === "declared") {
      await expect(source).toContainText(
        "Provider format: webm / vp8 (unverified)",
      );
      await expect(source).toContainText(
        "Provider size: 640 × 360 (unverified) · HDR unknown",
      );
      await expect(source).toContainText(
        "Browser predicts native support; playback unverified",
      );
      for (const viewport of [
        { width: 1280, height: 800 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        for (const line of await source
          .locator(".source-capability-evidence")
          .all()) {
          const metrics = await line.evaluate((node) => ({
            scroll: node.scrollWidth,
            client: node.clientWidth,
            fontSize: getComputedStyle(node).fontSize,
          }));
          expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
          expect(metrics.fontSize).toBe("16px");
        }
        await page.screenshot({
          path: testInfo.outputPath(`capability-${viewport.width}.png`),
        });
      }
    } else {
      await expect(source).toContainText(
        "Native support not reported; another engine may work",
      );
    }
    // Declared support is advisory. The same original local media is still chosen.
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

test("actual repository/flatten and browser predictions retain explicit fields and unknown boundaries", async ({
  page,
}) => {
  await page.goto("/__fixture/harness");
  const result = await page.evaluate(async (provider) => {
    const { streamRepository } =
      await import("/__fixture/source/js/data/repository/streamRepository.js");
    const { flattenStreams } =
      await import("/__fixture/source/js/core/streams/streamList.js");
    const { probeSourceCapabilities } =
      await import("/__fixture/source/js/core/streams/sourceCapabilities.js");
    const response = await streamRepository.getStreamsFromAddon(
      `${provider}/declared`,
      "movie",
      "fixture:original",
    );
    const [stream] = flattenStreams({
      status: "success",
      data: [{ addonName: "Declared Fixture", streams: response.data }],
    });
    const descriptor = stream.sourceDescriptor;
    const native = document
      .createElement("video")
      .canPlayType(descriptor.contentType);
    const report = await probeSourceCapabilities(descriptor, {
      videoElement: document.createElement("video"),
      mediaCapabilities: navigator.mediaCapabilities,
    });
    return { descriptor, report, native, url: stream.url };
  }, provider);
  expect(result.url).toBe(`${provider}/media/procedural-vp8-opus.webm`);
  expect(result.descriptor.video).toMatchObject({
    codec: "vp8",
    width: 640,
    height: 360,
    hdr: null,
  });
  expect(result.descriptor.audioTracks).toEqual([
    { codec: "opus", language: "und", channels: 1 },
  ]);
  expect(result.report.evidence).toBe("browser-prediction");
  expect(result.report.native).toBe(result.native);
  expect(result.report.decodingStatus).toBe("reported");
  expect(result.report.videoDecoding.supported).toBe(true);
  expect(result.report.scope).toContain("audio/HDR/output unverified");
});

test("header/expiry guidance is visible and source metadata cannot render secret URLs or markup", async ({
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
  await expect(
    page.getByText(
      "Requires request headers; native playback may be restricted",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Provider-declared link expiry has passed; refresh sources",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator("img,script")).toHaveCount(0);
  expect(
    await page.evaluate(() => globalThis.__fixtureInjected),
  ).toBeUndefined();
  expect(output.label).toContain("Format and codec unknown");
  expect(output.label).toContain("Provider-declared link expiry has passed");
  expect(
    JSON.stringify(output.descriptor) + output.html + output.label,
  ).not.toMatch(/synthetic-private|Authorization|token=/);
});
