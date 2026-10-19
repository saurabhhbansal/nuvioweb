import test from "node:test";
import assert from "node:assert/strict";

import {
  RECOVERY_ERROR,
  RECOVERY_LIMITS,
  RECOVERY_RESOURCE,
  classifyRecoveryResource,
  createRecoverySession,
  remainingBudget,
  resourceLimit
} from "./recoveryHlsLoader.js";

test("limits match the plan", () => {
  assert.equal(RECOVERY_LIMITS.maxConcurrentRequests, 4);
  assert.equal(RECOVERY_LIMITS.playlistBytes, 256 * 1024);
  assert.equal(RECOVERY_LIMITS.initBytes, 1024 * 1024);
  assert.equal(RECOVERY_LIMITS.fragmentBytes, 8 * 1024 * 1024);
  assert.equal(RECOVERY_LIMITS.sessionBytes, 64 * 1024 * 1024);
  assert.equal(RECOVERY_LIMITS.manifestDeadlineMs, 5000);
  assert.equal(RECOVERY_LIMITS.fragmentDeadlineMs, 10000);
  assert.equal(RECOVERY_LIMITS.maxDiagnosticText, 256);
  assert.deepEqual(Object.keys(RECOVERY_RESOURCE).sort(), ["FRAGMENT", "INIT", "PLAYLIST"]);
});

test("classification follows the pinned hls.js context shapes", () => {
  // Playlists are declared by context type.
  for (const type of ["manifest", "level", "audioTrack", "subtitleTrack", "vtt"]) {
    assert.equal(classifyRecoveryResource({ type }), RECOVERY_RESOURCE.PLAYLIST, type);
  }
  // Pinned 1.5.20 init segments: frag.sn === "initSegment" or an object-valued
  // frag.initSegment. An extension alone must never decide this.
  assert.equal(classifyRecoveryResource({ frag: { sn: "initSegment" } }), RECOVERY_RESOURCE.INIT);
  assert.equal(
    classifyRecoveryResource({ frag: { sn: 4, initSegment: { url: "init.mp4" } } }),
    RECOVERY_RESOURCE.INIT
  );
  assert.equal(classifyRecoveryResource({ frag: { sn: 4 } }), RECOVERY_RESOURCE.FRAGMENT);
  assert.equal(
    classifyRecoveryResource({ url: "https://fixture.invalid/init.mp4", frag: { sn: 0 } }),
    RECOVERY_RESOURCE.FRAGMENT
  );
  // Extension-only contexts.
  assert.equal(
    classifyRecoveryResource({ url: "https://fixture.invalid/master.M3U8?token=x" }),
    RECOVERY_RESOURCE.PLAYLIST
  );
  assert.equal(
    classifyRecoveryResource({ url: "https://fixture.invalid/a.mpd" }),
    RECOVERY_RESOURCE.PLAYLIST
  );
  assert.equal(
    classifyRecoveryResource({ url: "https://fixture.invalid/seg.m4s" }),
    RECOVERY_RESOURCE.FRAGMENT
  );
  // Unknown resources get the fragment budget, the strictest meaningful one.
  assert.equal(
    classifyRecoveryResource({ url: "https://fixture.invalid/opaque" }),
    RECOVERY_RESOURCE.FRAGMENT
  );
  assert.equal(classifyRecoveryResource({}), RECOVERY_RESOURCE.FRAGMENT);
  assert.equal(classifyRecoveryResource(null), RECOVERY_RESOURCE.FRAGMENT);
});

test("resource limits and remaining budget follow the classification", () => {
  assert.equal(resourceLimit(RECOVERY_RESOURCE.PLAYLIST), 256 * 1024);
  assert.equal(resourceLimit(RECOVERY_RESOURCE.INIT), 1024 * 1024);
  assert.equal(resourceLimit(RECOVERY_RESOURCE.FRAGMENT), 8 * 1024 * 1024);
  assert.equal(remainingBudget(RECOVERY_RESOURCE.PLAYLIST, 1024), 256 * 1024 - 1024);
  assert.equal(remainingBudget(RECOVERY_RESOURCE.PLAYLIST, 999999999), 0);
  assert.equal(remainingBudget(RECOVERY_RESOURCE.PLAYLIST, -5), 256 * 1024);
  assert.equal(remainingBudget(RECOVERY_RESOURCE.INIT, Number.NaN), 1024 * 1024);
});

test("concurrency is capped at four and rejected requests take no slot", () => {
  const session = createRecoverySession();
  const handles = Array.from({ length: 4 }, () => session.acquire());
  assert.ok(handles.every((handle) => handle.ok));
  assert.equal(session.activeRequests, 4);
  const rejected = session.acquire();
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, RECOVERY_ERROR.CONCURRENCY);
  assert.equal(session.activeRequests, 4);
  assert.equal(session.snapshot().rejected, 1);

  // A release handle is idempotent and bound to its own acquisition.
  assert.equal(handles[0].release(), true);
  assert.equal(handles[0].release(), false);
  assert.equal(session.activeRequests, 3);
  assert.equal(rejected.release, undefined);
  assert.equal(session.snapshot().releases, 1);
});

test("every received byte is accounted for, including a rejected chunk", () => {
  const limits = { ...RECOVERY_LIMITS, playlistBytes: 8, sessionBytes: 100 };
  const session = createRecoverySession({ limits });
  const over = session.charge(RECOVERY_RESOURCE.PLAYLIST, 20);
  assert.equal(over.ok, false);
  assert.equal(over.reason, RECOVERY_ERROR.BUDGET);
  // The rejected bytes are still counted: otherwise the cap is nominal.
  assert.equal(session.sessionBytes, 20);
  assert.equal(session.isExhausted, true);
});

test("an exhausted session refuses new requests instead of re-opening", () => {
  const limits = { ...RECOVERY_LIMITS, sessionBytes: 10 };
  const session = createRecoverySession({ limits });
  assert.equal(session.charge(RECOVERY_RESOURCE.FRAGMENT, 10).ok, true);
  const over = session.charge(RECOVERY_RESOURCE.FRAGMENT, 1);
  assert.equal(over.ok, false);
  assert.equal(session.isExhausted, true);
  const after = session.acquire();
  assert.equal(after.ok, false);
  assert.equal(after.reason, RECOVERY_ERROR.EXHAUSTED);
  // A later in-budget charge cannot resurrect the session, and the observed
  // byte is still accounted for.
  assert.equal(session.charge(RECOVERY_RESOURCE.PLAYLIST, 1).ok, false);
  assert.equal(session.sessionBytes, 12);
});

test("the session cap accumulates across requests", () => {
  const session = createRecoverySession();
  const fragment = RECOVERY_LIMITS.fragmentBytes;
  const outcomes = [];
  for (let index = 0; index < 9; index += 1) {
    const handle = session.acquire();
    outcomes.push(session.charge(RECOVERY_RESOURCE.FRAGMENT, fragment).ok);
    handle.release();
  }
  // Eight fragments fill 64 MiB; the ninth exceeds the session cap.
  assert.deepEqual(outcomes, [true, true, true, true, true, true, true, true, false]);
  assert.equal(session.sessionBytes, RECOVERY_LIMITS.sessionBytes + fragment);
  assert.equal(session.activeRequests, 0);
});

test("charging nonsense cannot inflate or reset the session", () => {
  const session = createRecoverySession();
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "10", null, undefined]) {
    const result = session.charge(RECOVERY_RESOURCE.FRAGMENT, value);
    assert.equal(result.ok, true, String(value));
  }
  assert.equal(session.sessionBytes, 10);
  assert.equal(session.isExhausted, false);
});

test("a release cannot drive the active count negative", () => {
  const session = createRecoverySession();
  const handle = session.acquire();
  handle.release();
  handle.release();
  handle.release();
  assert.equal(session.activeRequests, 0);
  assert.equal(session.snapshot().releases, 1);
});

test("the snapshot exposes counters without live references", () => {
  const session = createRecoverySession();
  session.acquire();
  const snapshot = session.snapshot();
  assert.equal(snapshot.active, 1);
  snapshot.active = 99;
  assert.equal(session.activeRequests, 1);
  assert.equal(session.snapshot().active, 1);
  assert.equal(session.snapshot().requests, 1);
});
