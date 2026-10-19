import test from "node:test";
import assert from "node:assert/strict";

import {
  RECOVERY_ERROR,
  RECOVERY_LIMITS,
  RECOVERY_RESOURCE,
  classifyRecoveryResource,
  createRecoveryLoaderClass,
  createRecoverySession,
  remainingBudget,
  resourceLimit
} from "./recoveryHlsLoader.js";

function ascii(value) {
  return new Uint8Array([...value].map((character) => character.charCodeAt(0)));
}

function fakeResponse(chunks, headers = {}) {
  let index = 0;
  return {
    headers: {
      get(name) {
        const key = String(name).toLowerCase();
        return key in headers ? String(headers[key]) : null;
      }
    },
    body: {
      getReader() {
        return {
          read() {
            if (index >= chunks.length) return Promise.resolve({ done: true, value: undefined });
            const value = chunks[index];
            index += 1;
            return Promise.resolve({ done: false, value });
          },
          cancel() {
            return Promise.resolve();
          }
        };
      }
    }
  };
}

function fakeTimers() {
  const timers = [];
  return {
    timers,
    setTimer: (callback, ms) => {
      const handle = { callback, ms, cleared: false };
      timers.push(handle);
      return handle;
    },
    clearTimer: (handle) => {
      handle.cleared = true;
    },
    fireLast() {
      const handle = [...timers].reverse().find((entry) => !entry.cleared);
      handle?.callback();
    }
  };
}

function makeLoader({ fetchImpl, session = createRecoverySession(), timers = fakeTimers() } = {}) {
  const RecoveryLoader = createRecoveryLoaderClass({
    baseLoader: class BaseLoader {
      constructor(config) {
        this.baseConfig = config;
      }
    },
    session,
    fetchImpl,
    now: () => 1000,
    setTimeoutFn: timers.setTimer,
    clearTimeoutFn: timers.clearTimer
  });
  return { loader: new RecoveryLoader({}), session, timers, RecoveryLoader };
}

test("a playlist is fetched with CORS, no credentials, no redirects and budget-checked", async () => {
  const calls = [];
  const body = ascii("#EXTM3U\n#EXT-X-VERSION:3\n");
  const { loader, session } = makeLoader({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return fakeResponse([body], { age: "42", "content-type": "application/vnd.apple.mpegurl" });
    }
  });
  const result = await new Promise((resolve) => {
    loader.load(
      { url: "https://fixture.invalid/master.m3u8?token=private", type: "manifest" },
      { responseType: "text" },
      {
        onSuccess: (response, stats) => resolve({ response, stats }),
        onError: (error) => resolve({ error })
      }
    );
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.mode, "cors");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(result.error, undefined);
  assert.equal(typeof result.response.data, "string");
  assert.match(result.response.data, /EXTM3U/);
  assert.equal(result.stats.loaded, body.length);
  assert.equal(result.stats.chunkCount, 1);
  assert.equal(loader.getCacheAge(), 42);
  assert.equal(loader.getResponseHeader("content-type"), "application/vnd.apple.mpegurl");
  assert.equal(session.activeRequests, 0);
  assert.equal(session.snapshot().requests, 1);
});

test("an over-budget playlist is rejected and the body is cancelled", async () => {
  let cancelled = false;
  const chunk = new Uint8Array(RECOVERY_LIMITS.playlistBytes + 1);
  const { loader, session } = makeLoader({
    fetchImpl: async () => ({
      headers: { get: () => null },
      body: {
        getReader: () => ({
          read: () => Promise.resolve({ done: false, value: chunk }),
          cancel: () => {
            cancelled = true;
            return Promise.resolve();
          }
        })
      }
    })
  });
  const outcome = await new Promise((resolve) => {
    loader.load(
      { url: "https://fixture.invalid/master.m3u8", type: "manifest" },
      { responseType: "text" },
      { onSuccess: () => resolve("success"), onError: (error) => resolve(error) }
    );
  });
  assert.equal(outcome.text, RECOVERY_ERROR.BUDGET);
  assert.equal(cancelled, true);
  assert.equal(session.activeRequests, 0);
});

test("the session cap stops a sequence of in-budget fragments", async () => {
  const session = createRecoverySession();
  const small = new Uint8Array(RECOVERY_LIMITS.fragmentBytes);
  const { loader } = makeLoader({
    session,
    fetchImpl: async () => fakeResponse([small])
  });
  const outcomes = [];
  for (let index = 0; index < 9; index += 1) {
    outcomes.push(
      await new Promise((resolve) => {
        loader.load(
          { url: `https://fixture.invalid/seg-${index}.m4s`, frag: { sn: index } },
          { responseType: "arraybuffer" },
          { onSuccess: () => resolve("ok"), onError: (error) => resolve(error.text) }
        );
      })
    );
  }
  // 64 MiB session budget / 8 MiB per fragment = 8 fragments fit; the ninth is
  // rejected and must never be reported as success.
  assert.equal(outcomes.filter((entry) => entry === "ok").length, 8);
  assert.equal(outcomes[8], RECOVERY_ERROR.BUDGET);
  assert.ok(session.sessionBytes <= RECOVERY_LIMITS.sessionBytes);
});

test("concurrency is capped and the rejected request never fetches", async () => {
  let started = 0;
  const pending = [];
  const session = createRecoverySession();
  // hls.js creates one loader instance per request; the session is shared, so
  // the cap must live on the session rather than on one instance.
  const { RecoveryLoader } = makeLoader({
    session,
    fetchImpl: async () => {
      started += 1;
      await new Promise((resolve) => pending.push(resolve));
      return fakeResponse([ascii("x")]);
    }
  });
  const requests = Array.from({ length: 5 }, (_, index) => {
    const loader = new RecoveryLoader({});
    return new Promise((resolve) => {
      loader.load(
        { url: `https://fixture.invalid/${index}.m3u8`, type: "level" },
        { responseType: "text" },
        { onSuccess: () => resolve("ok"), onError: (error) => resolve(error.text) }
      );
    });
  });
  // Let the four allowed fetches start.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(started, 4);
  assert.equal(session.activeRequests, 4);
  const rejected = await requests[4];
  assert.equal(rejected, RECOVERY_ERROR.CONCURRENCY);
  while (pending.length) pending.pop()();
  const results = await Promise.all(requests.slice(0, 4));
  assert.deepEqual(results, ["ok", "ok", "ok", "ok"]);
  assert.equal(session.activeRequests, 0);
});

test("the manifest deadline reports a timeout and aborts the request", async () => {
  const timers = fakeTimers();
  let aborted = false;
  const { loader, session } = makeLoader({
    timers,
    fetchImpl: async (url, options) => {
      options.signal.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise(() => {});
    }
  });
  const outcome = new Promise((resolve) => {
    loader.load(
      { url: "https://fixture.invalid/master.m3u8", type: "manifest" },
      { responseType: "text" },
      { onSuccess: () => resolve("success"), onTimeout: () => resolve("timeout") }
    );
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(timers.timers[0].ms, RECOVERY_LIMITS.manifestDeadlineMs);
  timers.fireLast();
  assert.equal(await outcome, "timeout");
  assert.equal(aborted, true);
  assert.equal(session.activeRequests, 0);
});

test("a fragment uses the longer deadline", async () => {
  const timers = fakeTimers();
  const { loader } = makeLoader({ timers, fetchImpl: () => new Promise(() => {}) });
  void new Promise((resolve) => {
    loader.load(
      { url: "https://fixture.invalid/seg.ts", frag: { sn: 3 } },
      { responseType: "arraybuffer" },
      { onTimeout: () => resolve("timeout"), onError: () => resolve("error") }
    );
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(timers.timers[0].ms, RECOVERY_LIMITS.fragmentDeadlineMs);
  // Settle the dangling request so the runner is not left with a live promise.
  loader.abort();
});

test("abort and destroy suppress late success and error callbacks", async () => {
  let release;
  const { loader, session } = makeLoader({
    fetchImpl: () =>
      new Promise((resolve) => {
        release = () => resolve(fakeResponse([ascii("late")]));
      })
  });
  const events = [];
  await new Promise((resolve) => {
    loader.load(
      { url: "https://fixture.invalid/master.m3u8", type: "manifest" },
      { responseType: "text" },
      {
        onSuccess: () => {
          events.push("success");
          resolve();
        },
        onError: () => {
          events.push("error");
          resolve();
        }
      }
    );
    loader.abort();
    resolve();
  });
  release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(events, []);
  assert.equal(loader.stats.aborted, true);
  assert.equal(session.activeRequests, 0);

  const destroyed = await new Promise((resolve) => {
    loader.destroy();
    loader.load(
      { url: "https://fixture.invalid/master.m3u8", type: "manifest" },
      { responseType: "text" },
      { onSuccess: () => resolve("success"), onError: (error) => resolve(error.text) }
    );
  });
  assert.equal(destroyed, RECOVERY_ERROR.DESTROYED);
});

test("network failures are reported with bounded text", async () => {
  const { loader } = makeLoader({
    fetchImpl: async () => {
      throw new Error(`boom ${"x".repeat(400)}`);
    }
  });
  const error = await new Promise((resolve) => {
    loader.load(
      { url: "https://fixture.invalid/master.m3u8", type: "manifest" },
      { responseType: "text" },
      { onSuccess: () => resolve(null), onError: (value) => resolve(value) }
    );
  });
  assert.match(error.text, /recovery-network-error/);
  assert.ok(error.text.length <= RECOVERY_LIMITS.maxDiagnosticText);
});

test("classification follows the declared context, then the extension", () => {
  assert.equal(classifyRecoveryResource({ type: "manifest" }), RECOVERY_RESOURCE.PLAYLIST);
  assert.equal(classifyRecoveryResource({ type: "audioTrack" }), RECOVERY_RESOURCE.PLAYLIST);
  assert.equal(classifyRecoveryResource({ frag: { sn: 1 } }), RECOVERY_RESOURCE.FRAGMENT);
  assert.equal(
    classifyRecoveryResource({ frag: { sn: 1 }, initSegment: true }),
    RECOVERY_RESOURCE.INIT
  );
  assert.equal(
    classifyRecoveryResource({ url: "https://fixture.invalid/master.M3U8?token=x" }),
    RECOVERY_RESOURCE.PLAYLIST
  );
  assert.equal(
    classifyRecoveryResource({ url: "https://fixture.invalid/seg.m4s" }),
    RECOVERY_RESOURCE.FRAGMENT
  );
  assert.equal(
    classifyRecoveryResource({ url: "https://fixture.invalid/opaque" }),
    RECOVERY_RESOURCE.FRAGMENT
  );
  assert.equal(resourceLimit(RECOVERY_RESOURCE.PLAYLIST), 256 * 1024);
  assert.equal(resourceLimit(RECOVERY_RESOURCE.INIT), 1024 * 1024);
  assert.equal(resourceLimit(RECOVERY_RESOURCE.FRAGMENT), 8 * 1024 * 1024);
  assert.equal(remainingBudget(RECOVERY_RESOURCE.PLAYLIST, 1024), 256 * 1024 - 1024);
  assert.equal(remainingBudget(RECOVERY_RESOURCE.PLAYLIST, 999999999), 0);
});

test("statistics stay shaped like the hls.js loader stats", async () => {
  const { loader } = makeLoader({ fetchImpl: async () => fakeResponse([ascii("abc")]) });
  const stats = await new Promise((resolve) => {
    loader.load(
      { url: "https://fixture.invalid/a.m3u8", type: "level" },
      { responseType: "text" },
      { onSuccess: (_response, value) => resolve(value), onError: () => resolve(null) }
    );
  });
  for (const key of ["aborted", "loaded", "retry", "total", "chunkCount", "bwEstimate"]) {
    assert.ok(key in stats, key);
  }
  for (const key of ["loading", "parsing", "buffering"]) {
    assert.ok(stats[key] && typeof stats[key] === "object", key);
  }
  assert.equal(typeof stats.loading.start, "number");
  assert.equal(stats.loaded, 3);
  assert.equal(stats.total, 3);
});
