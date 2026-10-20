// Offline diagnostic: the actual QR service with synthetic storage and a mocked
// Fetch implementation. No browser, account or credential is used.
//
// Before the issue #117/#118 repair this exits 1 because the delayed exchange
// publishes over a later session. The committed lifecycle regression in
// qrLoginService.lifecycle.test.mjs is the maintained test; this probe keeps the
// original invariant reproducible from the repository.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sourceRoot = resolve(process.argv[2] || "app/alpha/js");
globalThis.__NUVIO_ENV__ = {
  NUVIO_SUPABASE_URL: "https://identity.fixture.invalid",
  NUVIO_SUPABASE_ANON_KEY: "fixture-public",
  NUVIO_SUPABASE_FALLBACK_URL: ""
};
const values = new Map();
globalThis.localStorage = {
  get length() { return values.size; },
  key: (index) => [...values.keys()][index] ?? null,
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key)
};
const moduleAt = (path) => import(pathToFileURL(resolve(sourceRoot, path)));
const { AuthManager } = await moduleAt("core/auth/authManager.js");
const { SessionStore } = await moduleAt("core/storage/sessionStore.js");
const { AuthState } = await moduleAt("core/auth/authState.js");
const { QrLoginService } = await moduleAt("core/auth/qrLoginService.js");

const token = (alias) => `fixture.${Buffer.from(JSON.stringify({ sub: alias, exp: 4102444800 })).toString("base64url")}.fixture`;
let release;
let started;
const pending = new Promise((done) => { release = done; });
const requestStarted = new Promise((done) => { started = done; });
let calls = 0;
globalThis.fetch = async (url) => {
  assert.equal(url, "https://identity.fixture.invalid/functions/v1/tv-logins-exchange");
  calls += 1;
  started();
  return pending;
};

SessionStore.accessToken = token("synthetic-initial");
SessionStore.refreshToken = "synthetic-initial";
AuthManager.setState(AuthState.AUTHENTICATED);

const attemptId = QrLoginService.beginAttempt();
const exchange = QrLoginService.exchange("synthetic-code", "synthetic-nonce", attemptId);
await requestStarted;
await AuthManager.signOut();
SessionStore.accessToken = token("synthetic-later");
SessionStore.refreshToken = "synthetic-later";
AuthManager.setState(AuthState.AUTHENTICATED);
release(new Response(JSON.stringify({
  access_token: token("synthetic-old"),
  refresh_token: "synthetic-old"
}), { status: 200, headers: { "Content-Type": "application/json" } }));
const result = await exchange;
const stalePublished = SessionStore.accessToken === token("synthetic-old");
console.log(JSON.stringify({
  network: "mocked-fetch-only",
  actualModule: "app/alpha/js/core/auth/qrLoginService.js",
  requests: calls,
  staleExchangeAccepted: Boolean(result),
  laterSessionOverwritten: stalePublished,
  limitation: "Service seam with a simulated later session; not a browser journey or live exploit."
}));
assert.equal(calls, 1);
if (process.argv.includes("--assert-safe")) {
  assert.equal(stalePublished, false, "stale QR exchange must not overwrite a later session");
}
