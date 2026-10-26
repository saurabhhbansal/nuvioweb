import assert from "node:assert/strict";
import test from "node:test";

// A deploy that overrides the approval page with an address the Nuvio service
// would refuse (here the site's own origin) must fail closed locally.
globalThis.__NUVIO_ENV__ = {
  NUVIO_SUPABASE_URL: "https://identity.fixture.invalid",
  NUVIO_SUPABASE_ANON_KEY: "fixture-public-key",
  NUVIO_SUPABASE_FALLBACK_URL: "",
  TV_LOGIN_WEB_BASE_URL: "https://nuvioweb.example.invalid"
};
const { QrLoginService } = await import("./qrLoginService.js");
const { defaultTvLoginWebBaseUrl } = await import("../../config.js");

test("only the hosted Nuvio backend defaults to Nuvio's approval page", () => {
  assert.equal(defaultTvLoginWebBaseUrl("https://api.nuvio.tv"), "https://nuvio.tv/tv-login");
  assert.equal(defaultTvLoginWebBaseUrl("https://api.nuvio.tv/"), "https://nuvio.tv/tv-login");
  for (const backend of ["https://sync.example.invalid", "https://api.nuvio.tv.example.invalid", "", null, "not a url"]) {
    assert.equal(defaultTvLoginWebBaseUrl(backend), "", String(backend));
  }
});

function storage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test("an invalid configured approval page sends no QR start request", async () => {
  const payload = Buffer.from(JSON.stringify({ sub: "anonymous", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const original = { storage: globalThis.localStorage, fetch: globalThis.fetch };
  const calls = [];
  globalThis.localStorage = storage({
    access_token: `fixture.${payload}.fixture-signature`,
    refresh_token: "fixture-anonymous-refresh",
    is_anonymous_session: "1"
  });
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    throw new Error(`unexpected request ${url}`);
  };
  try {
    assert.equal(await QrLoginService.start(), null);
    assert.match(QrLoginService.getLastError(), /Invalid TV login redirect base URL in configuration/);
    assert.deepEqual(calls, []);
  } finally {
    QrLoginService.cancelAttempt();
    globalThis.localStorage = original.storage;
    globalThis.fetch = original.fetch;
  }
});
