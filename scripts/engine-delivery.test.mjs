import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDelivery, decodedAndSeeked, matrixExitCode, withDeadline } from "./engine-delivery.mjs";

test("full-window 60fps math rejects late bursts and presentation gaps", () => {
  const before = { wall: 0, time: 0, quality: { total: 0, dropped: 0 } };
  const after = { wall: 8500, time: 8.5, quality: { total: 510, dropped: 0 } };
  const frames = Array.from({ length: 510 }, (_, i) => ({ wall: i * 1000 / 60, mediaTime: i / 60, presentedFrames: i, width: 3840, height: 2160 }));
  assert.equal(summarizeDelivery(before, after, frames, 60, []).sustained60Observed, true);
  const burst = frames.slice(-120);
  assert.equal(summarizeDelivery(before, after, burst, 60, []).sustained60Observed, false);
  assert.equal(summarizeDelivery(before, after, frames.filter(f => f.wall < 3000 || f.wall > 3250), 60, []).sustained60Observed, false);
  assert.equal(summarizeDelivery(before, { ...after, quality: { total: 510, dropped: 40 } }, frames, 60, []).sustained60Observed, false);
  assert.equal(summarizeDelivery(before, after, frames.map(f => ({ ...f, mediaTime: 0 })), 60, []).sustained60Observed, false);
  assert.equal(summarizeDelivery(before, after, [], 60, []).sustained60Observed, false);
});

test("post-seek errors and invalid browser duration cannot certify decode", () => {
  const good = { metadata: { width: 3840, height: 2160, duration: 2 }, playback: { advancedSeconds: 0.7, error: null }, seek: { target: 0.5, observed: 0.5, progressedTo: 1, error: null } };
  assert.equal(decodedAndSeeked(good), true);
  assert.equal(decodedAndSeeked({ ...good, seek: { ...good.seek, error: 3 } }), false);
  assert.equal(decodedAndSeeked({ ...good, metadata: { ...good.metadata, duration: Infinity } }), false);
  assert.equal(decodedAndSeeked({ ...good, seek: { ...good.seek, frameCallbackAvailable: true, postSeekFrame: { firstMediaTime: 8.45, frames: 2, mediaTime: 8.5, width: 3840, height: 2160 } } }), false);
  assert.equal(decodedAndSeeked({ ...good, seek: { ...good.seek, frameCallbackAvailable: true, postSeekFrame: { firstMediaTime: 0.5, frames: 2, mediaTime: 0.55, width: 3840, height: 2160 } } }), true);
});

test("matrix exit distinguishes positive-probe failure and performance gap from unsupported observation", () => {
  const entry = { id: "h264-2160", prediction: { native: "probably" }, result: "DECODE_NOT_ESTABLISHED" };
  const receipt = cases => ({ requiredCaseIds: cases.map(entry => entry.id), engines: [{ status: "LAUNCHED", cases }], credentialLeakObserved: false });
  assert.equal(matrixExitCode(receipt([entry])), 2);
  assert.equal(matrixExitCode(receipt([{ ...entry, prediction: { native: "not-reported" } } ])), 0);
  assert.equal(matrixExitCode(receipt([{ ...entry, id: "h264-2160-60", result: "DECODE_AND_SEEK_OBSERVED", delivery: { sustained60Observed: false } }])), 3);
  assert.equal(matrixExitCode({ ...receipt([entry]), credentialLeakObserved: true }), 2);
  assert.equal(matrixExitCode(receipt([])), 4);
  assert.equal(matrixExitCode({ requiredCaseIds: [entry.id], engines: [] }), 4);
  assert.equal(matrixExitCode({ ...receipt([]), engines: [{ status: "ENGINE_LAUNCH_FAILED", cases: [] }] }), 2);
  assert.equal(matrixExitCode({ ...receipt([entry]), requiredCaseIds: [entry.id, "h264-2160-60"] }), 4);
  assert.equal(matrixExitCode(receipt([{ ...entry, result: "NOT_MEASURED" }])), 4);
});

test("deadline rejects and invokes owned cleanup, while success clears timer", async () => {
  let cleaned = false;
  await assert.rejects(withDeadline(new Promise(() => {}), 5, () => { cleaned = true; }), /deadline/);
  await Promise.resolve();
  assert.equal(cleaned, true);
  assert.equal(await withDeadline(Promise.resolve("done"), 100, () => { throw new Error("must not run"); }), "done");
});
