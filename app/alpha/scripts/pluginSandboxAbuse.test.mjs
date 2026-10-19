import assert from "node:assert/strict";
import test from "node:test";
import { executePluginPrototype as run, PLUGIN_SANDBOX_DEFAULTS } from "./pluginSandboxPrototype.mjs";
import { executePluginWithNetworkPrototype as runNet } from "./pluginSandboxNetworkPrototype.mjs";
import { PLUGIN_CONTRACT_LIMITS } from "../js/core/plugins/pluginContract.js";

const okHosts = ["media.example.com"];

test("oversized code is rejected before any engine starts", async () => {
  const code = "a".repeat(PLUGIN_CONTRACT_LIMITS.codeBytes + 1);
  assert.deepEqual(await run({ code }), { ok: false, error: "code-size" });
  assert.deepEqual(await runNet({ code, allowedHosts: okHosts, transport: async () => ({ status: 200, body: "" }) }), { ok: false, error: "code-size" });
});

test("an allocation bomb fails closed within the memory budget", async () => {
  const result = await run({
    code: 'async function resolve(){ return "x".repeat(64 * 1024 * 1024); }',
    limits: { memoryBytes: 1024 * 1024, timeMs: 3000 }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "memory");
});

test("unbounded recursion fails closed without escaping the sandbox", async () => {
  const result = await run({
    code: "function recurse(){ return recurse(); } async function resolve(){ return recurse(); }",
    limits: { timeMs: 3000 }
  });
  assert.equal(result.ok, false);
  assert.ok(["stack", "runtime", "timeout"].includes(result.error), result.error);
});

test("a log flood is capped and cannot exhaust output", async () => {
  const result = await run({
    code: "async function resolve(api){ for (let i = 0; i < 5000; i += 1) api.log(i); return []; }"
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.logs.length, PLUGIN_SANDBOX_DEFAULTS.logs);
});

test("an undefined or unserializable result is an explicit output failure", async () => {
  const result = await run({ code: "async function resolve(){ return undefined; }" });
  assert.deepEqual({ ok: result.ok, error: result.error }, { ok: false, error: "output" });
});

test("a plugin exception is reported as plugin, not as a host crash", async () => {
  const result = await run({ code: 'async function resolve(){ throw new Error("boom"); }' });
  assert.deepEqual({ ok: result.ok, error: result.error }, { ok: false, error: "plugin" });
});

test("a huge input is bounded and does not break the engine", async () => {
  const blob = "x".repeat(512 * 1024);
  const result = await run({
    input: { blob },
    limits: { timeMs: 3000 },
    code: 'async function resolve(api, input){ return [{sourceId:"in",sourceName:"in",streams:[{url:"https://media.example.com/s",description:String(input.blob.length)}]}]; }'
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.groups[0].streams[0].description, "524288");
});

test("repeated failing executions stay isolated and a later success still works", async () => {
  for (let index = 0; index < 3; index += 1) {
    const failed = await run({ code: 'async function resolve(){ throw new Error("fail"); }' });
    assert.equal(failed.ok, false);
    assert.equal(failed.error, "plugin");
  }
  const success = await run({
    code: 'async function resolve(){ return [{sourceId:"ok",sourceName:"ok",streams:[{url:"https://media.example.com/ok"}]}]; }'
  });
  assert.equal(success.ok, true, JSON.stringify(success));
  assert.equal(success.groups.length, 1);
});

test("a network request flood is capped at the broker limit", async () => {
  let calls = 0;
  const result = await runNet({
    allowedHosts: okHosts,
    brokerLimits: { maxRequests: 4 },
    transport: async () => {
      calls += 1;
      return { status: 200, body: "" };
    },
    code: 'async function resolve(api){ for (let i = 0; i < 25; i += 1) api.fetch("https://media.example.com/" + i); return []; }'
  });
  assert.deepEqual({ ok: result.ok, error: result.error }, { ok: false, error: "requests" });
  assert.equal(calls, 4);
});

test("a redirect loop is bounded by the broker", async () => {
  const result = await runNet({
    allowedHosts: okHosts,
    brokerLimits: { maxRedirects: 2 },
    transport: async () => ({ status: 302, headers: { location: "/loop" }, body: "" }),
    code: 'async function resolve(api){ api.fetch("https://media.example.com/loop"); return []; }'
  });
  assert.deepEqual({ ok: result.ok, error: result.error }, { ok: false, error: "redirect-limit" });
});

test("a timed-out network execution does not poison a later execution", async () => {
  const slow = await runNet({
    allowedHosts: okHosts,
    limits: { timeMs: 100 },
    transport: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { status: 200, body: "" };
    },
    code: 'async function resolve(api){ api.fetch("https://media.example.com/slow"); return []; }'
  });
  assert.equal(slow.error, "timeout");
  const fast = await runNet({
    allowedHosts: okHosts,
    transport: async () => ({ status: 200, body: "B" }),
    code: 'async function resolve(api){ const r = api.fetch("https://media.example.com/fast"); return [{sourceId:"ok",sourceName:"ok",streams:[{url:"https://media.example.com/s",description:r.body}]}]; }'
  });
  assert.equal(fast.ok, true, JSON.stringify(fast));
  assert.equal(fast.groups[0].streams[0].description, "B");
});
