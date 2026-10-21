import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { executePluginWithNetworkPrototype as execute } from "./pluginSandboxNetworkPrototype.mjs";
import { executePluginPrototype as executeSync } from "./pluginSandboxPrototype.mjs";

const code = "async function resolve() { return []; }";
const transport = async () => ({ status: 200, body: "" });

test("invalid VM/broker budgets reject before starting the engine", async () => {
  for (const limits of [{ timeMs: NaN }, { timeMs: Infinity }, { memoryBytes: 2 ** 40 }, { stackBytes: 512 * 1024 }, { outputBytes: -1 }, { logs: 21 }, { unknown: 1 }]) {
    for (const engine of [execute, executeSync]) assert.deepEqual(await engine({ code, transport, limits }), { ok: false, error: "limits" });
  }
  assert.deepEqual(await execute({ code, transport, brokerLimits: { maxRequests: Infinity } }), { ok: false, error: "limits" });
});

test("input serialization fails closed, with UTF-8 cap and no input echoes", async () => {
  const circular = {}; circular.self = circular;
  assert.deepEqual(await execute({ code, transport, input: circular }), { ok: false, error: "input" });
  assert.deepEqual(await execute({ code, transport, input: { secret: "é".repeat(50) }, limits: { inputBytes: 100 } }), { ok: false, error: "input-size" });
});

test("output quota is UTF-8 bytes, not UTF-16 code units", async () => {
  const result = await execute({ code: 'async function resolve() { return "é".repeat(80); }', transport, limits: { outputBytes: 100 } });
  assert.deepEqual(result, { ok: false, error: "output-size" });
});

test("forged network errors cannot export arbitrary private text as reason codes", async () => {
  const result = await execute({ code: 'async function resolve() { throw new Error("plugin-network:private-token-value"); }', transport });
  assert.equal(result.ok, false);
  assert.equal(result.error, "plugin");
  assert.doesNotMatch(JSON.stringify(result), /private-token-value/);
});

test("already cancelled execution performs no transport", async () => {
  const controller = new AbortController(); controller.abort("private token");
  assert.deepEqual(await execute({ code, signal: controller.signal, transport: () => { throw new Error("must not dispatch"); } }), { ok: false, error: "cancelled" });
});

test("abort suspended host I/O, ignore late rejection and run again after teardown", async () => {
  const controller = new AbortController();
  let start;
  let rejectLate;
  const started = new Promise((resolve) => { start = resolve; });
  let observedSignal;
  const pending = execute({
    code: 'async function resolve(api) { try { await api.fetch("https://allowed.example/data"); } catch {} return []; }',
    allowedHosts: ["allowed.example"], signal: controller.signal, limits: { timeMs: 2000 },
    transport: (url, options) => {
      observedSignal = options.signal;
      start();
      return new Promise((resolve, reject) => { rejectLate = reject; });
    }
  });
  await started;
  controller.abort("private abort reason");
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.error, "cancelled");
  assert.equal(observedSignal.aborted, true);
  rejectLate(new Error("late private transport detail"));
  assert.equal((await execute({ code, transport })).ok, true);
});

test("deadline aborts the actual injected signal and late responses cannot revive VM", async () => {
  let late;
  let signal;
  const result = await execute({
    code: 'async function resolve(api) { await api.fetch("https://allowed.example/data"); return []; }',
    allowedHosts: ["allowed.example"], limits: { timeMs: 50 },
    transport: (url, options) => { signal = options.signal; return new Promise((resolve) => { late = resolve; }); }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "timeout");
  assert.equal(signal.aborted, true);
  late({ status: 200, body: "private" });
  assert.equal((await execute({ code, transport })).ok, true);
});

test("stack exhaustion tears down without a swallowed engine assertion", () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ["--test", "--test-name-pattern=unbounded recursion", new URL("./pluginSandboxAbuse.test.mjs", import.meta.url).pathname], { encoding: "utf8", timeout: 5000, env });
  assert.equal(child.status, 0);
  assert.match(child.stdout, /# tests 1\n/);
  assert.doesNotMatch(child.stdout + child.stderr, /Assertion failed|Aborted\(|JS_FreeRuntime/);
});

test("success removes caller abort listeners and clears deadline timer", async () => {
  const controller = new AbortController();
  let added = 0; let removed = 0;
  const signal = {
    get aborted() { return controller.signal.aborted; },
    addEventListener(...args) { added += 1; controller.signal.addEventListener(...args); },
    removeEventListener(...args) { removed += 1; controller.signal.removeEventListener(...args); }
  };
  assert.equal((await execute({ code, transport, signal })).ok, true);
  assert.equal(added, 1);
  assert.equal(removed, 1);
  controller.abort();
});
