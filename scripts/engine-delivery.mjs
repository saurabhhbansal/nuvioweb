// Pure observation math, shared with the browser. A late short burst must not
// certify the entire wall-clock measurement window as sustained60fps.
export function summarizeDelivery(before, after, callbacks, targetFps, windows) {
  const elapsedSeconds = (after.wall - before.wall) / 1000;
  const first = callbacks[0], last = callbacks.at(-1);
  const callbackFps = elapsedSeconds > 0 ? callbacks.length / elapsedSeconds : null;
  const presentedFps = first && last && elapsedSeconds > 0 ? (last.presentedFrames - first.presentedFrames) / elapsedSeconds : null;
  const droppedFrames = before.quality && after.quality ? after.quality.dropped - before.quality.dropped : null;
  const totalFrames = before.quality && after.quality ? after.quality.total - before.quality.total : null;
  const gaps = callbacks.map((frame, i) => frame.wall - (i ? callbacks[i - 1].wall : before.wall));
  gaps.push(after.wall - (last?.wall ?? before.wall));
  const maximumCallbackGapMs = Math.max(...gaps);
  const advancingFrames = callbacks.every((frame, i) => !i || frame.mediaTime > callbacks[i - 1].mediaTime);
  const sustained60Observed = targetFps === 60 && elapsedSeconds >= 8 && callbackFps >= 58.5 && presentedFps >= 58.5 && maximumCallbackGapMs <= 100 && advancingFrames && (after.time - before.time) / elapsedSeconds >= 0.98 && totalFrames > 0 && droppedFrames >= 0 && droppedFrames / totalFrames <= 0.01;
  return { elapsedSeconds, callbacks: callbacks.length, callbackFps, presentedFps, totalFrames, droppedFrames, maximumCallbackGapMs, advancingFrames, firstFrame: first || null, lastFrame: last || null, windows, sustained60Observed };
}

export async function withDeadline(operation, milliseconds, onTimeout = () => {}) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => {
        Promise.resolve().then(onTimeout).catch(() => {});
        reject(new Error("engine-operation-deadline"));
      }, milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export function decodedAndSeeked(observed) {
  return observed.metadata?.width === 3840 && observed.metadata?.height === 2160 && Number.isFinite(observed.metadata?.duration) && observed.metadata.duration > 1 && observed.playback?.advancedSeconds > 0.1 && !observed.playback?.error && Math.abs(observed.seek?.observed - observed.seek?.target) < 0.15 && observed.seek?.progressedTo > observed.seek?.target + 0.1 && !observed.seek?.error && (!observed.seek?.frameCallbackAvailable || (observed.seek.postSeekFrame?.width === 3840 && observed.seek.postSeekFrame?.height === 2160 && observed.seek.postSeekFrame?.mediaTime >= observed.seek.target - 0.15)) && !observed.failure;
}

export function matrixExitCode(receipt) {
  if (receipt.credentialLeakObserved || receipt.engines.some(engine => engine.status !== "LAUNCHED" || engine.cases.some(entry => entry.prediction?.native !== "not-reported" && entry.result !== "DECODE_AND_SEEK_OBSERVED"))) return 2;
  // 3 means completed measurement with a failed performance criterion, not pass.
  if (receipt.engines.some(engine => engine.cases.some(entry => entry.id.endsWith("-60") && !entry.delivery?.sustained60Observed))) return 3;
  return 0;
}
