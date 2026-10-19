import { test, expect } from "@playwright/test";

// Engine-agnostic invariants for the startup-failure classifier.
//
// This spec never asserts what a particular engine can decode. It reads the
// engine's own `canPlayType` answer and requires the classifier to agree with
// it, so the same file is honest on Chromium and on WebKit. No media is
// fetched or decoded, so it does not depend on a codec build.

const cases = [
  {
    name: "matroska",
    descriptor: {
      url: "https://media.example.invalid/movie.mkv",
      mimeType: 'video/x-matroska; codecs="hvc1"',
      video: { codec: "hvc1", width: 3840, height: 2160 },
    },
    unsupportedReason: "unsupported-container",
    label: "matroska",
  },
  {
    name: "mp4-hevc",
    descriptor: {
      url: "https://media.example.invalid/movie.mp4",
      mimeType: 'video/mp4; codecs="hvc1"',
    },
    unsupportedReason: "unsupported-codec",
    label: "hvc1",
  },
  {
    name: "mp4-h264",
    descriptor: {
      url: "https://media.example.invalid/movie.mp4",
      mimeType: 'video/mp4; codecs="avc1.640028"',
      video: { codec: "avc1.640028", width: 1920, height: 1080 },
    },
    unsupportedReason: "unsupported-codec",
    label: "avc1.640028",
  },
  {
    name: "hls",
    descriptor: {
      url: "https://media.example.invalid/master.m3u8",
      mimeType: "application/vnd.apple.mpegurl",
    },
    unsupportedReason: null,
    label: "application/vnd.apple.mpegurl",
  },
];

test("the classifier agrees with this engine's own capability answer", async ({ page }, testInfo) => {
  await page.goto("/__fixture/harness");
  const report = await page.evaluate(async (cases) => {
    const { describeSource } = await import(
      "/__fixture/source/js/core/streams/sourceCapabilities.js"
    );
    const { classifyStartupFailure } = await import(
      "/__fixture/source/js/core/player/startupFailure.js"
    );
    const video = document.createElement("video");
    const predictionOf = (descriptor) => {
      const answer = video.canPlayType(descriptor.contentType);
      if (answer === "probably" || answer === "maybe") return answer;
      return answer === "" ? "not-reported" : "unknown";
    };
    const out = { userAgent: navigator.userAgent };
    for (const entry of cases) {
      const descriptor = describeSource(entry.descriptor);
      const nativePrediction = predictionOf(descriptor);
      out[entry.name] = {
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
        header: classifyStartupFailure({
          descriptor,
          nativePrediction,
          engine: "native-file",
          mediaErrorCode: 4,
          httpStatus: 403,
          headerRequired: true,
          timedOut: true,
        }),
        adaptive: classifyStartupFailure({
          descriptor,
          nativePrediction,
          engine: "hls.js",
          mediaErrorCode: 4,
          timedOut: true,
        }),
      };
    }
    return out;
  }, cases);

  // Record what this engine actually answered, so the CI log carries the
  // engine-family observations that back the classification.
  console.log(
    `ENGINE_PREDICTIONS ${JSON.stringify(
      Object.fromEntries(
        cases.map((entry) => [entry.name, report[entry.name].nativePrediction]),
      ),
    )}`,
  );

  for (const entry of cases) {
    const observed = report[entry.name];
    // A transport fault and a restricted request are decided before any format
    // question, whatever this engine can decode.
    expect(observed.network.reason, `${entry.name}: http status`).toBe("network");
    expect(observed.header.reason, `${entry.name}: header required`).toBe("header-required");

    if (observed.nativePrediction === "not-reported" && entry.unsupportedReason) {
      // The engine affirmatively declined the declared type, so the stall is
      // classified as an unsupported container or codec for that declaration.
      expect(observed.stall.reason, `${entry.name}: stall path`).toBe(entry.unsupportedReason);
      expect(observed.mediaError.reason, `${entry.name}: media-error path`).toBe(
        entry.unsupportedReason,
      );
    } else {
      // A predicted-playable source is never blamed for a stall, and an adaptive
      // engine is never second-guessed from a native prediction.
      expect(observed.stall.category, `${entry.name}: predicted playable`).not.toBe("unsupported");
      expect(observed.mediaError.category, `${entry.name}: predicted playable`).not.toBe(
        "unsupported",
      );
    }

    // An adaptive library is never classified from a native container prediction.
    expect(observed.adaptive.category, `${entry.name}: adaptive engine`).not.toBe("unsupported");
  }

  await testInfo.attach("engine-capabilities.json", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
});

test("the startup overlay shows engine-honest guidance in this engine", async ({ page }) => {
  await page.goto("/__fixture/harness");
  const output = await page.evaluate(async () => {
    // The router owns the PlayerScreen import cycle.
    await import("/__fixture/source/js/ui/navigation/router.js");
    const { PlayerScreen } = await import(
      "/__fixture/source/js/ui/screens/player/playerScreen.js"
    );
    const { describeSource } = await import(
      "/__fixture/source/js/core/streams/sourceCapabilities.js"
    );
    const screen = Object.create(PlayerScreen);
    const video = document.createElement("video");
    const run = (descriptor, options = {}) => {
      screen.getStartupSourceDescriptor = () => descriptor;
      screen.getStartupNativePrediction = () => {
        const answer = video.canPlayType(descriptor.contentType);
        return answer === "probably" || answer === "maybe"
          ? answer
          : answer === ""
            ? "not-reported"
            : "unknown";
      };
      return screen.resolveStartupFailure(options);
    };
    const matroska = describeSource({
      url: "https://media.example.invalid/movie.mkv",
      mimeType: 'video/x-matroska; codecs="hvc1"',
      video: { codec: "hvc1" },
    });
    const headerCandidate = {
      url: "https://media.example.invalid/webdl.mkv",
      behaviorHints: {
        notWebReady: true,
        proxyHeaders: { request: { "X-Required": "fixture-only" } },
      },
    };
    return {
      header: run(matroska, {
        mediaErrorCode: 4,
        detail: "HTTP 403",
        streamCandidate: headerCandidate,
        timedOut: true,
      }),
      container: run(matroska, {
        mediaErrorCode: 4,
        streamCandidate: { url: "https://media.example.invalid/movie.mkv" },
        timedOut: true,
      }),
    };
  });

  expect(output.header.reason).toBe("header-required");
  expect(output.header.message).toContain("requires special request headers");
  expect(output.header.message).not.toContain("HTTP 403");
  expect(output.header.message.endsWith("contact the add-on provider.")).toBe(true);
  expect(output.header.message).not.toContain("..");

  // The container message only appears when this engine actually declined the
  // declaration; otherwise the honest generic message is shown instead.
  if (output.container.classification.category === "unsupported") {
    expect(output.container.message).toContain("(matroska)");
  } else {
    expect(output.container.message).not.toContain("(matroska)");
  }
  expect(output.container.message.endsWith(".")).toBe(true);
  expect(output.container.message).not.toContain("..");
});
