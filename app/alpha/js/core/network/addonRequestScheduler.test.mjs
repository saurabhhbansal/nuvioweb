import assert from "node:assert/strict";
import test from "node:test";

import { createAddonRequestScheduler, parseRetryAfterMs } from "./addonRequestScheduler.js";

// A fake add-on host: every request stays open until the test releases it,
// and the host records how many requests it was serving at once.
function createFakeHost() {
  const host = { inFlight: 0, maxInFlight: 0, calls: [], pending: [] };
  host.fetch = (url, init = {}) => {
    host.calls.push(url);
    host.inFlight += 1;
    host.maxInFlight = Math.max(host.maxInFlight, host.inFlight);
    return new Promise((resolve, reject) => {
      const entry = {
        url,
        respond(status = 200, headers = {}) {
          host.inFlight -= 1;
          host.pending.splice(host.pending.indexOf(entry), 1);
          resolve(new Response(status === 200 ? "{}" : "busy", { status, headers }));
        }
      };
      init.signal?.addEventListener("abort", () => {
        if (host.pending.includes(entry)) {
          host.inFlight -= 1;
          host.pending.splice(host.pending.indexOf(entry), 1);
          reject(init.signal.reason);
        }
      });
      host.pending.push(entry);
    });
  };
  return host;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function settle(rounds = 5) {
  for (let i = 0; i < rounds; i += 1) {
    await tick();
  }
}

test("never sends more than four requests at once to one host", async () => {
  const host = createFakeHost();
  const scheduler = createAddonRequestScheduler({ fetchImpl: host.fetch });
  const requests = Array.from({ length: 12 }, (_, i) =>
    scheduler.fetch(`https://addon.example/catalog/movie/${i}.json`)
  );

  await settle();
  assert.equal(host.inFlight, 4);
  assert.deepEqual(scheduler.snapshot("https://addon.example/"), { active: 4, queued: 8 });

  while (host.pending.length) {
    host.pending[0].respond(200);
    await settle();
    assert.ok(host.inFlight <= 4);
  }
  const responses = await Promise.all(requests);
  assert.equal(responses.length, 12);
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(host.maxInFlight, 4);
  assert.equal(host.calls.length, 12);
  assert.deepEqual(scheduler.snapshot("https://addon.example/"), { active: 0, queued: 0 });
});

test("hosts are paced separately", async () => {
  const host = createFakeHost();
  const scheduler = createAddonRequestScheduler({ fetchImpl: host.fetch });
  for (let i = 0; i < 5; i += 1) {
    scheduler.fetch(`https://one.example/${i}`);
    scheduler.fetch(`https://two.example/${i}`);
  }
  await settle();
  assert.equal(host.inFlight, 8);
  while (host.pending.length) {
    host.pending[0].respond(200);
    await settle();
  }
});

test("honours Retry-After on 429 before trying again", async () => {
  const host = createFakeHost();
  const delays = [];
  const scheduler = createAddonRequestScheduler({
    fetchImpl: host.fetch,
    wait: async (ms) => {
      delays.push(ms);
    }
  });
  const request = scheduler.fetch("https://addon.example/meta/movie/tt1.json");
  await settle();
  host.pending[0].respond(429, { "Retry-After": "7" });
  await settle();
  assert.deepEqual(delays, [7000]);
  host.pending[0].respond(200);
  const response = await request;
  assert.equal(response.status, 200);
  assert.equal(host.calls.length, 2);
});

test("backs off with doubling delays capped, then returns the last error", async () => {
  const host = createFakeHost();
  const delays = [];
  const scheduler = createAddonRequestScheduler({
    fetchImpl: host.fetch,
    maxRetries: 4,
    baseDelayMs: 1000,
    maxDelayMs: 5000,
    wait: async (ms) => {
      delays.push(ms);
    }
  });
  const request = scheduler.fetch("https://addon.example/stream/movie/tt1.json");
  for (let i = 0; i < 5; i += 1) {
    await settle();
    host.pending[0].respond(503);
  }
  const response = await request;
  assert.equal(response.status, 503);
  assert.deepEqual(delays, [1000, 2000, 4000, 5000]);
  assert.equal(host.calls.length, 5);
});

test("gives up at once when Retry-After asks for too long a wait", async () => {
  const host = createFakeHost();
  const delays = [];
  const scheduler = createAddonRequestScheduler({
    fetchImpl: host.fetch,
    wait: async (ms) => {
      delays.push(ms);
    }
  });
  const request = scheduler.fetch("https://addon.example/manifest.json");
  await settle();
  host.pending[0].respond(429, { "Retry-After": "3600" });
  assert.equal((await request).status, 429);
  assert.deepEqual(delays, []);
});

test("does not retry other failures", async () => {
  const host = createFakeHost();
  const scheduler = createAddonRequestScheduler({ fetchImpl: host.fetch, wait: async () => {} });
  const request = scheduler.fetch("https://addon.example/subtitles/movie/tt1.json");
  await settle();
  host.pending[0].respond(500);
  assert.equal((await request).status, 500);
  assert.equal(host.calls.length, 1);
});

test("aborting a screen drains its queued requests", async () => {
  const host = createFakeHost();
  const scheduler = createAddonRequestScheduler({ fetchImpl: host.fetch });
  const screen = new AbortController();
  const requests = Array.from({ length: 10 }, (_, i) =>
    scheduler.fetch(`https://addon.example/catalog/series/${i}.json`, { signal: screen.signal })
  );
  const settled = Promise.allSettled(requests);
  await settle();
  assert.deepEqual(scheduler.snapshot("https://addon.example/"), { active: 4, queued: 6 });

  screen.abort();
  const results = await settled;
  assert.ok(results.every((result) => result.status === "rejected"));
  assert.ok(results.every((result) => result.reason?.name === "AbortError"));
  assert.equal(host.calls.length, 4, "queued requests never reached the host");
  assert.deepEqual(scheduler.snapshot("https://addon.example/"), { active: 0, queued: 0 });

  // The host is free again for the next screen.
  const next = scheduler.fetch("https://addon.example/catalog/movie/top.json");
  await settle();
  host.pending[0].respond(200);
  assert.equal((await next).status, 200);
});

test("aborting during a backoff wait stops the retry", async () => {
  const host = createFakeHost();
  const screen = new AbortController();
  const scheduler = createAddonRequestScheduler({ fetchImpl: host.fetch, baseDelayMs: 60000 });
  const request = scheduler.fetch("https://addon.example/meta/series/tt2.json", {
    signal: screen.signal
  });
  await settle();
  host.pending[0].respond(503);
  await settle();
  screen.abort();
  await assert.rejects(request, { name: "AbortError" });
  assert.equal(host.calls.length, 1);
});

test("parses Retry-After seconds and HTTP dates", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(parseRetryAfterMs("5", now), 5000);
  assert.equal(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:10 GMT", now), 10000);
  assert.equal(parseRetryAfterMs("Wed, 31 Dec 2025 23:00:00 GMT", now), 0);
  assert.equal(parseRetryAfterMs("", now), null);
  assert.equal(parseRetryAfterMs("soon", now), null);
  assert.equal(parseRetryAfterMs(null, now), null);
});
