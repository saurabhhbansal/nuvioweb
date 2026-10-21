import assert from "node:assert/strict";
import test from "node:test";
import { executeGetStreamsPrototype as execute } from "./pluginGetStreamsPrototype.mjs";

const descriptor = { id: "original-regression", name: "Original upstream-shaped regression", allowedHosts: ["allowed.example"] };
const transport = async () => ({ status: 200, body: '{"url":"https://media.example/s"}' });
const run = (code, options = {}) => execute({ descriptor: { ...descriptor, code }, approvedHosts: ["allowed.example"], transport, ...options });

test("CommonJS positional getStreams maps flat results into normalized groups", async () => {
  const result = await run(`module.exports.getStreams = async function(id, type, season, episode) {
    return [{ url: "https://media.example/s", description: [typeof id, id, type, season, episode].join(":") }];
  };`, { input: { tmdbId: 603, mediaType: "tv", season: 2, episode: 4, token: "must-not-enter" } });
  assert.equal(result.ok, true);
  assert.equal(result.groups[0].sourceId, descriptor.id);
  assert.equal(result.groups[0].streams[0].description, "string:603:tv:2:4");
  assert.equal(result.logs, undefined);
});

test("console-using getStreams listener runs in the guest without serializing logs or escaping", async () => {
  const marker = "__issue11ConsoleHostSentinel";
  assert.equal(Object.hasOwn(globalThis, marker), false);
  globalThis[marker] = true;
  try {
    const result = await run(`module.exports.getStreams = async function() {
      var argument = { toString() { throw new Error("must-not-stringify"); }, toJSON() { throw new Error("must-not-serialize"); } };
      [argument].forEach(function listener(value) { console.log(value); });
      console.info(argument); console.warn(argument); console.error("private-log-canary", argument); console.debug(argument);
      var ambient = console.log.constructor("return typeof process + ':' + typeof require + ':' + typeof ${marker}")();
      return [{ url: "https://media.example/s", description: typeof console + ":" + typeof console.log + ":" + ambient }];
    };`);
    assert.equal(result.ok, true);
    assert.equal(result.groups[0].streams[0].description, "object:function:undefined:undefined:undefined");
    assert.equal(result.logs, undefined);
    assert.doesNotMatch(JSON.stringify(result), /private-log-canary|must-not-stringify|must-not-serialize/);
    assert.equal(globalThis[marker], true);
  } finally {
    delete globalThis[marker];
  }
});

test("console flooding stays deadline-bounded with no retained log output", async () => {
  const flooded = await run(`module.exports.getStreams = function() {
    var payload = { toString() { throw new Error("must-not-stringify"); } };
    while (true) console.log(payload);
  };`, { limits: { timeMs: 50 } });
  assert.deepEqual(flooded, { ok: false, error: "timeout" });
  const after = await run('module.exports.getStreams = function() { console.log("discarded"); return [{ url: "https://media.example/s", description: "fresh" }]; };');
  assert.equal(after.ok, true);
  assert.equal(after.groups[0].streams[0].description, "fresh");
  assert.equal(after.logs, undefined);
});

test("global getStreams fallback and GET response text/json/status use the broker", async () => {
  let calls = 0;
  const result = await run(`async function getStreams() {
    var response = await fetch("https://allowed.example/data", { method: "GET" });
    var text = await response.text();
    var data = await response.json();
    return [{ url: data.url, description: response.ok + ":" + response.status + ":" + (text.length > 0) }];
  }`, { transport: async (...args) => {
    calls += 1;
    assert.equal(args[0], "https://allowed.example/data");
    assert.deepEqual(Object.keys(args[1]).sort(), ["credentials", "method", "redirect", "signal"]);
    return transport();
  } });
  assert.equal(result.ok, true);
  assert.equal(result.groups[0].streams[0].description, "true:200:true");
  assert.equal(calls, 1);
});

test("approved guest headers and follow mode cross bounded JSON bridge and redirects", async () => {
  const calls = [];
  const result = await run(`module.exports.getStreams = async function() {
    var response = await fetch("https://allowed.example/start", { headers: { Accept: "application/json" }, redirect: "follow" });
    return [{ url: (await response.json()).url }];
  };`, {
    headerPolicy: { "allowed.example": ["Accept"] }, resolveHost: async () => ["93.184.216.34"],
    transport: async (url, options) => {
      calls.push({ url, headers: options.headers, redirect: options.redirect, credentials: options.credentials });
      return url.endsWith("/start") ? { status: 302, headers: { location: "/data" }, body: "" } : transport();
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.groups[0].streams.length, 1);
  assert.deepEqual(calls.map(c => [c.headers, c.redirect, c.credentials]), [[{ accept: "application/json" }, "manual", "omit"], [{ accept: "application/json" }, "manual", "omit"]]);
});

test("a second network call from a Promise continuation stays within the same VM and quotas", async () => {
  let calls = 0;
  const result = await run(`module.exports.getStreams = async function() {
    await fetch("https://allowed.example/one", { headers: { Accept: "application/json" } });
    var response = await fetch("https://allowed.example/two", { headers: { Accept: "application/json" } });
    return [{ url: (await response.json()).url }];
  };`, { headerPolicy: { "allowed.example": ["Accept"] }, resolveHost: async () => ["93.184.216.34"],
    transport: async () => { calls++; return transport(); } });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(result.groups[0].streams.length, 1);
});

test("parallel guest fetches cannot oversubscribe broker or deferred reply budget", async () => {
  let calls = 0;
  const result = await run(`module.exports.getStreams = async function() {
    var all = await Promise.allSettled(Array.from({length:12}, function() { return fetch("https://allowed.example/data"); }));
    return [{url:"https://media.example/s",description:String(all.filter(function(r){return r.status === "fulfilled";}).length)}];
  };`, { transport: async () => { calls++; return transport(); } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(calls, 4);
  assert.equal(result.groups[0].streams[0].description, "4");
});

test("async guest fetch cancellation ignores late completion and a fresh VM recovers", async () => {
  const controller = new AbortController();
  let finish, started;
  const ready = new Promise(resolve => { started = resolve; });
  const pending = run('module.exports.getStreams=async function(){await fetch("https://allowed.example/slow");return [];};', {
    signal: controller.signal, transport: () => { started(); return new Promise(resolve => { finish = resolve; }); }
  });
  await ready; controller.abort();
  assert.deepEqual(await pending, {ok:false,error:"cancelled"});
  finish({status:200,body:'{"private":"must-not-export"}'});
  const after = await run('module.exports.getStreams=function(){return [{url:"https://media.example/s"}];};');
  assert.equal(after.ok, true);
  assert.doesNotMatch(JSON.stringify(after), /must-not-export/);
});

test("direct async binding cannot bypass options size shape or credential-header policy", async () => {
  let calls = 0;
  for (const [encoded, expected] of [[JSON.stringify({headers:{Authorization:"secret-canary"}}),"header-policy"], [JSON.stringify({credentials:"include"}),"request-options"], ["{", "request-options"], ["x".repeat(12289), "request-size"]]) {
    const result = await run(`module.exports.getStreams=async function(){var r=JSON.parse(await __hostFetchAsync("https://allowed.example/data",${JSON.stringify(encoded)}));return [{url:"https://media.example/s",description:r.error}];};`, {
      transport: async () => { calls++; return transport(); }
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.groups[0].streams[0].description, expected);
    assert.doesNotMatch(JSON.stringify(result), /secret-canary/);
  }
  assert.equal(calls, 0);
});

test("POST, unapproved headers, credentials and signals are unsupported and dispatch nothing", async () => {
  let calls = 0;
  for (const options of [{ method: "POST" }, { headers: { Authorization: "private" } }, { credentials: "include" }, { signal: {} }]) {
    const result = await run(`module.exports.getStreams = async function() { await fetch("https://allowed.example/data", ${JSON.stringify(options)}); return []; };`, {
      transport: async () => { calls += 1; return transport(); }
    });
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), /private|Authorization/);
  }
  assert.equal(calls, 0);
});

test("out-of-policy host, modules and ambient host APIs remain unavailable", async () => {
  let calls = 0;
  const denied = await run('module.exports.getStreams = async function() { await fetch("https://other.example/s"); return []; };', {
    transport: async () => { calls += 1; return transport(); }
  });
  assert.equal(denied.error, "host");
  assert.equal(calls, 0);
  const globals = await run(`exports.getStreams = async function() { return [{ url: "https://media.example/s", description: [typeof require, typeof process, typeof document, typeof localStorage, typeof XMLHttpRequest, typeof WebSocket, typeof input.token].join(":") }]; };`);
  // No host input object is exposed as 'input'; unexpected global access fails.
  assert.equal(globals.ok, false);
  assert.equal((await run('module.exports.getStreams = function() { return [{ url: "https://media.example/s", description: [typeof require, typeof process, typeof document, typeof localStorage].join(":") }]; };')).groups[0].streams[0].description, "undefined:undefined:undefined:undefined");
});

test("required unsupported output metadata is rejected, never silently stripped", async () => {
  for (const field of [{ headers: {} }, { subtitles: [] }, { infoHash: "hash" }, { url: { url: "https://media.example/s" } }]) {
    const result = await run(`module.exports.getStreams = function() { return [${JSON.stringify({ url: "https://media.example/s", ...field })}]; };`);
    assert.equal(result.ok, false);
    if (field.headers) assert.equal(result.error, "playback-headers");
  }
  assert.equal((await run('module.exports.getStreams = function() { return { url: "https://media.example/s" }; };')).ok, false);
  assert.equal((await run("module.exports.other = function() { return []; };")).ok, false);
});

test("descriptor host declaration cannot self-authorize without trusted approval", async () => {
  let calls = 0;
  const code = 'module.exports.getStreams = async function() { await fetch("https://not-approved.example/data"); return []; };';
  const result = await execute({ descriptor: { ...descriptor, code, allowedHosts: ["not-approved.example"] },
    approvedHosts: ["allowed.example"], transport: async () => { calls += 1; return transport(); } });
  assert.deepEqual(result, { ok: false, error: "host-policy" });
  assert.deepEqual(await run(code, { approvedHosts: [] }), { ok: false, error: "host-policy" });
  assert.equal(calls, 0);
});

test("serializer and late getters cannot hide required playback metadata", async () => {
  const expressions = [
    '[{ toJSON() { return { url: "https://media.example/s", headers: { Authorization: "required" } }; } }]',
    'Object.assign([], { toJSON() { return [{ url: "https://media.example/s", subtitles: ["required"] }]; } })',
    '[{ url: "https://media.example/s", get headers() { return undefined; }, toJSON() { return { url: "https://media.example/s", infoHash: "required" }; } }]',
    '[{ toJSON() { return { url: { url: "https://media.example/s" } }; } }]',
    '(function(){ var reads = 0; return [{ url: "https://media.example/s", get headers() { return ++reads === 1 ? undefined : { Authorization: "required" }; } }]; })()'
  ];
  for (const expression of expressions) {
    const result = await run(`module.exports.getStreams = function() { return ${expression}; };`);
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), /Authorization|required/);
  }
});

test("nested addon behaviorHints cannot silently lose required playback headers", async () => {
  const expressions = [
    '[{ url: "https://media.example/s", behaviorHints: { proxyHeaders: { request: { Referer: "https://required.example/" } } } }]',
    '[{ url: "https://media.example/s", behaviorHints: { headers: { Referer: "https://required.example/" } } }]',
    '[{ toJSON() { return { url: "https://media.example/s", behaviorHints: { proxyHeaders: { request: { Referer: "https://required.example/" } } } }; } }]',
    '[{ url: "https://media.example/s", get behaviorHints() { return undefined; }, toJSON() { return { url: "https://media.example/s", behaviorHints: { notWebReady: true } }; } }]'
  ];
  for (const expression of expressions) {
    const result = await run(`module.exports.getStreams = function() { return ${expression}; };`);
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), /Referer|required\.example|proxyHeaders/);
  }
});

test("adapter keeps cancellation, normalization and VM resource limits", async () => {
  const controller = new AbortController(); controller.abort();
  assert.equal((await run("module.exports.getStreams = function() { return []; };", { signal: controller.signal })).error, "cancelled");
  const normalized = await run('module.exports.getStreams = function() { return [{ url: "javascript:alert(1)" }, { url: "https://media.example/s" }]; };');
  assert.equal(normalized.groups[0].streams.length, 1);
  assert.equal(normalized.dropped, 1);
  assert.equal((await run("module.exports.getStreams = function() { while (true) {} };", { limits: { timeMs: 50 } })).error, "timeout");
});
