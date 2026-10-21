import assert from "node:assert/strict";
import test from "node:test";
import { createPluginPrototypeSession as session } from "./pluginPrototypeSession.mjs";

const descriptor = { id: "lawful-test", name: "Original regression", code: "async function resolve() { return []; }", allowedHosts: ["allowed.example"] };
const transport = async () => ({ status: 200, body: "" });
const options = { enabled: true, approvedHosts: ["allowed.example"], transport };

test("default-off/false/string flags never load engine, disable is terminal", async () => {
  let loads = 0;
  for (const enabled of [undefined, false, "true", 1]) {
    const runtime = session({ enabled, loadEngine: () => { loads += 1; } });
    assert.deepEqual(await runtime.execute(descriptor), { ok: false, error: "disabled" });
  }
  const runtime = session(options); runtime.disable();
  assert.deepEqual(await runtime.execute(descriptor), { ok: false, error: "disabled" });
  assert.equal(loads, 0);
});

test("descriptor self-authorization and invalid input cannot trigger lazy loading", async () => {
  let loads = 0;
  const runtime = session({ ...options, loadEngine: () => { loads += 1; } });
  assert.deepEqual(await runtime.execute({ ...descriptor, allowedHosts: ["other.example"] }), { ok: false, error: "host-policy" });
  assert.deepEqual(await runtime.execute({ ...descriptor, code: "" }), { ok: false, error: "descriptor" });
  assert.equal(loads, 0);
});

test("real QuickJS execution succeeds only after opt-in and has lifetime execution limit", async () => {
  const runtime = session({ ...options, maxExecutions: 1 });
  assert.deepEqual(await runtime.execute(descriptor), { ok: true, groups: [], dropped: 0 });
  assert.deepEqual(await runtime.execute(descriptor), { ok: false, error: "session-quota" });
  assert.deepEqual(runtime.status, { enabled: true, active: false, executions: 1, failures: 0 });
});

test("session exports no logs and sends only media identity to engine", async () => {
  let payload;
  const runtime = session({ ...options, loadEngine: async () => ({ executePluginWithNetworkPrototype: async (args) => {
    payload = args;
    return { ok: true, groups: [], dropped: 0, logs: ["must not export"], internal: "private" };
  } }) });
  const result = await runtime.execute(descriptor, { tmdbId: 603, mediaType: "movie", accessToken: "NEVER_SEND", refreshToken: "NEVER_SEND" });
  assert.deepEqual(payload.input, { tmdbId: "603", mediaType: "movie", season: null, episode: null });
  assert.equal(payload.limits.logs, 0);
  assert.deepEqual(result, { ok: true, groups: [], dropped: 0 });
  assert.doesNotMatch(JSON.stringify(payload.input), /NEVER_SEND/);
});

test("concurrent execution denied and disable cancels during lazy engine load", async () => {
  let finishLoad;
  let calls = 0;
  const runtime = session({ ...options, loadEngine: () => new Promise((resolve) => { finishLoad = resolve; }) });
  const first = runtime.execute(descriptor);
  assert.deepEqual(await runtime.execute(descriptor), { ok: false, error: "busy" });
  runtime.disable();
  finishLoad({ executePluginWithNetworkPrototype: () => { calls += 1; } });
  assert.deepEqual(await first, { ok: false, error: "cancelled" });
  assert.equal(calls, 0);
  assert.equal(runtime.status.active, false);
});

test("disable cancels a real suspended VM and prevents further execution", async () => {
  let start;
  const started = new Promise((resolve) => { start = resolve; });
  const runtime = session({ ...options, transport: (url, { signal }) => {
    start();
    return new Promise((resolve) => signal.addEventListener("abort", () => resolve({ status: 200, body: "" }), { once: true }));
  } });
  const pending = runtime.execute({ ...descriptor, code: 'async function resolve(api) { await api.fetch("https://allowed.example/data"); return []; }' });
  await started;
  runtime.disable();
  assert.deepEqual(await pending, { ok: false, error: "cancelled" });
  assert.deepEqual(await runtime.execute(descriptor), { ok: false, error: "disabled" });
});

test("repeated failures exhaust session budget without leaking loader exceptions", async () => {
  const runtime = session({ ...options, maxFailures: 2, loadEngine: async () => { throw new Error("private credential"); } });
  assert.deepEqual(await runtime.execute(descriptor), { ok: false, error: "engine" });
  assert.deepEqual(await runtime.execute(descriptor), { ok: false, error: "engine" });
  assert.deepEqual(await runtime.execute(descriptor), { ok: false, error: "session-quota" });
  for (const maxExecutions of [NaN, Infinity, -1, 100]) assert.throws(() => session({ maxExecutions }), /invalid session limits/);
});
