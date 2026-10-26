import assert from "node:assert/strict";
import test from "node:test";
import { handleTraktAuth } from "./traktAuthEdge.mjs";

const SITE = "https://nuvioweb-preview.pages.dev";
const env = { TRAKT_CLIENT_ID: "fixture-client-id", TRAKT_CLIENT_SECRET: "fixture-client-secret" };

function request(path, { method = "POST", body, origin = SITE } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (origin) headers.Origin = origin;
  return new Request(`${SITE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function trakt(status, payload, headers = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body), headers: options.headers });
    return new Response(JSON.stringify(payload), { status, headers });
  };
  return { calls, fetchImpl };
}

test("health says configured only when both the id and the secret are set", async () => {
  const health = (values) => handleTraktAuth(request("/api/trakt/health", { method: "GET" }), values).then((r) => r.json());
  assert.deepEqual(await health(env), { configured: true });
  assert.deepEqual(await health({ TRAKT_CLIENT_ID: "only-id" }), { configured: false });
  const refused = await handleTraktAuth(request("/api/trakt/device/code", { body: {} }), {});
  assert.equal(refused.status, 503);
});

test("the token poll carries the secret, and only token fields come back", async () => {
  const { calls, fetchImpl } = trakt(200, { access_token: "a", refresh_token: "r", expires_in: 7776000, created_at: 1, extra: "dropped" });
  const response = await handleTraktAuth(request("/api/trakt/device/token", { body: { code: " dc " } }), env, fetchImpl);
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, "https://api.trakt.tv/oauth/device/token");
  assert.deepEqual(calls[0].body, { code: "dc", client_id: "fixture-client-id", client_secret: "fixture-client-secret" });
  assert.equal(calls[0].headers["User-Agent"], "NuvioWeb");
  const payload = await response.json();
  assert.equal(payload.extra, undefined);
  assert.equal(payload.access_token, "a");
  assert.equal(JSON.stringify(payload).includes("fixture-client-secret"), false);
});

test("Trakt's pending and slow-down statuses reach the browser unchanged", async () => {
  for (const status of [400, 409, 410, 418]) {
    const { fetchImpl } = trakt(status, {});
    const response = await handleTraktAuth(request("/api/trakt/device/token", { body: { code: "dc" } }), env, fetchImpl);
    assert.equal(response.status, status);
  }
  const { fetchImpl } = trakt(429, {}, { "Retry-After": "5" });
  const limited = await handleTraktAuth(request("/api/trakt/device/token", { body: { code: "dc" } }), env, fetchImpl);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "5");
});

test("starting sign-in and refreshing use the right Trakt endpoints", async () => {
  const start = trakt(200, { device_code: "dc", user_code: "UC", verification_url: "https://trakt.tv/activate", expires_in: 600, interval: 5 });
  const started = await handleTraktAuth(request("/api/trakt/device/code", { body: {} }), env, start.fetchImpl);
  assert.equal(start.calls[0].url, "https://api.trakt.tv/oauth/device/code");
  assert.deepEqual(start.calls[0].body, { client_id: "fixture-client-id" });
  assert.equal((await started.json()).user_code, "UC");

  const refresh = trakt(200, { access_token: "a2" });
  await handleTraktAuth(request("/api/trakt/refresh", { body: { refresh_token: "r" } }), env, refresh.fetchImpl);
  assert.equal(refresh.calls[0].url, "https://api.trakt.tv/oauth/token");
  assert.equal(refresh.calls[0].body.grant_type, "refresh_token");
  assert.equal(refresh.calls[0].body.client_secret, "fixture-client-secret");
});

test("other sites, other methods, bad bodies and unknown paths are refused", async () => {
  const { calls, fetchImpl } = trakt(200, {});
  const status = (req) => handleTraktAuth(req, env, fetchImpl).then((r) => r.status);
  assert.equal(await status(request("/api/trakt/device/token", { body: { code: "dc" }, origin: "https://elsewhere.example" })), 403);
  assert.equal(await status(request("/api/trakt/device/token", { method: "GET" })), 405);
  assert.equal(await status(request("/api/trakt/device/token", { body: {} })), 400);
  assert.equal(await status(request("/api/trakt/refresh", { body: ["x"] })), 400);
  assert.equal(await status(request("/api/trakt/device/token", { body: { code: "x".repeat(9000) } })), 413);
  assert.equal(await status(request("/api/trakt/anything", { body: {} })), 404);
  assert.equal(calls.length, 0);
});

test("Trakt being unreachable is a 502, not a crash", async () => {
  const fetchImpl = async () => { throw new TypeError("network"); };
  const response = await handleTraktAuth(request("/api/trakt/device/code", { body: {} }), env, fetchImpl);
  assert.equal(response.status, 502);
});
