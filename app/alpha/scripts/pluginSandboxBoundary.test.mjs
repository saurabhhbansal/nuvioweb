// Original adversarial guests, NOT real installed-plugin compatibility evidence.
// These probes exercise actual QuickJS/WASM with a synthetic transport only.
import assert from "node:assert/strict";
import test from "node:test";
import { executeGetStreamsPrototype } from "./pluginGetStreamsPrototype.mjs";

const descriptor = { id: "boundary-probe", name: "Synthetic boundary probe", allowedHosts: ["allowed.example"] };
const run = (code, options = {}) => executeGetStreamsPrototype({
  descriptor: { ...descriptor, code }, approvedHosts: ["allowed.example"],
  transport: async () => { throw new Error("unexpected dispatch"); }, ...options
});
const stream = (description) => `[{ url: "https://media.example/probe", description: ${description} }]`;

test("synthetic constructor-chain probes stay in the guest realm and cannot pollute the host", { timeout: 10000 }, async () => {
  const marker = "__nuvioIssue11HostOnlyBoundaryProbe";
  assert.equal(Object.hasOwn(globalThis, marker), false);
  assert.equal(Object.hasOwn(Object.prototype, marker), false);
  globalThis[marker] = true;
  try {
    const result = await run(`module.exports.getStreams = async function() {
      var constructors = [Function, ({}).constructor.constructor, fetch.constructor, api.log.constructor, __hostFetch.constructor];
      // fetch is async: its constructor produces an AsyncFunction. Await each
      // result rather than comparing the Promise itself with the expected text.
      var observations = await Promise.all(constructors.map(function(ctor) {
        return ctor("return typeof process + ':' + typeof require + ':' + typeof ${marker}")();
      }));
      var isolated = observations.every(function(value) { return value === "undefined:undefined:undefined"; });
      var ambientAbsent = [typeof document, typeof localStorage, typeof XMLHttpRequest, typeof WebSocket, typeof importScripts].every(function(value) { return value === "undefined"; });
      Object.prototype.${marker} = true;
      return ${stream('String(isolated) + ":" + String(ambientAbsent)')};
    };`);
    assert.equal(result.ok, true);
    assert.equal(result.groups[0].streams[0].description, "true:true");
    assert.equal(Object.hasOwn(Object.prototype, marker), false);
    assert.equal(globalThis[marker], true);
  } finally {
    delete globalThis[marker];
  }
});

test("synthetic dynamic Node module imports cannot reach filesystem or child processes", { timeout: 10000 }, async () => {
  const result = await run(`module.exports.getStreams = async function() {
    var imported = 0;
    try { await import("node:fs"); imported++; } catch (_) {}
    try { await import("node:child_process"); imported++; } catch (_) {}
    return ${stream("String(imported)")};
  };`);
  assert.equal(result.ok, true);
  assert.equal(result.groups[0].streams[0].description, "0");
});

test("synthetic direct binding calls cannot bypass broker destination authorization", { timeout: 10000 }, async () => {
  let dispatches = 0;
  for (const url of ["https://unapproved.example/s", "https://127.0.0.1/s", "https://169.254.169.254/latest/meta-data/", "https://[::1]/s", "http://allowed.example/s"]) {
    const result = await run(`module.exports.getStreams = function() {
      var result = JSON.parse(__hostFetch(${JSON.stringify(url)}));
      return ${stream('String(result.ok) + ":" + result.error')};
    };`, { transport: async () => { dispatches++; return { status: 200, body: "" }; } });
    assert.equal(result.ok, true);
    assert.match(result.groups[0].streams[0].description, /^false:(host|ip|scheme)$/);
  }
  assert.equal(dispatches, 0);
});

test("synthetic redirect and SSRF targets never reach even the injected transport", { timeout: 10000 }, async () => {
  for (const destination of ["https://unapproved.example/s", "https://127.0.0.1/s", "https://169.254.169.254/latest/meta-data/", "https://[::1]/s"]) {
    const destinations = [];
    const result = await run('module.exports.getStreams = async function() { await fetch("https://allowed.example/start"); return []; };', {
      transport: async (url) => {
        destinations.push(url);
        return { status: 302, body: "", headers: { location: destination } };
      }
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /^(host|ip)$/);
    assert.deepEqual(destinations, ["https://allowed.example/start"]);
  }
});

test("synthetic mid-call cancellation aborts transport and discards its late rows", { timeout: 10000 }, async () => {
  const controller = new AbortController();
  let finish;
  let dispatched;
  let transportSignal;
  const started = new Promise((resolve) => { dispatched = resolve; });
  const pending = run('module.exports.getStreams = async function() { return await (await fetch("https://allowed.example/slow")).json(); };', {
    signal: controller.signal,
    transport: async (_url, { signal }) => {
      transportSignal = signal;
      dispatched();
      return new Promise((resolve) => { finish = resolve; });
    }
  });
  await started;
  controller.abort();
  assert.deepEqual(await pending, { ok: false, error: "cancelled" });
  assert.equal(transportSignal.aborted, true);
  finish({ status: 200, body: '[{"url":"https://media.example/late"}]' });
  const fresh = await run(`module.exports.getStreams = function() { return ${stream('"fresh"')}; };`);
  assert.equal(fresh.ok, true);
  assert.equal(fresh.groups[0].streams[0].description, "fresh");
});
