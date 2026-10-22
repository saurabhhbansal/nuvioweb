import assert from "node:assert/strict";
import test from "node:test";

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); }
};

const {
  clearTrackerOutbox,
  deliverOrQueue,
  enqueueTrackerWrite,
  flushTrackerOutbox,
  isRetryableTrackerFailure,
  readTrackerOutbox,
  registerTrackerSender
} = await import("./trackerOutbox.js");

const online = { navigator: { onLine: true } };
const offline = { navigator: { onLine: false } };

function httpError(status) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

test("only failures a retry can fix are kept", () => {
  assert.equal(isRetryableTrackerFailure(new TypeError("Failed to fetch"), online), true);
  assert.equal(isRetryableTrackerFailure(Object.assign(new Error("timeout"), { name: "AbortError" }), online), true);
  assert.equal(isRetryableTrackerFailure(new Error("anything"), offline), true);
  for (const status of [408, 429, 500, 502, 503]) assert.equal(isRetryableTrackerFailure(httpError(status), online), true);
  for (const status of [400, 401, 403, 404, 409, 422]) assert.equal(isRetryableTrackerFailure(httpError(status), online), false);
  // No account, no usable id: sending again cannot help.
  assert.equal(isRetryableTrackerFailure(new Error("Trakt is not connected"), online), false);
});

test("one saved write per title, kind and profile; the newer replaces the older", () => {
  clearTrackerOutbox();
  enqueueTrackerWrite({ provider: "trakt", kind: "position", key: "tt1::", payload: { p: 10 }, profileId: 1, now: 1 });
  enqueueTrackerWrite({ provider: "trakt", kind: "position", key: "tt1::", payload: { p: 40 }, profileId: 1, now: 2 });
  enqueueTrackerWrite({ provider: "trakt", kind: "position", key: "tt1::", payload: { p: 5 }, profileId: 2, now: 3 });
  enqueueTrackerWrite({ provider: "simkl", kind: "position", key: "tt1::", payload: { p: 40 }, profileId: 1, now: 4 });
  const entries = readTrackerOutbox();
  assert.equal(entries.length, 3);
  assert.deepEqual(entries.find((entry) => entry.provider === "trakt" && entry.profileId === "1").payload, { p: 40 });
  clearTrackerOutbox(2);
  assert.equal(readTrackerOutbox().some((entry) => entry.profileId === "2"), false);
});

test("deliverOrQueue keeps a write that met no network and rethrows a refusal", async () => {
  clearTrackerOutbox();
  const queued = await deliverOrQueue({
    provider: "trakt", kind: "history", key: "tt2::", payload: { watchedAt: 1000 }, profileId: 1,
    send: async () => { throw new TypeError("Failed to fetch"); }, runtime: online
  });
  assert.equal(queued, false);
  assert.equal(readTrackerOutbox().length, 1);
  await assert.rejects(
    deliverOrQueue({
      provider: "trakt", kind: "history", key: "tt3::", payload: {}, profileId: 1,
      send: async () => { throw httpError(422); }, runtime: online
    }),
    /HTTP 422/
  );
  assert.equal(readTrackerOutbox().length, 1);
});

test("a flush sends, keeps what still fails, drops refusals, and leaves other profiles alone", async () => {
  clearTrackerOutbox();
  const sent = [];
  let traktDown = true;
  registerTrackerSender("trakt", "history", async (payload) => {
    if (traktDown) throw new TypeError("Failed to fetch");
    sent.push(["trakt", payload.id]);
  });
  registerTrackerSender("simkl", "history", async (payload) => {
    if (payload.id === "refused") throw httpError(400);
    sent.push(["simkl", payload.id]);
  });
  const now = Date.now();
  enqueueTrackerWrite({ provider: "trakt", kind: "history", key: "a", payload: { id: "a" }, profileId: 1, now });
  enqueueTrackerWrite({ provider: "trakt", kind: "history", key: "b", payload: { id: "b" }, profileId: 1, now });
  enqueueTrackerWrite({ provider: "simkl", kind: "history", key: "c", payload: { id: "c" }, profileId: 1, now });
  enqueueTrackerWrite({ provider: "simkl", kind: "history", key: "r", payload: { id: "refused" }, profileId: 1, now });
  enqueueTrackerWrite({ provider: "simkl", kind: "history", key: "o", payload: { id: "other" }, profileId: 2, now });

  await flushTrackerOutbox({ profileId: 1, runtime: online });
  // Trakt is still down: its first write is tried once and the rest wait.
  assert.deepEqual(sent, [["simkl", "c"]]);
  const left = readTrackerOutbox();
  assert.deepEqual(left.map((entry) => entry.key).sort(), ["a", "b", "o"]);
  assert.equal(left.find((entry) => entry.key === "a").attempts, 1);
  assert.equal(left.find((entry) => entry.key === "b").attempts, 0);

  traktDown = false;
  await flushTrackerOutbox({ profileId: 1, runtime: online });
  assert.deepEqual(sent.slice(1), [["trakt", "a"], ["trakt", "b"]]);
  assert.deepEqual(readTrackerOutbox().map((entry) => entry.key), ["o"]);
});

test("nothing is sent offline, and old or hopeless writes are dropped", async () => {
  clearTrackerOutbox();
  let calls = 0;
  registerTrackerSender("trakt", "position", async () => { calls += 1; });
  const now = Date.now();
  enqueueTrackerWrite({ provider: "trakt", kind: "position", key: "fresh", payload: {}, profileId: 1, now });
  enqueueTrackerWrite({ provider: "trakt", kind: "position", key: "old", payload: {}, profileId: 1, now: now - 31 * 24 * 60 * 60 * 1000 });
  await flushTrackerOutbox({ profileId: 1, runtime: offline });
  assert.equal(calls, 0);
  assert.equal(readTrackerOutbox().length, 2);
  await flushTrackerOutbox({ profileId: 1, now, runtime: online });
  assert.equal(calls, 1);
  assert.deepEqual(readTrackerOutbox(), []);
});

test("a write with no registered sender waits for one", async () => {
  clearTrackerOutbox();
  enqueueTrackerWrite({ provider: "trakt", kind: "unknown-kind", key: "x", payload: {}, profileId: 1 });
  await flushTrackerOutbox({ profileId: 1, runtime: online });
  assert.equal(readTrackerOutbox().length, 1);
});
