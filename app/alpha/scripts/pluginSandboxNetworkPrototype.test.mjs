import assert from "node:assert/strict";
import test from "node:test";
import { executePluginWithNetworkPrototype } from "./pluginSandboxNetworkPrototype.mjs";

const hosts = ["media.example.com"];

function ok(body = '{"ok":true}') {
  return async () => ({ status: 200, body });
}

test("plugin reaches an allowlisted host only through api.fetch and returns normalized streams", async () => {
  const calls = [];
  const transport = async (...args) => {
    calls.push(args);
    return { status: 200, body: '{"hello":"world"}' };
  };
  const result = await executePluginWithNetworkPrototype({
    allowedHosts: hosts,
    transport,
    code: `
async function resolve(api, input) {
  const response = api.fetch("https://media.example.com/catalog.json");
  api.log("status", response.status);
  return [{ sourceId: "net", sourceName: "Net", streams: [{ url: "https://media.example.com/stream.mp4", description: response.body }] }];
}`
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.groups[0].streams[0].description, '{"hello":"world"}');
  assert.equal(result.requests, 1);
  assert.equal(calls[0][0], "https://media.example.com/catalog.json");
  assert.deepEqual(Object.keys(calls[0][1]).sort(), ["credentials", "method", "redirect", "signal"]);
  assert.equal(calls[0][1].method, "GET");
  assert.equal(calls[0][1].signal instanceof AbortSignal, true);
  assert.equal(calls[0][1].signal.aborted, true); // teardown, no live transport left
  assert.deepEqual(result.logs, ["status 200"]);
});

test("a non-allowlisted destination is denied and never reaches the transport", async () => {
  let calls = 0;
  const result = await executePluginWithNetworkPrototype({
    allowedHosts: hosts,
    transport: async () => {
      calls += 1;
      return { status: 200, body: "" };
    },
    code: 'async function resolve(api){ api.fetch("https://evil.example.com/x"); return []; }'
  });
  assert.deepEqual({ ok: result.ok, error: result.error }, { ok: false, error: "host" });
  assert.equal(calls, 0);
});

test("the broker request cap is enforced across plugin calls", async () => {
  let calls = 0;
  const result = await executePluginWithNetworkPrototype({
    allowedHosts: hosts,
    brokerLimits: { maxRequests: 2 },
    transport: async () => {
      calls += 1;
      return { status: 200, body: "" };
    },
    code: 'async function resolve(api){ for (let i = 0; i < 3; i += 1) api.fetch("https://media.example.com/" + i); return []; }'
  });
  assert.deepEqual({ ok: result.ok, error: result.error }, { ok: false, error: "requests" });
  assert.equal(calls, 2);
});

test("a slow host request is cut off by the execution deadline", async () => {
  const result = await executePluginWithNetworkPrototype({
    allowedHosts: hosts,
    limits: { timeMs: 100 },
    transport: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { status: 200, body: "" };
    },
    code: 'async function resolve(api){ api.fetch("https://media.example.com/slow"); return []; }'
  });
  assert.deepEqual({ ok: result.ok, error: result.error }, { ok: false, error: "timeout" });
  assert.ok(result.elapsedMs < 2000, `took ${result.elapsedMs}ms`);
});

test("oversized and redirected-away responses fail closed with bounded codes", async () => {
  const oversized = await executePluginWithNetworkPrototype({
    allowedHosts: hosts,
    brokerLimits: { maxResponseBytes: 1000 },
    transport: ok("x".repeat(2000)),
    code: 'async function resolve(api){ api.fetch("https://media.example.com/big"); return []; }'
  });
  assert.deepEqual({ ok: oversized.ok, error: oversized.error }, { ok: false, error: "response-size" });

  const redirected = await executePluginWithNetworkPrototype({
    allowedHosts: hosts,
    transport: async () => ({ status: 302, headers: { location: "https://evil.example.com/x" }, body: "" }),
    code: 'async function resolve(api){ api.fetch("https://media.example.com/redirect"); return []; }'
  });
  assert.deepEqual({ ok: redirected.ok, error: redirected.error }, { ok: false, error: "host" });
});

test("plugins can observe and handle a denied request without crashing the host", async () => {
  const result = await executePluginWithNetworkPrototype({
    allowedHosts: hosts,
    transport: ok(),
    code: `
async function resolve(api) {
  try { api.fetch("https://evil.example.com/x"); } catch (error) { api.log("caught", error.code); }
  return [];
}`
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.groups, []);
  assert.deepEqual(result.logs, ["caught host"]);
});

test("legacy synchronous fetch in a Promise continuation fails closed rather than suspending job pump", async () => {
  let calls = 0;
  const result = await executePluginWithNetworkPrototype({ allowedHosts: hosts, transport: async () => { calls++; return {status:200,body:""}; },
    code: 'async function resolve(api){await Promise.resolve();api.fetch("https://media.example.com/late");return [];}' });
  assert.equal(result.ok, false);
  assert.equal(result.error, "async-fetch-required");
  assert.equal(calls, 0);
});

test("the VM still has no global fetch; only the brokered api.fetch exists", async () => {
  const result = await executePluginWithNetworkPrototype({
    allowedHosts: hosts,
    transport: ok(),
    code: `
async function resolve(api) {
  return [{ sourceId: "probe", sourceName: "probe", streams: [{ url: "https://media.example.com/probe", description: String(typeof fetch) + "," + String(typeof api.fetch) }] }];
}`
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.groups[0].streams[0].description, "undefined,function");
});
