import test from "node:test";
import assert from "node:assert/strict";
import { BOUNDED_RECOVERY_ERROR as ERR, createRecoveryHlsLoader } from "./boundedRecoveryLoader.js";
import { createRecoverySession, RECOVERY_LIMITS } from "./recoveryHlsLoader.js";

const URL = "https://fixture.invalid/media?token=synthetic-private";
const context = (extra = {}) => ({ url: URL, responseType: "arraybuffer", frag: { sn: 1 }, ...extra });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
function response(chunks = [new Uint8Array([1, 2, 3])], headers = {}) {
  let index = 0;
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      if (index === chunks.length) controller.close();
      else controller.enqueue(chunks[index++]);
    },
    cancel() { cancelled = true; }
  }, { highWaterMark: 0 });
  return { status: 200, headers: new Headers(headers), body, url: URL, get cancelled() { return cancelled; } };
}
function start(Loader, input = context(), config = {}, hooks = {}) {
  const loader = new Loader();
  const calls = [];
  const terminal = deferred();
  const callbacks = {};
  for (const name of ["onSuccess", "onError", "onTimeout", "onAbort"]) {
    callbacks[name] = (...args) => { calls.push({ name, args }); hooks[name]?.(...args); terminal.resolve({ name, args }); };
  }
  if (hooks.onProgress) callbacks.onProgress = hooks.onProgress;
  loader.load(input, config, callbacks);
  return { loader, calls, terminal: terminal.promise };
}
function factory(fetchImpl, extra = {}) {
  const session = createRecoverySession(extra.limits ? { limits: { ...RECOVERY_LIMITS, ...extra.limits } } : {});
  return { session, Loader: createRecoveryHlsLoader({ fetchImpl, session, signal: extra.signal }) };
}

test("successful SDK response uses stable stats, monotonic timing, safe details and cache headers", async () => {
  let options;
  const { Loader, session } = factory(async (_, input) => { options = input; return response(undefined, { age: "42", "x-test": "yes" }); });
  const loader = new Loader();
  const stats = loader.stats;
  const done = deferred();
  loader.load(context(), {}, { onSuccess: (...args) => done.resolve(args), onError: () => assert.fail("error"), onTimeout: () => assert.fail("timeout") });
  const [result, observedStats, input, details] = await done.promise;
  assert.equal(loader.stats, stats);
  assert.equal(observedStats, stats);
  assert.deepEqual([...new Uint8Array(result.data)], [1, 2, 3]);
  assert.equal(input.url, URL); // SDK context is private, not diagnostic output
  assert.equal(result.url, URL); // relative playlist resolution, never a receipt
  assert.equal(details, null);
  assert.equal(result.code, 200);
  assert.equal(options.credentials, "omit");
  assert.equal(options.redirect, "error");
  assert.equal(options.mode, "cors");
  assert.equal(Object.getPrototypeOf(options), null);
  assert.equal("headers" in options, false);
  assert.ok(stats.loading.start <= stats.loading.first && stats.loading.first <= stats.loading.end);
  assert.ok(stats.loading.start < Date.now() / 1000);
  assert.equal(stats.loaded, 3);
  assert.equal(stats.total, 3);
  assert.equal(stats.retry, 0);
  assert.ok(stats.bwEstimate > 0 && Number.isFinite(stats.bwEstimate));
  assert.equal(loader.getCacheAge(), 42);
  assert.equal(loader.getResponseHeader("x-test"), "yes");
  loader.destroy();
  assert.equal(stats.aborted, false); // completed requests must not be aborted
  assert.equal(loader.getResponseHeader("age"), null);
  assert.deepEqual(session.snapshot(), { requests: 1, releases: 1, rejected: 0, active: 0, sessionBytes: 3, exhausted: false });
});

test("caller credentials, invalid URLs, ranges, keys and parts are refused before fetch", async () => {
  let requests = 0;
  const { Loader, session } = factory(async () => { requests++; return response(); });
  for (const input of [
    context({ headers: { Authorization: "synthetic" } }), context({ headers: { Cookie: "synthetic" } }),
    context({ url: "https://user:private@fixture.invalid/a" }), context({ url: "data:text/plain,private" }),
    context({ url: "relative.m3u8" }), context({ rangeStart: 1, rangeEnd: 10 }), context({ rangeEnd: 10 }),
    context({ rangeStart: NaN }), context({ keyInfo: {} }), context({ frag: { decryptdata: { method: "AES-128" } } }),
    context({ part: {} }), context({ responseType: "json" }), null
  ]) {
    const { terminal } = start(Loader, input);
    const result = await terminal;
    assert.equal(result.name, "onError");
    assert.ok([ERR.INVALID, ERR.PROFILE].includes(result.args[0].text));
    assert.equal(result.args[2], null);
  }
  assert.equal(requests, 0);
  assert.equal(session.activeRequests, 0);
  assert.equal(session.snapshot().requests, 0);
});

test("HTTP and redirect failures never report success or leak response details", async () => {
  for (const status of [0, 206, 301, 400, 401, 403, 404, 410, 500]) {
    const raw = response(); raw.status = status; raw.statusText = URL;
    const { Loader } = factory(async () => raw);
    const { terminal, calls } = start(Loader);
    const result = await terminal;
    assert.equal(result.name, "onError");
    assert.deepEqual(result.args[0], { code: status, text: ERR.HTTP });
    assert.equal(result.args[2], null);
    assert.equal(raw.cancelled, true);
    assert.equal(calls.length, 1);
  }
  for (const fields of [{ redirected: true }, { type: "opaque" }, { type: "opaqueredirect" }]) {
    const raw = Object.assign(response(), fields);
    const { Loader } = factory(async () => raw);
    assert.equal((await start(Loader).terminal).args[0].text, ERR.PROFILE);
    assert.equal(raw.cancelled, true);
  }
});

test("network exceptions are fixed enums, no raw exception URL/token", async () => {
  for (const fetchImpl of [() => { throw new Error(URL); }, async () => { throw new Error(URL); }]) {
    const { Loader, session } = factory(fetchImpl);
    const result = await start(Loader).terminal;
    assert.deepEqual(result.args[0], { code: 0, text: ERR.NETWORK });
    assert.equal(result.args[2], null);
    assert.equal(session.activeRequests, 0);
  }
});

test("non-streaming bodies never call unbounded arrayBuffer/text fallbacks", async () => {
  const raw = response(); raw.body = null;
  raw.arrayBuffer = raw.text = () => assert.fail("unbounded fallback called");
  const { Loader, session } = factory(async () => raw);
  assert.equal((await start(Loader).terminal).args[0].text, ERR.BODY);
  assert.equal(session.activeRequests, 0);
});

test("declared oversize is rejected before reading and is not fabricated as transfer", async () => {
  const raw = response(undefined, { "content-length": "100" });
  const { Loader, session } = factory(async () => raw, { limits: { fragmentBytes: 8 } });
  const { terminal, loader } = start(Loader);
  assert.equal((await terminal).args[0].text, ERR.BUDGET);
  assert.equal(raw.cancelled, true);
  assert.equal(loader.stats.loaded, 0);
  assert.equal(session.sessionBytes, 0);
});

test("chunked cumulative overflow accounts rejected bytes, latches, aborts and releases", async () => {
  let signal;
  const raw = response([new Uint8Array(4), new Uint8Array(5)]);
  const { Loader, session } = factory(async (_, options) => { signal = options.signal; return raw; }, { limits: { fragmentBytes: 8 } });
  const { terminal, loader, calls } = start(Loader);
  assert.equal((await terminal).args[0].text, ERR.BUDGET);
  assert.equal(loader.stats.loaded, 9);
  assert.equal(session.sessionBytes, 9);
  assert.equal(session.isExhausted, true);
  assert.equal(signal.aborted, true);
  assert.equal(raw.cancelled, true);
  assert.equal(session.activeRequests, 0);
  assert.equal((await start(Loader).terminal).args[0].text, ERR.EXHAUSTED);
  loader.abort(); loader.destroy();
  assert.equal(calls.length, 1);
});

test("single rejected chunk and aggregate session cap count every observed byte", async () => {
  for (const limits of [{ fragmentBytes: 8 }, { sessionBytes: 8 }]) {
    const { Loader, session } = factory(async () => response([new Uint8Array(9)]), { limits });
    assert.equal((await start(Loader).terminal).args[0].text, ERR.BUDGET);
    assert.equal(session.sessionBytes, 9);
    assert.equal(session.isExhausted, true);
  }
  const { Loader, session } = factory(async () => response([new Uint8Array(4)]), { limits: { sessionBytes: 7 } });
  assert.equal((await start(Loader).terminal).name, "onSuccess");
  assert.equal((await start(Loader).terminal).args[0].text, ERR.BUDGET);
  assert.equal(session.sessionBytes, 8);
});

test("real pinned init context receives the 1MiB cap, not the fragment cap", async () => {
  for (const frag of [{ sn: "initSegment" }, { sn: 2, initSegment: {} }]) {
    const { Loader } = factory(async () => response([new Uint8Array(5)]), { limits: { initBytes: 4, fragmentBytes: 8 } });
    assert.equal((await start(Loader, context({ frag })).terminal).args[0].text, ERR.BUDGET);
  }
});

test("body-inclusive timeout aborts once even if cancel never resolves", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const entered = deferred();
  const read = deferred();
  let aborted;
  const { Loader, session } = factory(async (_, options) => {
    aborted = options.signal;
    return { status: 200, headers: new Headers(), body: { getReader: () => ({
      read: () => { entered.resolve(); return read.promise; }, cancel: () => new Promise(() => {})
    }) } };
  });
  const { terminal, loader, calls } = start(Loader, context({ type: "manifest" }));
  await entered.promise;
  t.mock.timers.tick(4999);
  assert.equal(calls.length, 0);
  t.mock.timers.tick(1);
  assert.equal((await terminal).name, "onTimeout");
  assert.equal(aborted.aborted, true);
  assert.equal(session.activeRequests, 0);
  read.resolve({ done: false, value: new Uint8Array([1]) });
  await Promise.resolve(); await Promise.resolve();
  loader.abort(); loader.destroy(); t.mock.timers.tick(10000);
  assert.equal(calls.length, 1);
  assert.equal(session.sessionBytes, 0);
});

test("header deadline includes late fetch, destroys safely and cancels late body", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fetched = deferred();
  const { Loader, session } = factory(() => fetched.promise);
  const { terminal, calls } = start(Loader);
  t.mock.timers.tick(10000);
  assert.equal((await terminal).name, "onTimeout");
  const raw = response(); fetched.resolve(raw);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(raw.cancelled, true);
  assert.equal(calls.length, 1);
  assert.equal(session.activeRequests, 0);
});

test("abort, shared session cancellation and destroy prevent late callbacks/timers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const operation of ["abort", "destroy", "session"]) {
    const fetched = deferred();
    const owner = new AbortController();
    const { Loader, session } = factory(() => fetched.promise, { signal: owner.signal });
    const { loader, calls } = start(Loader);
    if (operation === "session") owner.abort(); else loader[operation]();
    assert.equal(session.activeRequests, 0);
    assert.equal(calls.length, operation === "destroy" ? 0 : 1);
    if (calls.length) assert.equal(calls[0].name, "onAbort");
    const raw = response(); fetched.resolve(raw);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(raw.cancelled, true);
    loader.abort(); loader.destroy(); t.mock.timers.tick(20000);
    assert.equal(calls.length, operation === "destroy" ? 0 : 1);
  }
});

test("pre-aborted session never acquires a slot or issues a request", async () => {
  const owner = new AbortController(); owner.abort();
  const { Loader, session } = factory(() => assert.fail("fetch called"), { signal: owner.signal });
  assert.equal((await start(Loader).terminal).name, "onAbort");
  assert.equal(session.snapshot().requests, 0);
});

test("concurrent cap, rejected ownership, overlap and single-use do not disturb active requests", async () => {
  const fetched = deferred();
  const { Loader, session } = factory(() => fetched.promise);
  const active = Array.from({ length: 4 }, () => start(Loader));
  const rejected = start(Loader);
  assert.equal((await rejected.terminal).args[0].text, ERR.CONCURRENCY);
  rejected.loader.destroy(); rejected.loader.abort();
  assert.equal(session.activeRequests, 4);
  assert.throws(() => active[0].loader.load(context(), {}, {}), /single-use/);
  assert.equal(session.activeRequests, 4);
  for (const item of active) item.loader.abort();
  assert.equal(session.activeRequests, 0);
  assert.equal(session.snapshot().releases, 4);
  assert.throws(() => rejected.loader.load(context(), {}, {}), /single-use/);
  fetched.resolve(response());
});

test("progressive output has no duplicated bytes, final empty payload and can cancel", async () => {
  const { Loader, session } = factory(async () => response([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])]));
  const chunks = [];
  const { terminal, loader } = start(Loader, context(), { highWaterMark: 3 }, { onProgress: (_, __, data, details) => {
    assert.equal(details, null); chunks.push(...new Uint8Array(data));
  } });
  const result = await terminal;
  assert.equal(result.name, "onSuccess");
  assert.equal(result.args[0].data.byteLength, 0);
  assert.deepEqual(chunks, [1, 2, 3, 4, 5]);
  assert.equal(loader.stats.chunkCount, 1);
  assert.equal(session.sessionBytes, 5);

  const cancelFactory = factory(async () => response([new Uint8Array([1]), new Uint8Array([2])]));
  let cancelledLoader;
  const done = deferred();
  cancelledLoader = new cancelFactory.Loader();
  cancelledLoader.load(context(), { highWaterMark: 1 }, {
    onProgress: () => cancelledLoader.abort(), onAbort: () => done.resolve(),
    onSuccess: () => assert.fail("success after abort"), onError: () => assert.fail("error after abort")
  });
  await done.promise;
  assert.equal(cancelFactory.session.sessionBytes, 1);
  assert.equal(cancelFactory.session.activeRequests, 0);
});

test("text progress conversion is one complete string and invalid cache age stays unknown", async () => {
  const { Loader } = factory(async () => response([new TextEncoder().encode("#EXTM3U\n")], { age: "private" }));
  const seen = [];
  const { terminal, loader } = start(Loader, context({ type: "manifest", responseType: "text" }), {}, {
    onProgress: (_, __, data) => seen.push(data)
  });
  const result = await terminal;
  assert.equal(result.args[0].data, "#EXTM3U\n");
  assert.deepEqual(seen, ["#EXTM3U\n"]);
  assert.equal(loader.getCacheAge(), null);
});

test("deadline policies only tighten; loader/setup failures release acquisition", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { Loader, session } = factory(() => new Promise(() => {}));
  const pending = start(Loader, context(), { timeout: 90000, loadPolicy: { maxLoadTimeMs: 12 } });
  t.mock.timers.tick(11); assert.equal(pending.calls.length, 0);
  t.mock.timers.tick(1); assert.equal((await pending.terminal).name, "onTimeout");
  assert.equal(session.activeRequests, 0);
  const badSignal = { aborted: false, addEventListener() { throw new Error(URL); }, removeEventListener() {} };
  const broken = factory(() => assert.fail("fetch after setup failure"), { signal: badSignal });
  assert.equal((await start(broken.Loader).terminal).args[0].text, ERR.INVALID);
  assert.equal(broken.session.activeRequests, 0);
});

test("relaxed/mutable session limits cannot silently weaken the loader caps", () => {
  for (const value of [0, NaN, Infinity, -1, 1.5, "4", 5]) {
    assert.throws(() => createRecoverySession({ limits: { ...RECOVERY_LIMITS, maxConcurrentRequests: value } }), /invalid-limits/);
  }
  const limits = { ...RECOVERY_LIMITS, sessionBytes: 8 };
  const session = createRecoverySession({ limits });
  limits.sessionBytes = Infinity;
  assert.equal(session.limits.sessionBytes, 8);
  assert.ok(Object.isFrozen(session.limits));
  assert.throws(() => createRecoveryHlsLoader({ session: { limits: {} } }), /invalid-limits/);
});
