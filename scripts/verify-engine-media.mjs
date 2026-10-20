import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { chromium, firefox, webkit } from "@playwright/test";
import { CASES, loadFixtureInventory, parseRange, contentTypeFor } from "./engine-media-contract.mjs";
import { engineLaunchOptions } from "./engine-launch-options.mjs";
import { decodedAndSeeked, matrixExitCode, withDeadline } from "./engine-delivery.mjs";
import { measuredCodecString } from "./engine-codec-string.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const directory = resolve(option("--media", ".tmp/issue10/media"));
const receiptPath = resolve(option("--out", ".tmp/issue10/engine-receipt.json"));
const engines = option("--engines", "chromium,webkit,firefox").split(",");
if (engines.some(x => !["chromium", "webkit", "firefox"].includes(x))) throw new Error("Unknown engine");
const { manifest, files } = await loadFixtureInventory(directory);
const requests = [];
const source = await readFile(new URL("../app/alpha/js/core/streams/sourceCapabilities.js", import.meta.url));
const deliverySource = await readFile(new URL("./engine-delivery.mjs", import.meta.url));
const pageBody = '<!doctype html><title>Original engine media fixture</title><video muted playsinline></video>';
function serve(request, response) {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405).end(); return; }
  if (path === "/") { response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" }).end(pageBody); return; }
  if (path === "/delivery.js") { response.writeHead(200, { "Content-Type": "application/javascript" }).end(deliverySource); return; }
  if (path === "/sourceCapabilities.js") { response.writeHead(200, { "Content-Type": "application/javascript" }).end(source); return; }
  if (["/forbidden", "/expired"].includes(path)) { const status = path === "/forbidden" ? 403 : 410; response.writeHead(status, { "Access-Control-Allow-Origin": "*" }).end(); requests.push({ path, status }); return; }
  const prefix = path.startsWith("/denied/") ? "/denied/" : "/media/";
  const entry = files.get(path.slice(prefix.length));
  if (!path.startsWith(prefix) || !entry) { response.writeHead(404).end(); return; }
  const range = parseRange(request.headers.range, entry.bytes.length);
  if (!range) { response.writeHead(416, { "Content-Range": `bytes */${entry.bytes.length}` }).end(); return; }
  const headers = { "Content-Type": contentTypeFor(entry.file), "Cache-Control": "no-store", "Accept-Ranges": "bytes", "Content-Length": range.end - range.start + 1 };
  if (prefix === "/media/") headers["Access-Control-Allow-Origin"] = "*";
  if (range.status === 206) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${entry.bytes.length}`;
  response.writeHead(range.status, headers).end(request.method === "HEAD" ? undefined : entry.bytes.subarray(range.start, range.end + 1));
  if (requests.length < 2000) requests.push({ path, status: range.status, range: range.status === 206, authorizationPresent: Boolean(request.headers.authorization), cookiePresent: Boolean(request.headers.cookie) });
}
const app = http.createServer(serve), provider = http.createServer(serve);
await new Promise(r => app.listen(0, "127.0.0.1", r));
await new Promise(r => provider.listen(0, "127.0.0.1", r));
const appOrigin = `http://127.0.0.1:${app.address().port}`;
const providerOrigin = `http://127.0.0.1:${provider.address().port}`;
const receipt = { schemaVersion: 1, requiredCaseIds: CASES.map(entry => entry.id), matrixScope: "Full fixed nine-case matrix; missing/unavailable generation remains an explicit unmeasured host gap", observedAt: new Date().toISOString(), sourceRevision: process.env.NUVIO_SOURCE_REVISION || null, verifierSha256: createHash("sha256").update(await readFile(new URL(import.meta.url))).digest("hex"), fixtureInventorySha256: createHash("sha256").update(await readFile(resolve(directory, "provenance.json"))).digest("hex"), sourceCapabilitiesSha256: createHash("sha256").update(source).digest("hex"), launchHelperSha256: createHash("sha256").update(await readFile(new URL("./engine-launch-options.mjs", import.meta.url))).digest("hex"), deliveryHelperSha256: createHash("sha256").update(deliverySource).digest("hex"), codecParserSha256: createHash("sha256").update(await readFile(new URL("./engine-codec-string.mjs", import.meta.url))).digest("hex"), layer: "actual headless engine native playback + real API predictions; not bundled player journey or HDR display certification", environment: { node: process.version, platform: process.platform, architecture: process.arch }, mappings: { chromium: ["Chrome", "Edge", "Brave", "Opera"], webkit: ["Safari"], firefox: ["Firefox"] }, engines: [], limits: ["Mappings are owner-requested engine-family mappings, not duplicate branded/device runs", "Software/headless Linux pipeline: successful HDR-encoded decode does not prove HDR luminance, gamut, tone mapping or display output", "An unsuccessful codec decode is a limitation of this tested engine build/host combination unless isolated otherwise; never proof of all versions/platforms", "No audio, DRM, billing, account, production, preview or real-provider operation"] };
try {
  for (const name of engines) {
    const result = { engine: name, status: "STARTING", cases: [] };
    receipt.engines.push(result);
    let browser;
    try {
      const executablePath = option(`--${name}-executable`, undefined);
      browser = await ({ chromium, firefox, webkit })[name].launch({ headless: true, timeout: 30000, ...engineLaunchOptions(name), ...(executablePath ? { executablePath } : {}) });
      result.version = browser.version(); result.status = "LAUNCHED";
      const context = await browser.newContext({ ignoreHTTPSErrors: false });
      await context.route("**/*", route => [appOrigin, providerOrigin].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort("blockedbyclient"));
      const page = await context.newPage();
      await page.goto(appOrigin);
      result.environment = await page.evaluate(() => ({ userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemoryGiB: navigator.deviceMemory || null, hdrScreenReported: matchMedia("(dynamic-range: high)").matches, colorGamutP3: matchMedia("(color-gamut: p3)").matches, colorGamut2020: matchMedia("(color-gamut: rec2020)").matches, requestVideoFrameCallback: typeof HTMLVideoElement.prototype.requestVideoFrameCallback === "function", mediaCapabilities: typeof navigator.mediaCapabilities?.decodingInfo === "function" }));
      for (const entry of manifest.cases.filter(x => x.status === "GENERATED_VERIFIED")) {
        const start = requests.length;
        const codec = measuredCodecString(entry, files.get(entry.file).bytes);
        const predictionType = `video/${entry.file.endsWith(".webm") ? "webm" : "mp4"}; codecs="${codec}"`;
        const observed = await withDeadline(page.evaluate(async ({ entry, providerOrigin, predictionType, codec }) => {
          const { describeSource, probeSourceCapabilities } = await import("/sourceCapabilities.js");
          const { summarizeDelivery } = await import("/delivery.js");
          const video = document.querySelector("video");
          video.pause(); video.removeAttribute("src"); video.load();
          video.crossOrigin = "anonymous"; video.muted = true;
          const descriptor = describeSource({ url: `${providerOrigin}/media/${entry.file}`, mimeType: predictionType, video: { codec, width: entry.observed.width, height: entry.observed.height, bitrate: entry.observed.bitrate, framerate: entry.observed.fps } });
          const prediction = await probeSourceCapabilities(descriptor, { videoElement: video, mediaCapabilities: navigator.mediaCapabilities });
          const out = { prediction, metadata: null, playback: null, seek: null, delivery: null, mediaErrorCode: null };
          const boundedEvent = (element, name, ms) => new Promise((resolve, reject) => {
            const done = () => { cleanup(); resolve(); }, fail = () => { cleanup(); reject(new Error(`media-error-${element.error?.code || 0}`)); };
            const timer = setTimeout(() => { cleanup(); reject(new Error(`${name}-deadline`)); }, ms);
            function cleanup() { clearTimeout(timer); element.removeEventListener(name, done); element.removeEventListener("error", fail); }
            element.addEventListener(name, done); element.addEventListener("error", fail);
          });
          try {
            const loaded = boundedEvent(video, "loadeddata", 15000);
            video.src = `${providerOrigin}/media/${entry.file}`;
            await loaded;
            out.metadata = { width: video.videoWidth, height: video.videoHeight, duration: video.duration, currentSrcPath: new URL(video.currentSrc).pathname };
            await Promise.race([video.play(), new Promise((_, reject) => setTimeout(() => reject(new Error("play-deadline")), 10000))]);
            const quality = () => { const q = video.getVideoPlaybackQuality?.(); return q ? { total: q.totalVideoFrames, dropped: q.droppedVideoFrames, corrupted: q.corruptedVideoFrames ?? null } : null; };
            const before = { wall: performance.now(), time: video.currentTime, quality: quality() };
            const windows = [], callbacks = [];
            let active = true, callbackId;
            const frame = (now, metadata) => { if (!active) return; if (callbacks.length < 1000) callbacks.push({ wall: now, mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames, width: metadata.width, height: metadata.height }); callbackId = video.requestVideoFrameCallback(frame); };
            if (video.requestVideoFrameCallback) callbackId = video.requestVideoFrameCallback(frame);
            const targetMs = entry.target.fps === 60 ? 8500 : 700;
            // Deliberate wall-clock measurement, not an arbitrary test workaround.
            while (performance.now() - before.wall < targetMs && !video.ended && !video.error) {
              await new Promise(r => setTimeout(r, 500));
              windows.push({ wallMs: performance.now() - before.wall, mediaTime: video.currentTime, quality: quality() });
            }
            active = false;
            if (callbackId !== undefined) video.cancelVideoFrameCallback?.(callbackId);
            const after = { wall: performance.now(), time: video.currentTime, quality: quality() };
            const elapsedSeconds = (after.wall - before.wall) / 1000;
            out.playback = { advancedSeconds: after.time - before.time, elapsedSeconds, ended: video.ended, error: video.error?.code || null };
            out.delivery = summarizeDelivery(before, after, callbacks, entry.target.fps, windows);
            video.pause();
            const seeked = boundedEvent(video, "seeked", 10000);
            const target = Math.min(0.75, video.duration / 2);
            video.currentTime = target;
            await seeked;
            const at = video.currentTime;
            // Register only after seek completion; a queued pre-seek frame must
            // not certify the new timeline. Accept only a near-target frame.
            const frameAfterSeek = video.requestVideoFrameCallback ? new Promise(resolve => {
              let id, firstMediaTime = null, firstPresentedFrames = null;
              const timer = setTimeout(() => { video.cancelVideoFrameCallback(id); resolve(null); }, 10000);
              const onFrame = (_, metadata) => {
                if (firstMediaTime === null) {
                  if (metadata.mediaTime >= target - 0.15 && metadata.mediaTime <= target + 0.5) {
                    firstMediaTime = metadata.mediaTime; firstPresentedFrames = metadata.presentedFrames;
                  }
                  id = video.requestVideoFrameCallback(onFrame); return;
                }
                if (metadata.mediaTime <= firstMediaTime + 0.005 || metadata.mediaTime > Math.min(video.duration, target + 2.5) || metadata.presentedFrames <= firstPresentedFrames) {
                  id = video.requestVideoFrameCallback(onFrame); return;
                }
                clearTimeout(timer);
                resolve({ firstMediaTime, firstPresentedFrames, presentedFrames: metadata.presentedFrames, frames: 2, mediaTime: metadata.mediaTime, width: metadata.width, height: metadata.height });
              };
              id = video.requestVideoFrameCallback(onFrame);
            }) : Promise.resolve(null);
            await Promise.race([video.play(), new Promise((_, reject) => setTimeout(() => reject(new Error("resume-deadline")), 10000))]);
            const resumeStarted = performance.now();
            while (video.currentTime <= target + 0.1 && !video.error && performance.now() - resumeStarted < 5000) {
              await new Promise(r => setTimeout(r, 50));
            }
            const postSeekFrame = await frameAfterSeek;
            out.seek = { target, observed: at, progressedTo: video.currentTime, resumeElapsedMs: performance.now() - resumeStarted, frameCallbackAvailable: typeof video.requestVideoFrameCallback === "function", postSeekFrame, error: video.error?.code || null };
          } catch (error) { out.failure = error.message; out.mediaErrorCode = video.error?.code || null; }
          finally { video.pause(); video.removeAttribute("src"); video.load(); }
          return out;
        }, { entry, providerOrigin, predictionType, codec }), 70000, () => page.close());
        const decoded = decodedAndSeeked(observed);
        result.cases.push({ id: entry.id, fixtureSha256: manifest.files.find(x => x.file === entry.file).sha256, input: entry.observed, predictionType, predictionScope: entry.observed.codec === "vp9" ? "WebM VP9 family alias; profile recorded separately, no invented level" : "Measured RFC6381 initialization bytes", hdr: entry.hdr, ...observed, result: decoded ? "DECODE_AND_SEEK_OBSERVED" : "DECODE_NOT_ESTABLISHED", limitation: decoded ? null : "HOST_ENVIRONMENT", limitationDetail: decoded ? null : "Tested engine-build/host media stack; inherent cross-platform engine limitation not established", requests: requests.slice(start) });
        console.log(JSON.stringify({ engine: name, case: entry.id, result: result.cases.at(-1).result, prediction: observed.prediction, delivery: observed.delivery && { callbackFps: observed.delivery.callbackFps, presentedFps: observed.delivery.presentedFps, sustained60Observed: observed.delivery.sustained60Observed }, failure: observed.failure }));
      }
      for (const required of CASES) {
        if (!result.cases.some(entry => entry.id === required.id)) {
          const input = manifest.cases.find(entry => entry.id === required.id);
          result.cases.push({ id: required.id, result: "NOT_MEASURED", limitation: "HOST_ENVIRONMENT", limitationDetail: input?.status || "Fixture absent from inventory", inputFailure: input?.message || null });
        }
      }
      result.transport = await withDeadline(page.evaluate(async ({ providerOrigin, file }) => {
        const out = {};
        for (const [id, path] of [["corsAllowed", `/media/${file}`], ["corsDenied", `/denied/${file}`], ["forbidden403", "/forbidden"], ["expired410", "/expired"]]) {
          try { const response = await fetch(providerOrigin + path, { signal: AbortSignal.timeout(5000) }); out[id] = { status: response.status, ok: response.ok }; await response.body?.cancel(); }
          catch { out[id] = { rejected: true }; }
        }
        return out;
      }, { providerOrigin, file: manifest.files[0]?.file }), 25000, () => page.close());
      await context.close();
    } catch (error) {
      result.status = "UNAVAILABLE_OR_DRIVER_FAILURE";
      result.limitation = "HOST_ENVIRONMENT";
      result.failure = error.message.replaceAll(process.env.HOME || "<none>", "<home>").slice(0, 5000);
      console.log(JSON.stringify({ engine: name, status: result.status, failure: result.failure }));
    } finally { if (browser) await browser.close(); }
  }
} finally {
  await Promise.all([new Promise(r => app.close(r)), new Promise(r => provider.close(r))]);
  receipt.credentialLeakObserved = requests.some(r => r.authorizationPresent || r.cookiePresent);
  await mkdir(resolve(receiptPath, ".."), { recursive: true });
  receipt.exitSemantics = { 0: "Completed; all positively predicted decode/seek and sustained60 criteria passed; negative predictions remain explicit unsupported rows", 2: "Engine/driver or positively predicted decode/seek failure, or credential leak", 3: "Measurement completed but sustained60 criterion not observed", 4: "Required fixture rows are missing/unmeasured; matrix incomplete" };
  receipt.commandExitCode = matrixExitCode(receipt);
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
}
process.exitCode = receipt.commandExitCode;
