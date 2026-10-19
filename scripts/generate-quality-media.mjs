import { packageQualityFixture } from "./quality-fixture-packaging.mjs";
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Original canvas-only test media. No provider content or production processing.
const root = new URL("../tests/fixtures/media/quality/", import.meta.url);
const sourceHash = createHash("sha256")
  .update(await readFile(new URL(import.meta.url)))
  .digest("hex");
const packagerHash = createHash("sha256")
  .update(
    await readFile(new URL("./quality-fixture-packaging.mjs", import.meta.url)),
  )
  .digest("hex");
const browser = await chromium.launch();
const outputs = [];
try {
  const context = await browser.newContext();
  await context.route("**/*", (route) => route.abort("blockedbyclient"));
  const page = await context.newPage();
  for (const [name, width, height, requestedType] of [
    ["original-1080p.mp4", 1920, 1080, "video/mp4;codecs=avc1.420028"],
    ["original-2160p.mp4", 3840, 2160, "video/mp4;codecs=avc1.640033"],
  ]) {
    const result = await page.evaluate(
      async ({ width, height, requestedType }) => {
        if (!MediaRecorder.isTypeSupported(requestedType))
          throw new Error(
            `Recorder does not report support for ${requestedType}`,
          );
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const drawing = canvas.getContext("2d");
        const paint = (frame) => {
          drawing.fillStyle = "#142033";
          drawing.fillRect(0, 0, width, height);
          drawing.fillStyle = "#81d4fa";
          drawing.fillRect(
            width * (0.1 + frame / 50),
            height / 2,
            width / 12,
            height / 8,
          );
          drawing.fillStyle = "white";
          drawing.font = `${Math.round(height / 15)}px sans-serif`;
          drawing.fillText(
            `Original ${width} × ${height} fixture`,
            width / 12,
            height / 5,
          );
          drawing.fillText(`Frame ${frame}`, width / 12, height / 3);
        };
        paint(0);
        const stream = canvas.captureStream(5);
        const recorder = new MediaRecorder(stream, {
          mimeType: requestedType,
          videoBitsPerSecond: 1000000,
        });
        const chunks = [];
        let timeout;
        try {
          const stopped = new Promise((resolve, reject) => {
            timeout = setTimeout(
              () =>
                reject(
                  new Error("Bounded fixture recording exceeded15seconds"),
                ),
              15000,
            );
            recorder.onerror = () =>
              reject(new Error("Fixture encoder failed"));
            recorder.ondataavailable = (event) => {
              if (event.data.size) chunks.push(event.data);
            };
            recorder.onstop = resolve;
          });
          recorder.start(500);
          for (let frame = 1; frame <= 20; frame++) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            paint(frame);
          }
          recorder.stop();
          await stopped;
        } finally {
          clearTimeout(timeout);
          if (recorder.state !== "inactive") recorder.stop();
          stream.getTracks().forEach((track) => track.stop());
        }
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (blob.size > 16 * 1024 * 1024)
          throw new Error("Fixture exceeds16MiB cap");
        const video = document.createElement("video");
        video.muted = true;
        const url = URL.createObjectURL(blob);
        try {
          const loaded = new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error("Fixture decode metadata timed out")),
              10000,
            );
            video.onloadeddata = () => {
              clearTimeout(timer);
              resolve();
            };
            video.onerror = () => {
              clearTimeout(timer);
              reject(
                new Error(
                  `Fixture decode error${video.error?.code || "unknown"}`,
                ),
              );
            };
          });
          video.src = url;
          await loaded;
          await video.play();
          await new Promise((resolve) => setTimeout(resolve, 250));
          const observed = {
            width: video.videoWidth,
            height: video.videoHeight,
            currentTime: video.currentTime,
            duration: Number.isFinite(video.duration) ? video.duration : null,
            error: video.error?.code || null,
          };
          if (
            observed.width !== width ||
            observed.height !== height ||
            observed.currentTime <= 0 ||
            observed.error ||
            !Number.isFinite(observed.duration) ||
            observed.duration < 1.5
          )
            throw new Error(
              "Original-dimension fixture playback verification failed",
            );
          return {
            bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
            observed,
            recordedType: recorder.mimeType,
          };
        } finally {
          video.pause();
          video.removeAttribute("src");
          video.load();
          URL.revokeObjectURL(url);
        }
      },
      { width, height, requestedType },
    );
    const bytes = Buffer.from(result.bytes);
    outputs.push({
      name,
      bytes,
      provenance: {
        file: name,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        requestedType,
        recordedType: result.recordedType,
        requestedSize: [width, height],
        requestedFrameRate: 5,
        requestedBitrate: 1000000,
        observed: result.observed,
      },
    });
  }
  await mkdir(root, { recursive: true });
  for (const output of outputs) {
    await writeFile(new URL(output.name, root), output.bytes);
    const packaged = packageQualityFixture(
      output.bytes,
      output.provenance.observed,
    );
    const directory = output.name.includes("2160") ? "2160p" : "1080p";
    await mkdir(new URL(`${directory}/`, root), { recursive: true });
    output.provenance.codec = packaged.codec;
    output.provenance.packaged = [];
    for (const [name, bytes] of packaged.files) {
      await writeFile(new URL(`${directory}/${name}`, root), bytes);
      output.provenance.packaged.push({
        file: `${directory}/${name}`,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
  await writeFile(
    new URL("provenance.json", root),
    JSON.stringify(
      {
        license: "CC0-1.0",
        source: "scripts/generate-quality-media.mjs",
        sourceSha256: sourceHash,
        packagingSource: "scripts/quality-fixture-packaging.mjs",
        packagingSourceSha256: packagerHash,
        platform: process.platform,
        architecture: process.arch,
        generator: `Playwright Chromium ${browser.version()}`,
        content:
          "Original canvas geometry/text, video-only; no downloaded content, upscaling, audio or HDR",
        limits:
          "Short5fps synthetic recordings; not4K60/HDR/device certification. Regeneration bytes/timing vary. Native local blob observations are distinct from bundled/adaptive journey tests.",
        files: outputs.map((output) => output.provenance),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(outputs.map((output) => output.provenance)));
} finally {
  await browser.close();
}
