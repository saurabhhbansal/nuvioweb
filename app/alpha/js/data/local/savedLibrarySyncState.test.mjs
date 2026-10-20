import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

let instance = 0;
async function fixture(t) {
  const values = new Map();
  const handlers = [];
  globalThis.__libraryStateFixture__ = { values, handlers, failWrites: false };
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./savedLibrarySyncState.js", import.meta.url))],
    bundle: true, format: "esm", platform: "node", write: false,
    plugins: [{ name: "library-state-storage", setup(buildApi) {
      buildApi.onResolve({ filter: /localStore\.js$/ }, () => ({ path: "storage", namespace: "fixture" }));
      buildApi.onResolve({ filter: /accountLocalDataReset\.js$/ }, () => ({ path: "reset", namespace: "fixture" }));
      buildApi.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "storage"
        ? `export const LocalStore = { get: (key, fallback) => globalThis.__libraryStateFixture__.values.has(key) ? JSON.parse(globalThis.__libraryStateFixture__.values.get(key)) : fallback, set: (key, value) => { if (!globalThis.__libraryStateFixture__.failWrites) globalThis.__libraryStateFixture__.values.set(key, JSON.stringify(value)); } };`
        : `export const registerAccountRuntimeResetHandler = (callback) => globalThis.__libraryStateFixture__.handlers.push(callback);`
      }));
    } }]
  });
  const load = async () => (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}#${instance++}`)).SavedLibrarySyncState;
  const state = await load();
  t.after(() => { delete globalThis.__libraryStateFixture__; });
  return { state, values, handlers, load, failWrites: () => { globalThis.__libraryStateFixture__.failWrites = true; } };
}

test("clean default, pending revision and conditional acknowledgement", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(f.state.get(1), { revision: 0, pending: false });
  const first = f.state.markPending(1);
  const second = f.state.markPending(1);
  assert.notEqual(first.revision, second.revision);
  assert.equal(f.state.acknowledge(1, first.revision), false);
  assert.equal(f.state.get(1).pending, true);
  assert.equal(f.state.acknowledge(1, second.revision), true);
  assert.deepEqual(f.state.get(1), { revision: second.revision, pending: false });
});

test("pending state persists in a profile envelope and remains profile-separated", async (t) => {
  const f = await fixture(t);
  const first = f.state.markPending(1);
  f.state.markPending(2);
  f.state.acknowledge(2, f.state.get(2).revision);
  const reloaded = await f.load();
  assert.deepEqual(reloaded.get(1), first);
  assert.equal(reloaded.get(2).pending, false);
  const envelope = JSON.parse([...f.values.values()][0]);
  assert.equal(envelope.__profileScoped, true);
  assert.equal(envelope.version, 1);
  assert.deepEqual(Object.keys(envelope.profiles).sort(), ["1", "2"]);
});

test("metadata write failure still protects current-page edits", async (t) => {
  const f = await fixture(t);
  f.failWrites();
  const pending = f.state.markPending(1);
  assert.equal(pending.pending, true);
  assert.deepEqual(f.state.get(1), pending);
  assert.equal(f.values.size, 0);
});

test("account reset clears in-memory state after account storage removal", async (t) => {
  const f = await fixture(t);
  f.state.markPending(1);
  f.values.clear();
  for (const reset of f.handlers) reset();
  assert.deepEqual(f.state.get(1), { revision: 0, pending: false });
});

test("failed clean metadata cannot falsely acknowledge a pending revision", async (t) => {
  const f = await fixture(t);
  const pending = f.state.markPending(1);
  f.failWrites();
  assert.equal(f.state.acknowledge(1, pending.revision), false);
  assert.deepEqual(f.state.get(1), pending);
  assert.deepEqual((await f.load()).get(1), pending);
});
