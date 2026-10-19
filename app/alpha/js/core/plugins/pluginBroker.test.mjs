import assert from "node:assert/strict";
import test from "node:test";
import { createPluginNetworkBroker } from "./pluginBroker.js";

function brokerWith(transport, overrides = {}) {
  return createPluginNetworkBroker({ allowedHosts: ["media.example.com"], transport, ...overrides });
}

test("allowlisted HTTPS request succeeds and carries no headers or credentials", async () => {
  const calls = [];
  const broker = brokerWith(async (...args) => {
    calls.push(args);
    return { status: 200, body: '{"ok":true}' };
  });
  const result = await broker.request("https://media.example.com/catalog.json");
  assert.deepEqual(result, { ok: true, status: 200, body: '{"ok":true}', url: "https://media.example.com/catalog.json", hops: 0 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["https://media.example.com/catalog.json", { method: "GET" }]);
});

test("scheme, credential, IP, port, host, subdomain and length violations fail closed", async () => {
  const broker = brokerWith(async () => ({ status: 200, body: "" }));
  const cases = [
    ["http://media.example.com/catalog.json", "scheme"],
    ["https://user:pass@media.example.com/catalog.json", "credentials"],
    ["https://127.0.0.1/catalog.json", "ip"],
    ["https://[::1]/catalog.json", "ip"],
    ["https://media.example.com:444/catalog.json", "port"],
    ["https://evil.example.com/catalog.json", "host"],
    ["https://sub.media.example.com/catalog.json", "host"],
    ["https://media.example.com/" + "a".repeat(5000), "url"],
    ["not a url", "url"]
  ];
  for (const [url, error] of cases) {
    assert.deepEqual(await broker.request(url), { ok: false, error }, url);
  }
});

test("only GET is allowed", async () => {
  const broker = brokerWith(async () => ({ status: 200, body: "" }));
  assert.deepEqual(await broker.request("https://media.example.com/a", { method: "POST" }), { ok: false, error: "method" });
  assert.deepEqual(await broker.request("https://media.example.com/a", { method: "delete" }), { ok: false, error: "method" });
});

test("request count is capped before further dispatch", async () => {
  let calls = 0;
  const broker = brokerWith(async () => {
    calls += 1;
    return { status: 200, body: "ok" };
  }, { maxRequests: 2 });
  assert.equal((await broker.request("https://media.example.com/a")).ok, true);
  assert.equal((await broker.request("https://media.example.com/b")).ok, true);
  assert.deepEqual(await broker.request("https://media.example.com/c"), { ok: false, error: "requests" });
  assert.equal(calls, 2);
});

test("same-host relative redirect is followed and re-authorized", async () => {
  const seen = [];
  const broker = brokerWith(async (url) => {
    seen.push(url);
    if (url.endsWith("/a")) return { status: 302, headers: { location: "/b" }, body: "" };
    return { status: 200, body: "done" };
  });
  const result = await broker.request("https://media.example.com/a");
  assert.equal(result.ok, true);
  assert.equal(result.url, "https://media.example.com/b");
  assert.equal(result.hops, 1);
  assert.deepEqual(seen, ["https://media.example.com/a", "https://media.example.com/b"]);
});

test("redirect to a non-allowlisted host is rejected", async () => {
  const broker = brokerWith(async () => ({ status: 302, headers: { location: "https://evil.example.com/x" }, body: "" }));
  assert.deepEqual(await broker.request("https://media.example.com/a"), { ok: false, error: "host" });
});

test("redirect loops are bounded", async () => {
  const broker = brokerWith(async () => ({ status: 302, headers: { location: "/loop" }, body: "" }), { maxRedirects: 2 });
  assert.deepEqual(await broker.request("https://media.example.com/loop"), { ok: false, error: "redirect-limit" });
});

test("oversized responses are rejected", async () => {
  const broker = brokerWith(async () => ({ status: 200, body: "x".repeat(2000) }), { maxResponseBytes: 1000 });
  assert.deepEqual(await broker.request("https://media.example.com/a"), { ok: false, error: "response-size" });
});

test("transport failures are reported as a bounded code without raw text", async () => {
  const broker = brokerWith(async () => {
    throw new Error("socket hang up at https://secret.example/?token=abc");
  });
  const result = await broker.request("https://media.example.com/a");
  assert.deepEqual(result, { ok: false, error: "transport" });
  assert.doesNotMatch(JSON.stringify(result), /secret|token/i);
});

test("allowlist entries are defensively normalized and invalid entries ignored", () => {
  const broker = createPluginNetworkBroker({
    allowedHosts: ["MEDIA.Example.com", "https://bad.example.com", "127.0.0.1", "*.example.com"],
    transport: async () => ({ status: 200, body: "" })
  });
  assert.deepEqual(broker.allowedHosts, ["media.example.com"]);
});
