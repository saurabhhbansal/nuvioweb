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
  assert.deepEqual(calls[0], ["https://media.example.com/catalog.json", { method: "GET", redirect: "manual", credentials: "omit" }]);
});

test("trusted per-host header policy forwards only validated guest headers", async () => {
  let sent;
  const broker = brokerWith(async (url, options) => { sent = options; return { status: 200, body: "ok" }; }, {
    headerPolicy: { "media.example.com": ["User-Agent", "Referer", "Accept"] },
    resolveHost: async () => ["93.184.216.34"]
  });
  assert.equal((await broker.request("https://media.example.com/a", { headers: { "User-Agent": "Fixture/1", Referer: "https://media.example.com/", Accept: "application/json" } })).ok, true);
  assert.deepEqual(sent.headers, { "user-agent": "Fixture/1", referer: "https://media.example.com/", accept: "application/json" });
  assert.equal(sent.redirect, "manual");
  assert.equal(sent.credentials, "omit");
  assert.deepEqual(sent.addresses, ["93.184.216.34"]);
});

test("hop-by-hop metadata is discarded without authorizing nominated credentials", async () => {
  const sent = [];
  const broker = brokerWith(async (_url, options) => { sent.push(options); return {status:200,body:"ok"}; }, {
    headerPolicy: {"media.example.com":["Accept","User-Agent"]}, resolveHost:async()=>["93.184.216.34"]
  });
  const headers = {Accept:"application/json","User-Agent":"Fixture/1",Connection:"Keep-Alive, X-Hop, Accept", "Keep-Alive":"timeout=5", "Transfer-Encoding":"chunked", Upgrade:"websocket", TE:"trailers", Trailer:"X-Checksum", "Proxy-Connection":"keep-alive", "X-Hop":"discard me"};
  assert.equal((await broker.request("https://media.example.com/a",{headers})).ok,true);
  assert.deepEqual(sent[0].headers,{"user-agent":"Fixture/1"});
  for (const name of ["Authorization","Cookie","Proxy-Authorization"]) {
    assert.equal((await broker.request("https://media.example.com/a",{headers:{Connection:name,[name]:"private"}})).error,"header-policy");
  }
  assert.equal(sent.length,1);
  assert.equal((await brokerWith(async()=>({status:200,body:""})).request("https://media.example.com/a",{headers:{Connection:"keep-alive"}})).error,"dns-policy");
});

test("discarded transport metadata still obeys syntax duplicate count and byte limits", async () => {
  let calls = 0;
  const broker = brokerWith(async()=>{calls++;return {status:200,body:""};}, {resolveHost:async()=>["93.184.216.34"]});
  for (const [headers,error] of [
    [{Connection:"keep-alive\r\nX: bad"},"header-value"], [{Connection:"keep-alive",connection:"upgrade"},"header-duplicate"],
    [{Connection:"Accept, bad token"},"header-value"], [{"Keep-Alive":"x".repeat(1025)},"header-size"],
    [Object.fromEntries(Array.from({length:17},(_,i)=>[`Proxy-${i}`,"x"])),"header-size"],
    [Object.fromEntries(Array.from({length:9},(_,i)=>[`Proxy-${i}`,"x".repeat(1000)])),"header-size"],
    [{"Proxy-Authorization":"secret"},"header-policy"]
  ]) assert.equal((await broker.request("https://media.example.com/a",{headers})).error,error);
  assert.equal(calls,0);
});

test("header credential, syntax, duplicate, value, size and policy violations dispatch nothing", async () => {
  let calls = 0;
  const broker = brokerWith(async () => { calls++; return { status: 200, body: "" }; }, {
    headerPolicy: { "media.example.com": ["Accept", "Origin", "Referer", "User-Agent"] }, resolveHost: async () => ["93.184.216.34"]
  });
  for (const [headers, error] of [
    [{ Cookie: "private" }, "header-policy"], [{ Authorization: "private" }, "header-policy"],
    [{ "Proxy-Authorization": "private" }, "header-policy"], [{ Host: "other.example" }, "header-policy"],
    [{ Accept: "ok", accept: "duplicate" }, "header-duplicate"], [{ Accept: "ok\r\nInjected: private" }, "header-value"],
    [{ Accept: 42 }, "header-value"], [{ Accept: "x".repeat(1025) }, "header-size"],
    [{ Origin: "https://media.example.com/path" }, "header-origin"], [{ Referer: "https://media.example.com/?token=private" }, "header-origin"],
    [{ Referer: "https://other.example/" }, "header-origin"], [[], "header-shape"]
  ]) {
    const result = await broker.request("https://media.example.com/a", { headers });
    assert.deepEqual(result, { ok: false, error });
    assert.doesNotMatch(JSON.stringify(result), /private|Injected/);
  }
  assert.equal(calls, 0);
  assert.deepEqual(await broker.request("https://media.example.com/a", { credentials: "include" }), { ok: false, error: "request-options" });
  assert.equal((await brokerWith(async () => ({}), { headerPolicy: { "media.example.com": ["Accept"] } }).request("https://media.example.com/a", { headers: { Accept: "ok" } })).error, "dns-policy");
  assert.throws(() => brokerWith(async () => ({}), { headerPolicy: { "media.example.com": ["Cookie"] } }), /invalid header policy/);
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

test("redirect dispatches consume the same request budget", async () => {
  let calls = 0;
  const broker = brokerWith(async () => {
    calls += 1;
    return { status: 302, headers: { location: "/again" }, body: "" };
  }, { maxRequests: 2, maxRedirects: 5 });
  assert.deepEqual(await broker.request("https://media.example.com/a"), { ok: false, error: "requests" });
  assert.equal(calls, 2);
  assert.equal(broker.requestCount, 2);
});

test("invalid, nonfinite and oversized budgets fail closed", () => {
  for (const key of ["maxRequests", "maxResponseBytes", "maxTotalResponseBytes", "maxRedirects"]) {
    for (const value of [NaN, Infinity, -1, 1.5, "2", 2 ** 40]) {
      assert.throws(() => brokerWith(async () => ({}), { [key]: value }), /invalid broker limits/);
    }
  }
});

test("aggregate UTF-8 response budget includes redirect bodies", async () => {
  const broker = brokerWith(async (url) => url.endsWith("/a")
    ? { status: 302, headers: { location: "/b" }, body: "éé" }
    : { status: 200, body: "éé" }, { maxTotalResponseBytes: 7 });
  assert.deepEqual(await broker.request("https://media.example.com/a"), { ok: false, error: "response-total" });
  assert.equal(broker.responseBytes, 8);
  assert.deepEqual(await broker.request("https://media.example.com/b"), { ok: false, error: "response-total" });
  assert.equal(broker.requestCount, 2);
});

test("cancellation propagates signal, settles ignored abort and ignores late response", async () => {
  const controller = new AbortController();
  let complete;
  let dispatched;
  const started = new Promise((resolve) => { dispatched = resolve; });
  const broker = brokerWith((url, options) => {
    assert.deepEqual(Object.keys(options).sort(), ["credentials", "method", "redirect", "signal"]);
    assert.equal(options.signal, controller.signal);
    dispatched();
    return new Promise((resolve) => { complete = resolve; });
  }, { signal: controller.signal });
  const pending = broker.request("https://media.example.com/a");
  await started;
  controller.abort("private reason must not escape");
  assert.deepEqual(await pending, { ok: false, error: "cancelled" });
  complete({ status: 302, headers: { location: "/late" }, body: "secret" });
  await Promise.resolve();
  assert.equal(broker.requestCount, 1);
  assert.equal(broker.responseBytes, 0);
  assert.deepEqual(await broker.request("https://media.example.com/b"), { ok: false, error: "cancelled" });
});

test("already aborted requests dispatch nothing and concurrent requests cannot oversubscribe", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const transport = async () => { calls += 1; return { status: 200, body: "" }; };
  const aborted = brokerWith(transport, { signal: controller.signal });
  assert.deepEqual(await aborted.request("https://media.example.com/a"), { ok: false, error: "cancelled" });
  const broker = brokerWith(transport, { maxRequests: 1 });
  const results = await Promise.all(Array.from({ length: 12 }, () => broker.request("https://media.example.com/a")));
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(calls, 1);
});

test("allowlist entries are defensively normalized and invalid entries ignored", () => {
  const broker = createPluginNetworkBroker({
    allowedHosts: ["MEDIA.Example.com", "https://bad.example.com", "127.0.0.1", "*.example.com"],
    transport: async () => ({ status: 200, body: "" })
  });
  assert.deepEqual(broker.allowedHosts, ["media.example.com"]);
});

test("redirects re-resolve same host and reject any private or special address before dispatch", async () => {
  for (const denied of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "012.0.0.1", "172.037.0.1", "198.022.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::ffff:127.0.0.1", "fe80::1", "fc00::1", "2001:db8::1"]) {
    let lookups = 0, calls = 0;
    const broker = brokerWith(async () => { calls++; return { status: 302, headers: { location: "/again" }, body: "" }; }, {
      resolveHost: async () => ++lookups === 1 ? ["93.184.216.34"] : ["93.184.216.34", denied]
    });
    assert.deepEqual(await broker.request("https://media.example.com/a"), { ok: false, error: "private-address" });
    assert.equal(calls, 1); assert.equal(lookups, 2);
  }
});

test("approved cross-host redirect still cannot forward unapproved headers", async () => {
  let calls = 0;
  const broker = brokerWith(async () => { calls++; return { status: 302, headers: { location: "https://second.example/a" }, body: "" }; }, {
    allowedHosts: ["media.example.com", "second.example"], headerPolicy: { "media.example.com": ["Accept"] }, resolveHost: async () => ["93.184.216.34"]
  });
  assert.deepEqual(await broker.request("https://media.example.com/a", { headers: { Accept: "ok" } }), { ok: false, error: "header-policy" });
  assert.equal(calls, 1);
});

test("each redirect URL is checked and follow/error/manual remain bounded", async () => {
  for (const [target, error] of [["https://127.1/x", "ip"], ["https://[::1]/x", "ip"], ["https://169.254.169.254/x", "ip"], ["https://localhost/x", "host"], ["http://media.example.com/x", "scheme"], ["https://u:p@media.example.com/x", "credentials"]]) {
    let calls = 0;
    const broker = brokerWith(async () => { calls++; return { status: 302, headers: { location: target }, body: "" }; });
    assert.deepEqual(await broker.request("https://media.example.com/a"), { ok: false, error });
    assert.equal(calls, 1);
  }
  const broker = brokerWith(async () => ({ status: 302, headers: { location: "/again" }, body: "not exposed" }), {resolveHost:async()=>["93.184.216.34"]});
  assert.equal((await broker.request("https://media.example.com/a", { redirect: "error" })).error, "redirect-disallowed");
  assert.deepEqual(await broker.request("https://media.example.com/a", { redirect: "manual" }), { ok: true, status: 302, body: "", url: "https://media.example.com/a", hops: 0 });
  assert.equal((await broker.request("https://media.example.com/a", { redirect: "other" })).error, "redirect-mode");
  assert.equal((await brokerWith(async () => ({ status: 302, body: "" })).request("https://media.example.com/a")).error, "redirect-url");
  assert.equal((await brokerWith(async () => ({ status: 200, redirected: true, body: "" })).request("https://media.example.com/a")).error, "redirect-unvalidated");
});

test("header count and cumulative byte ceilings apply independently of per-value cap", async () => {
  let calls = 0;
  const names = ["User-Agent", "Accept", "Accept-Language", "Accept-Encoding", "Sec-Fetch-Site", "Sec-Fetch-Mode", "Sec-Fetch-Dest", "Sec-Fetch-User"];
  const broker = brokerWith(async () => { calls++; return {status:200,body:""}; }, { headerPolicy: {"media.example.com":names}, resolveHost:async()=>["93.184.216.34"] });
  assert.equal((await broker.request("https://media.example.com/a", {headers:Object.fromEntries(names.map(n=>[n,"x".repeat(1024)]))})).error, "header-size");
  assert.equal((await broker.request("https://media.example.com/a", {headers:Object.fromEntries(Array.from({length:17},(_,i)=>["header"+i,"x"]))})).error, "header-size");
  assert.equal(calls, 0);
});

test("five-hop ceiling is supported but never raises the independent request quota", async () => {
  const chain = async url => Number(new URL(url).pathname.slice(1)) < 5 ? {status:302,headers:{location:"/"+(Number(new URL(url).pathname.slice(1))+1)},body:""} : {status:200,body:"done"};
  const full = brokerWith(chain, {maxRedirects:5,maxRequests:6,resolveHost:async()=>["2606:4700:4700::1111"]});
  assert.equal((await full.request("https://media.example.com/0")).hops, 5);
  assert.equal(full.requestCount, 6);
  const quota = brokerWith(chain, {maxRedirects:5,maxRequests:4});
  assert.deepEqual(await quota.request("https://media.example.com/0"), {ok:false,error:"requests"});
  assert.equal(quota.requestCount, 4);
  assert.throws(()=>brokerWith(chain,{maxRedirects:6}), /invalid broker limits/);
});

test("sparse resolver answers and explicit redirect without address policy fail closed", async () => {
  let calls = 0;
  const transport = async () => { calls++; return {status:200,body:""}; };
  const sparse = brokerWith(transport,{resolveHost:async()=>new Array(1)});
  assert.equal((await sparse.request("https://media.example.com/a")).error, "private-address");
  assert.equal((await brokerWith(transport).request("https://media.example.com/a",{redirect:"follow"})).error, "dns-policy");
  assert.equal((await brokerWith(transport).request("https://media.example.com/a",{redirect:null})).error, "redirect-mode");
  assert.equal(calls, 0);
});

test("resolver cancellation settles ignored abort without any transport or late result", async () => {
  const controller = new AbortController();
  let started, finish, calls = 0;
  const ready = new Promise(resolve => { started = resolve; });
  const broker = brokerWith(async () => { calls++; return { status: 200, body: "" }; }, {
    signal: controller.signal, resolveHost: () => { started(); return new Promise(resolve => { finish = resolve; }); }
  });
  const result = broker.request("https://media.example.com/a");
  await ready; controller.abort();
  assert.deepEqual(await result, { ok: false, error: "cancelled" });
  finish(["93.184.216.34"]); await Promise.resolve();
  assert.equal(calls, 0);
});
