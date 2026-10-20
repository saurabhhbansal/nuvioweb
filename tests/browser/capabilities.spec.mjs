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
    } else if (scenario === "conflicting-codecs") {
      await expect(source).toContainText("Provider format: webm / vp09.00.10.08 (unverified)");
      await expect(source).toContainText("Browser support unknown");
      await expect(source).not.toContainText("Browser predicts native support");
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

test("real browser probes keep conflicting configurations unknown and isolated from clean MIME caches", async ({ page }, testInfo) => {
  await page.goto("/__fixture/harness");
  const output = await page.evaluate(async (provider) => {
    const { streamRepository } = await import("/__fixture/source/js/data/repository/streamRepository.js");
    const { flattenStreams } = await import("/__fixture/source/js/core/streams/streamList.js");
    const { probeSourceCapabilities } = await import("/__fixture/source/js/core/streams/sourceCapabilities.js");
    const { normalizeSourceForDisplay } = await import("/__fixture/source/js/ui/components/browserStreamSourceCard.js");
    const getSource = async (scenario) => {
      const response = await streamRepository.getStreamsFromAddon(`${provider}/${scenario}`, "movie", "fixture:original");
      return flattenStreams({ status: "success", data: [{ addonName: "Legal Fixture", streams: response.data }] })[0];
    };
    const clean = await getSource("declared");
    const conflict = await getSource("conflicting-codecs");
    const configurations = [];
    const mediaCapabilities = navigator.mediaCapabilities && {
      decodingInfo(configuration) {
        configurations.push(configuration);
        return navigator.mediaCapabilities.decodingInfo(configuration);
      }
    };
    const probe = (source) => probeSourceCapabilities(source.sourceDescriptor, {
      videoElement: document.createElement("video"), mediaCapabilities
    });
    const cleanReport = await probe(clean);
    const callsBeforeConflict = configurations.length;
    const conflictReport = await probe(conflict);
    const display = (source) => normalizeSourceForDisplay(source, {
      badgeSettings: { showAddonLogo: false }, streamBadgesEnabled: false
    }).evidenceLines;
    // A clean card first populates the exact same MIME cache; conflict stays unknown.
    const cleanLines = display(clean);
    const conflictLines = display(conflict);
    return {
      cleanReport, conflictReport, cleanLines, conflictLines,
      callsBeforeConflict, callsAfterConflict: configurations.length, configurations,
      descriptor: conflict.sourceDescriptor,
      native: document.createElement("video").canPlayType(clean.sourceDescriptor.contentType),
      url: conflict.url
    };
  }, provider);
  expect(output.descriptor.contentType).toBe('video/webm; codecs="vp8,opus"');
  expect(output.descriptor.video.codec).toBe("vp09.00.10.08");
  expect(output.conflictReport).toMatchObject({ native: "unknown", decodingStatus: "unknown", videoDecoding: null });
  expect(output.callsAfterConflict).toBe(output.callsBeforeConflict);
  expect(output.conflictLines).toContain("Browser support unknown");
  expect(output.cleanReport.native).toBe(output.native === "" ? "not-reported" : output.native);
  expect(output.url).toBe(`${provider}/media/procedural-vp8-opus.webm`);
  if (output.callsBeforeConflict) {
    expect(output.configurations).toEqual([{
      type: "file",
      video: { contentType: 'video/webm; codecs="vp8"', width: 640, height: 360, bitrate: 100000, framerate: 10 }
    }]);
  }
  await testInfo.attach("codec-declaration-consistency.json", {
    body: JSON.stringify(output, null, 2), contentType: "application/json"
  });
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
  await expect(page.locator("body img,body script")).toHaveCount(0);
  expect(
    await page.evaluate(() => globalThis.__fixtureInjected),
  ).toBeUndefined();
  expect(output.label).toContain("Format and codec unknown");
  expect(output.label).toContain("Provider-declared link expiry has passed");
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
      page.getByText("Format and codec unknown", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Resolution unknown · HDR unknown", { exact: true }),
    ).toBeVisible();
  }
});

test("startup classification follows real engine evidence and never relabels a transport fault", async ({
  page,
}, testInfo) => {
  await page.goto("/__fixture/harness");
  const output = await page.evaluate(async () => {
    const { describeSource } = await import(
      "/__fixture/source/js/core/streams/sourceCapabilities.js"
    );
    const { classifyStartupFailure } = await import(
      "/__fixture/source/js/core/player/startupFailure.js"
    );
    const video = document.createElement("video");
    const predictionOf = (descriptor) => {
      const result = video.canPlayType(descriptor.contentType);
      if (result === "probably" || result === "maybe") return result;
      return result === "" ? "not-reported" : "unknown";
    };
    const make = (mimeType, codec) =>
      describeSource({
        url: "https://media.example.invalid/probe",
        mimeType,
        video: { codec, width: 3840, height: 2160 },
      });
    const cases = {
      matroska: make('video/x-matroska; codecs="hvc1"', "hvc1"),
      mp4H264: make('video/mp4; codecs="avc1.640028"', "avc1.640028"),
      mp4Hevc: make('video/mp4; codecs="hvc1"', "hvc1"),
      hls: describeSource({
        url: "https://media.example.invalid/master.m3u8",
        mimeType: "application/vnd.apple.mpegurl",
      }),
    };
    const report = {};
    for (const [name, descriptor] of Object.entries(cases)) {
      const nativePrediction = predictionOf(descriptor);
      report[name] = {
        contentType: descriptor.contentType,
        nativePrediction,
        stall: classifyStartupFailure({
          descriptor,
          nativePrediction,
          engine: "native-file",
          timedOut: true,
        }),
        mediaError: classifyStartupFailure({
          descriptor,
          nativePrediction,
          engine: "native-file",
          mediaErrorCode: 4,
        }),
        network: classifyStartupFailure({
          descriptor,
          nativePrediction,
          engine: "native-file",
          mediaErrorCode: 4,
          httpStatus: 403,
          timedOut: true,
        }),
      };
    }
    return report;
  });

  // Chromium does not report Matroska support, so the container claim is
  // grounded in this engine's own answer rather than a hard-coded list.
  expect(output.matroska.nativePrediction).toBe("not-reported");
  expect(output.matroska.stall.reason).toBe("unsupported-container");
  expect(output.matroska.stall.container).toBe("matroska");
  expect(output.matroska.mediaError.reason).toBe("unsupported-container");

  // A predicted-playable control source is never blamed for a stall.
  expect(output.mp4H264.nativePrediction).toBe("probably");
  expect(output.mp4H264.stall.reason).toBe("startup-stall");
  expect(output.mp4H264.stall.category).toBe("stall");

  // An adaptive manifest is never classified from a native container prediction.
  expect(output.hls.stall.reason).toBe("startup-stall");

  // Transport evidence always wins over a codec or container guess.
  for (const name of ["matroska", "mp4H264", "mp4Hevc", "hls"]) {
    expect(output[name].network.reason, name).toBe("network");
    expect(output[name].network.category, name).toBe("network");
  }

  // HEVC depends on the engine build: report the observed prediction so the
  // evidence stays falsifiable instead of assumed.
  const hevcPrediction = output.mp4Hevc.nativePrediction;
  expect(["not-reported", "unknown", "probably", "maybe"]).toContain(hevcPrediction);
  expect(
    output.mp4Hevc.stall.reason,
    `observed HEVC prediction: ${hevcPrediction}`,
  ).toBe(hevcPrediction === "not-reported" ? "unsupported-codec" : "startup-stall");
  await testInfo.attach("startup-classification.json", {
    body: JSON.stringify(output, null, 2),
    contentType: "application/json",
  });
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
  await expect(source).toContainText("Requires request headers");
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
  // The composed message must end exactly once, not with the old ".." append.
  const message = await page.locator(".player-startup-error-message").innerText();
  expect(message.endsWith("contact the add-on provider.")).toBe(true);
  expect(message).not.toContain("..");
  await overlayBack.click();
  await expect
    .poll(() => page.evaluate(() => window.__NUVIO_CURRENT_ROUTE__))
    .toBe("stream");
});

test("player startup messages agree with the reported reason at runtime", async ({ page }) => {
  await page.goto("/__fixture/harness");
  const output = await page.evaluate(async () => {
    // Importing the router first resolves the PlayerScreen import cycle.
    await import("/__fixture/source/js/ui/navigation/router.js");
    const { PlayerScreen } = await import(
      "/__fixture/source/js/ui/screens/player/playerScreen.js"
    );
    const { describeSource } = await import(
      "/__fixture/source/js/core/streams/sourceCapabilities.js"
    );
    // PlayerScreen is an object literal, so inherit from it and shadow per case.
    const screen = Object.create(PlayerScreen);
    const run = (descriptor, nativePrediction, options = {}) => {
      screen.getStartupSourceDescriptor = () => descriptor;
      screen.getStartupNativePrediction = () => nativePrediction;
      return screen.resolveStartupFailure(options);
    };
    const matroska = describeSource({
      url: "https://media.example.invalid/movie.mkv",
      mimeType: 'video/x-matroska; codecs="hvc1"',
      video: { codec: "hvc1" },
    });
    const mp4Hevc = describeSource({
      url: "https://media.example.invalid/movie.mp4",
      mimeType: 'video/mp4; codecs="hvc1"',
    });
    const mp4H264 = describeSource({
      url: "https://media.example.invalid/movie.mp4",
      mimeType: 'video/mp4; codecs="avc1.640028"',
      video: { codec: "avc1.640028" },
    });
    const headerCandidate = {
      url: "https://media.example.invalid/webdl.mkv",
      behaviorHints: {
        notWebReady: true,
        proxyHeaders: { request: { "X-Required": "fixture-only" } },
      },
    };
    const plain = (url) => ({ url });
    return {
      // A restricted source reports a header verdict even when the element
      // detail also carries an HTTP status.
      header: run(matroska, "not-reported", {
        mediaErrorCode: 4,
        detail: "HTTP 403",
        streamCandidate: headerCandidate,
        timedOut: true,
      }),
      // Without a classification the legacy ordering is unchanged.
      headerUnclassified: screen.mediaErrorMessage(4, "HTTP 403", headerCandidate, null),
      container: run(matroska, "not-reported", {
        mediaErrorCode: 4,
        streamCandidate: plain("https://media.example.invalid/movie.mkv"),
        timedOut: true,
      }),
      codec: run(mp4Hevc, "not-reported", {
        mediaErrorCode: 4,
        streamCandidate: plain("https://media.example.invalid/movie.mp4"),
      }),
      network: run(matroska, "not-reported", {
        mediaErrorCode: 4,
        detail: "HTTP 403",
        streamCandidate: plain("https://media.example.invalid/movie.mkv"),
      }),
      stall: run(mp4H264, "probably", {
        streamCandidate: plain("https://media.example.invalid/movie.mp4"),
        timedOut: true,
      }),
    };
  });

  expect(output.header.reason).toBe("header-required");
  expect(output.header.message).toContain("requires special request headers");
  expect(output.header.message).not.toContain("HTTP 403");
  expect(output.header.message.endsWith("contact the add-on provider.")).toBe(true);
  expect(output.header.message).not.toContain("..");

  // The unclassified caller keeps the previous HTTP-first behaviour.
  expect(output.headerUnclassified).toContain("403");

  expect(output.container.reason).toBe("unsupported-container");
  expect(output.container.message).toContain("(matroska)");
  expect(output.container.message.endsWith("supports it.")).toBe(true);
  expect(output.container.message).not.toContain("..");

  expect(output.codec.reason).toBe("unsupported-codec");
  expect(output.codec.message).toContain("(hvc1)");
  expect(output.codec.message).not.toContain("..");

  expect(output.network.reason).toBe("network");
  expect(output.network.message).toContain("403");
  expect(output.network.message).not.toContain("cannot play this video container");

  expect(output.stall.reason).toBe("startup-stall");
  expect(output.stall.message.endsWith(".")).toBe(true);
  expect(output.stall.message).not.toContain("..");
});

test("declared HDR metadata is labelled unverified and does not change the verdict", async ({
  page,
}) => {
  await page.goto("/__fixture/harness");
  const output = await page.evaluate(async () => {
    const { describeSource } = await import(
      "/__fixture/source/js/core/streams/sourceCapabilities.js"
    );
    const { classifyStartupFailure } = await import(
      "/__fixture/source/js/core/player/startupFailure.js"
    );
    const { normalizeSourceForDisplay, renderBrowserSourceCardContent } = await import(
      "/__fixture/source/js/ui/components/browserStreamSourceCard.js"
    );
    const make = (hdr) => {
      const source = {
        name: "Declared HDR fixture",
        url: "https://media.example.invalid/hdr.mp4",
        mimeType: 'video/mp4; codecs="hvc1.2.4.L153.B0"',
        video: { codec: "hvc1.2.4.L153.B0", width: 3840, height: 2160, ...(hdr === null ? {} : { hdr }) },
      };
      source.sourceDescriptor = describeSource(source);
      return {
        descriptor: source.sourceDescriptor,
        html: renderBrowserSourceCardContent(
          normalizeSourceForDisplay(source, {
            badgeSettings: { showAddonLogo: false },
            streamBadgesEnabled: false,
          }),
        ),
      };
    };
    const video = document.createElement("video");
    const probe = (descriptor) => {
      const answer = video.canPlayType(descriptor.contentType);
      const nativePrediction =
        answer === "probably" || answer === "maybe"
          ? answer
          : answer === ""
            ? "not-reported"
            : "unknown";
      return {
        nativePrediction,
        reason: classifyStartupFailure({
          descriptor,
          nativePrediction,
          engine: "native-file",
          mediaErrorCode: 4,
          timedOut: true,
        }).reason,
      };
    };
    const withHdr = make("dolby-vision");
    const withoutHdr = make(null);
    const hostile = make("<script>alert(1)</script>");
    return {
      declared: withHdr.descriptor,
      declaredHtml: withHdr.html,
      plain: withoutHdr.descriptor,
      hostile: hostile.descriptor,
      hostileHtml: hostile.html,
      withHdrProbe: probe(withHdr.descriptor),
      withoutHdrProbe: probe(withoutHdr.descriptor),
    };
  });

  // The declared token is shown exactly once, labelled unverified.
  expect(output.declared.video.hdr).toBe("dolby-vision");
  expect(output.declaredHtml).toContain("HDR: dolby-vision (unverified)");
  // Exactly one HDR label exists, and it carries the unverified qualifier. The
  // fixture name also contains "HDR", so a bare word match would be wrong here.
  expect(output.declaredHtml).not.toMatch(/HDR unknown/);
  const hdrLabels = output.declaredHtml.split("HDR:").slice(1);
  expect(hdrLabels).toHaveLength(1);
  expect(hdrLabels[0].slice(0, 120)).toContain("(unverified)");
  expect(output.declaredHtml).not.toMatch(/supports? HDR|HDR support|verified HDR|HDR verified|HDR ready/i);

  // HDR metadata must not change the classification path: the otherwise
  // identical descriptor without HDR must classify the same way.
  expect(output.withHdrProbe.nativePrediction).toBe(output.withoutHdrProbe.nativePrediction);
  expect(output.withHdrProbe.reason).toBe(output.withoutHdrProbe.reason);
  expect(output.declared.contentType).toBe(output.plain.contentType);

  // A hostile HDR string is rejected by token validation, not rendered.
  expect(output.hostile.video.hdr).toBeNull();
  expect(output.hostileHtml).toContain("HDR unknown");
  expect(output.hostileHtml).not.toMatch(/<script|alert\(1\)/);
});
