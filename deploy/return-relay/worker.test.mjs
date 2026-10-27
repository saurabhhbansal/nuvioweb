import assert from "node:assert/strict";
import test from "node:test";
import relay, { ReturnSlot, allowlistedSearch, parseReport } from "./worker.js";

const APP = "https://nuvioweb-preview.pages.dev";
const RELAY = "https://relay.example.workers.dev";
const TOKEN = "ab".repeat(16);

// One ReturnSlot per name, like a Durable Object namespace, with an in-memory
// storage that records everything ever written to it.
function createEnv({ limit } = {}) {
  const slots = new Map();
  const written = [];
  const namespace = {
    idFromName: (name) => name,
    get(id) {
      if (!slots.has(id)) {
        const data = new Map();
        const storage = {
          alarm: null,
          get: async (key) => data.get(key),
          put: async (key, value) => { written.push(JSON.stringify(value)); data.set(key, value); },
          deleteAll: async () => data.clear(),
          setAlarm: async (time) => { storage.alarm = time; }
        };
        const instance = new ReturnSlot({ storage });
        slots.set(id, { instance, data, storage });
      }
      const { instance } = slots.get(id);
      return { fetch: (input, init) => instance.fetch(new Request(input, init)) };
    }
  };
  return {
    env: { RETURN_SLOTS: namespace, ALLOWED_ORIGINS: `${APP},https://*.nuvioweb-preview.pages.dev`, REPORT_LIMIT: limit },
    slots,
    written
  };
}

const get = (env, path, origin = APP) =>
  relay.fetch(new Request(`${RELAY}${path}`, { headers: origin ? { Origin: origin } : {} }), env);

test("a report is collected once by the app and then gone", async () => {
  const { env } = createEnv();
  const report = await get(env, `/api/external-return/report/${TOKEN}?outcome=stopped&provider=infuse&sourceOutcome=success&position=1800&duration=3600`, null);
  assert.equal(report.status, 200);
  assert.match(report.headers.get("content-type"), /text\/html/);
  assert.equal(report.headers.get("cache-control"), "no-store");
  const collected = await get(env, `/api/external-return/collect/${TOKEN}`);
  assert.equal(collected.headers.get("access-control-allow-origin"), APP);
  assert.deepEqual(await collected.json(), {
    found: true,
    outcome: "stopped",
    provider: "infuse",
    sourceOutcome: "success",
    position: 1800,
    duration: 3600,
    progress: null,
    parameterNames: ["position", "duration"]
  });
  assert.deepEqual(await (await get(env, `/api/external-return/collect/${TOKEN}`)).json(), { found: false });
});

test("a stream address the player appends is never stored or echoed", async () => {
  const { env, written } = createEnv();
  const secret = "https://media.fixture.invalid/film.mkv?signature=disposable";
  const response = await get(
    env,
    `/api/external-return/report/${TOKEN}?outcome=stopped&provider=vlc&position=60&lastPlayedUrl=${encodeURIComponent(secret)}&url=${encodeURIComponent(secret)}&extra=${encodeURIComponent(secret)}`,
    null
  );
  assert.equal(response.status, 200);
  const page = await response.text();
  assert.doesNotMatch(page, /fixture\.invalid|signature/);
  assert.doesNotMatch(written.join("\n"), /fixture\.invalid|signature|extra/);
  const collected = await (await get(env, `/api/external-return/collect/${TOKEN}`)).json();
  assert.deepEqual(collected.parameterNames, ["position", "lastPlayedUrl", "url"]);
  assert.doesNotMatch(JSON.stringify(collected), /fixture\.invalid|signature/);
});

test("allowlisting keeps only the report fields and the names worth noting", () => {
  const kept = allowlistedSearch(new URL(`${RELAY}/x?outcome=stopped&url=secret&token=abc&position=5`));
  assert.deepEqual([...kept], [["outcome", "stopped"], ["url", ""], ["position", "5"]]);
});

test("reports the app could not use are refused without storing anything", async () => {
  for (const query of [
    "outcome=paused&provider=infuse",
    "outcome=stopped&provider=unknown",
    "outcome=stopped&provider=infuse&position=-1",
    "outcome=stopped&provider=infuse&position=NaN",
    "outcome=stopped&provider=infuse&progress=1.5",
    "outcome=stopped&provider=infuse&position=99999&duration=60"
  ]) {
    assert.equal(parseReport(new URLSearchParams(query)), null, query);
    const { env, written } = createEnv();
    const response = await get(env, `/api/external-return/report/${TOKEN}?${query}`, null);
    assert.equal(response.status, 400, query);
    assert.equal(written.length, 0, query);
  }
});

test("malformed tokens are refused for both report and collect", async () => {
  const { env, slots } = createEnv();
  for (const token of ["short", "AB".repeat(16), `${TOKEN}0`, "../" + TOKEN]) {
    const collect = await get(env, `/api/external-return/collect/${encodeURIComponent(token)}`);
    assert.ok([400, 404].includes(collect.status), token);
    const report = await get(env, `/api/external-return/report/${encodeURIComponent(token)}?outcome=stopped&provider=infuse`, null);
    assert.ok([400, 404].includes(report.status), token);
  }
  assert.equal(slots.size, 0);
});

test("only the app's own origins may collect", async () => {
  const { env } = createEnv();
  await get(env, `/api/external-return/report/${TOKEN}?outcome=stopped&provider=lenna&position=10`, null);
  for (const origin of [null, "https://evil.example", "http://nuvioweb-preview.pages.dev", "https://a.b.nuvioweb-preview.pages.dev"]) {
    const response = await get(env, `/api/external-return/collect/${TOKEN}`, origin);
    assert.equal(response.status, 403, String(origin));
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  const preview = await get(env, `/api/external-return/collect/${TOKEN}`, "https://1a2b3c.nuvioweb-preview.pages.dev");
  assert.equal(preview.headers.get("access-control-allow-origin"), "https://1a2b3c.nuvioweb-preview.pages.dev");
  assert.equal((await preview.json()).found, true);
});

test("a report expires on its own and the alarm clears it", async () => {
  const { env, slots } = createEnv();
  await get(env, `/api/external-return/report/${TOKEN}?outcome=finished&provider=outplayer&sourceOutcome=finished`, null);
  const { instance, data, storage } = slots.get(TOKEN);
  assert.ok(storage.alarm > Date.now() && storage.alarm <= Date.now() + 10 * 60 * 1000);
  data.set("report", { ...data.get("report"), expiresAt: Date.now() - 1 });
  assert.deepEqual(await (await get(env, `/api/external-return/collect/${TOKEN}`)).json(), { found: false });
  await get(env, `/api/external-return/report/${TOKEN}?outcome=stopped&provider=infuse&position=1`, null);
  await instance.alarm();
  assert.equal(data.size, 0);
});

test("rate limiting answers without touching storage", async () => {
  const { env, written } = createEnv({ limit: { limit: async () => ({ success: false }) } });
  const report = await get(env, `/api/external-return/report/${TOKEN}?outcome=stopped&provider=infuse&position=1`, null);
  assert.equal(report.status, 429);
  const collect = await get(env, `/api/external-return/collect/${TOKEN}`);
  assert.equal(collect.status, 429);
  assert.equal(written.length, 0);
});

test("the relay serves nothing else: no proxying, no push keys, no other methods", async () => {
  const { env } = createEnv();
  assert.equal((await get(env, "/")).status, 404);
  assert.equal((await get(env, "/api/external-return/push/bind")).status, 404);
  assert.deepEqual(await (await get(env, "/api/external-return/push/public-key")).json(), { enabled: false });
  const post = await relay.fetch(new Request(`${RELAY}/api/external-return/report/${TOKEN}?outcome=stopped&provider=infuse`, { method: "POST" }), env);
  assert.equal(post.status, 405);
  assert.equal((await get(env, "/api/external-return/health")).status, 200);
});
