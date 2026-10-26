import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); }
};
globalThis.__NUVIO_PLATFORM__ = "browser";
globalThis.__NUVIO_ENV__ = { TRAKT_CLIENT_ID: "fixture-public-client" };

const { Platform } = await import("../../platform/index.js");
Platform.current = null;
const { beginTraktPkce, codeChallengeFor, createCodeVerifier, takeTraktPkceCallback, traktRedirectUri } =
  await import("./traktPkce.js");
const { TraktAuthService } = await import("./traktAuthService.js");
const { TraktAuthStore } = await import("../local/traktAuthStore.js");

const SITE = "https://nuvioweb-preview.pages.dev";

function page(search = "") {
  const replaced = [];
  return {
    replaced,
    localStorage: globalThis.localStorage,
    crypto: globalThis.crypto,
    location: { origin: SITE, pathname: "/", search, hash: "", assign(url) { this.assigned = url; } },
    history: { state: null, replaceState(_state, _title, url) { replaced.push(url); } }
  };
}

test("the verifier fits Trakt's rules and the challenge is its S256 hash", async () => {
  const verifier = createCodeVerifier();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  const expected = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(await codeChallengeFor(verifier), expected);
  assert.equal(traktRedirectUri(page()), `${SITE}/`);
  assert.equal(traktRedirectUri({ location: { origin: "null" } }), null);
});

test("starting sends the viewer to Trakt with a challenge and keeps the verifier here", async () => {
  storage.clear();
  const url = new URL(await beginTraktPkce({ clientId: "fixture-public-client", profileId: 2, runtime: page() }));
  assert.equal(url.origin + url.pathname, "https://auth.trakt.tv/oauth/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), `${SITE}/`);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const pending = JSON.parse(storage.get("traktPkcePending"));
  assert.equal(url.searchParams.get("state"), pending.state);
  assert.equal(url.searchParams.get("code_challenge"), await codeChallengeFor(pending.verifier));
  assert.equal(url.toString().includes(pending.verifier), false);
  assert.equal(pending.profileId, "2");
});

test("only Trakt's answer to this device's own attempt is taken, and the address is cleaned", async () => {
  storage.clear();
  assert.equal(takeTraktPkceCallback({ runtime: page("?code=x&state=nothing-pending") }), null);
  const start = new URL(await beginTraktPkce({ clientId: "id", profileId: 1, runtime: page() }));
  const state = start.searchParams.get("state");
  assert.equal(takeTraktPkceCallback({ runtime: page(`?code=x&state=someone-else`) }), null);

  const back = page(`?code=the-code&state=${state}&addonsRemote=0`);
  const answer = takeTraktPkceCallback({ runtime: back });
  assert.equal(answer.type, "code");
  assert.equal(answer.code, "the-code");
  assert.equal(answer.redirectUri, `${SITE}/`);
  assert.deepEqual(back.replaced, ["/?addonsRemote=0"]);
  // Single use: the same address again is no longer an answer.
  assert.equal(takeTraktPkceCallback({ runtime: page(`?code=the-code&state=${state}`) }), null);
});

test("a refusal or a stale attempt ends without a token request", async () => {
  storage.clear();
  let state = new URL(await beginTraktPkce({ clientId: "id", runtime: page() })).searchParams.get("state");
  assert.equal(takeTraktPkceCallback({ runtime: page(`?error=access_denied&state=${state}`) }).type, "denied");
  state = new URL(await beginTraktPkce({ clientId: "id", runtime: page(), now: 0 })).searchParams.get("state");
  assert.equal(takeTraktPkceCallback({ runtime: page(`?code=c&state=${state}`), now: 16 * 60 * 1000 }).type, "expired");
});

test("coming back with a code trades it for a token without any secret", async (t) => {
  storage.clear();
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    if (String(url).endsWith("/oauth/token")) {
      return new Response(JSON.stringify({ access_token: "a", refresh_token: "r", expires_in: 604800, created_at: Math.floor(Date.now() / 1000) }), { status: 200 });
    }
    return new Response(JSON.stringify({ user: { username: "fixture-user", ids: { slug: "fixture-user" } } }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = original; });

  assert.equal(TraktAuthService.usesRedirectSignIn(), true);
  const leaving = page();
  await TraktAuthService.startRedirectAuth({ runtime: leaving });
  const state = new URL(leaving.location.assigned).searchParams.get("state");
  const verifier = JSON.parse(storage.get("traktPkcePending")).verifier;

  const result = await TraktAuthService.completeRedirectAuth({ runtime: page(`?code=the-code&state=${state}`) });
  assert.deepEqual(result, { type: "approved", username: "fixture-user" });
  const exchange = calls.find((call) => call.url.endsWith("/oauth/token"));
  assert.deepEqual(exchange.body, {
    code: "the-code",
    client_id: "fixture-public-client",
    redirect_uri: `${SITE}/`,
    code_verifier: verifier,
    grant_type: "authorization_code"
  });
  assert.equal(TraktAuthStore.isAuthenticated(), true);
  assert.deepEqual(TraktAuthService.takeRedirectResult(), result);
  assert.equal(TraktAuthService.takeRedirectResult(), null);
});

test("a refused exchange is reported, not saved", async (t) => {
  storage.clear();
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "bad code" }), { status: 400 });
  t.after(() => { globalThis.fetch = original; });
  const leaving = page();
  await TraktAuthService.startRedirectAuth({ runtime: leaving });
  const state = new URL(leaving.location.assigned).searchParams.get("state");
  const result = await TraktAuthService.completeRedirectAuth({ runtime: page(`?code=c&state=${state}`) });
  assert.deepEqual(result, { type: "failed", message: "bad code" });
  assert.equal(TraktAuthStore.isAuthenticated(), false);
});
