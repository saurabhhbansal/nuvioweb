// Actual loopback HTTP transport, not browser CORS, decoding, provider or device proof.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createRecoveryHlsLoader } from "./boundedRecoveryLoader.js";
import { createRecoverySession, RECOVERY_LIMITS } from "./recoveryHlsLoader.js";

function request(Loader, url, extra = {}) {
  const loader = new Loader();
  const events = [];
  const terminal = new Promise((resolve) => {
    const callbacks = {};
    for (const name of ["onSuccess", "onError", "onTimeout", "onAbort"]) {
      callbacks[name] = (...args) => { events.push(name); resolve({ name, args }); };
    }
    loader.load({ url, responseType: "text", type: "manifest", ...extra }, {}, callbacks);
  });
  return { loader, terminal, events };
}

test("real HTTP: anonymous success, rejection, redirect denial, body deadlines and cancellation", async (t) => {
  const observed = [];
  const sockets = new Set();
  const waiting = new Map();
  const server = http.createServer((req, res) => {
    observed.push({ path: req.url, authorization: req.headers.authorization, cookie: req.headers.cookie, range: req.headers.range });
    if (req.url === "/redirect") { res.writeHead(302, { location: "/redirect-target" }); res.end(); return; }
    if (req.url === "/denied") { res.writeHead(403); res.end("not media"); return; }
    if (req.url === "/expired") { res.writeHead(410); res.end(); return; }
    if (req.url === "/declared") { res.writeHead(200, { "content-length": "100" }); res.flushHeaders(); return; }
    if (req.url === "/chunked") { res.write("12345678"); res.end("9"); return; }
    if (req.url === "/slow-body" || req.url === "/cancel") {
      res.writeHead(200); res.write("#EXTM3U\n");
      waiting.get(req.url)?.(res);
      return; // deliberately incomplete body until cancellation closes connection
    }
    res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl", age: "3" });
    res.end("#EXTM3U\n#EXT-X-ENDLIST\n");
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const make = (limits = {}, signal) => {
    const session = createRecoverySession({ limits: { ...RECOVERY_LIMITS, ...limits } });
    return { session, Loader: createRecoveryHlsLoader({ session, signal }) };
  };

  await t.test("actual successful text and cache header", async () => {
    const { Loader, session } = make();
    const pending = request(Loader, `${base}/ok`);
    const result = await pending.terminal;
    assert.equal(result.name, "onSuccess");
    assert.equal(result.args[0].data, "#EXTM3U\n#EXT-X-ENDLIST\n");
    assert.equal(pending.loader.getCacheAge(), 3);
    assert.equal(session.sessionBytes, 23);
    assert.equal(session.activeRequests, 0);
  });
  await t.test("403/410 are terminal without retry", async () => {
    const { Loader } = make();
    for (const [path, code] of [["denied", 403], ["expired", 410]]) {
      const pending = request(Loader, `${base}/${path}`);
      const result = await pending.terminal;
      assert.equal(result.name, "onError");
      assert.deepEqual(result.args[0], { code, text: "recovery-http-error" });
      assert.equal(result.args[2], null);
      assert.deepEqual(pending.events, ["onError"]);
      assert.equal(observed.filter((row) => row.path === `/${path}`).length, 1);
    }
  });
  await t.test("redirect target never requested", async () => {
    const { Loader } = make();
    const result = await request(Loader, `${base}/redirect`).terminal;
    assert.equal(result.name, "onError");
    assert.equal(result.args[0].text, "recovery-network-error");
    assert.equal(observed.some((row) => row.path === "/redirect-target"), false);
  });
  await t.test("declared and chunked oversize rejected with actual-byte accounting", async () => {
    for (const path of ["declared", "chunked"]) {
      const { Loader, session } = make({ playlistBytes: 8 });
      const result = await request(Loader, `${base}/${path}`).terminal;
      assert.equal(result.name, "onError");
      assert.equal(result.args[0].text, "recovery-budget-exceeded");
      assert.equal(session.sessionBytes, path === "declared" ? 0 : 9);
      assert.equal(session.activeRequests, 0);
    }
  });
  await t.test("body stalls after headers hit body-inclusive deadline and close transport", async () => {
    const { Loader, session } = make({ manifestDeadlineMs: 200 });
    const connected = new Promise((resolve) => waiting.set("/slow-body", (res) => resolve(once(res, "close"))));
    const pending = request(Loader, `${base}/slow-body`);
    const result = await pending.terminal;
    assert.equal(result.name, "onTimeout");
    await connected;
    assert.equal(session.activeRequests, 0);
    assert.deepEqual(pending.events, ["onTimeout"]);
  });
  await t.test("session cancellation closes pending HTTP response", async () => {
    const owner = new AbortController();
    const { Loader, session } = make({}, owner.signal);
    let responseClosed;
    const connected = new Promise((resolve) => waiting.set("/cancel", (res) => {
      responseClosed = once(res, "close"); resolve();
    }));
    const pending = request(Loader, `${base}/cancel`);
    await connected; owner.abort();
    assert.equal((await pending.terminal).name, "onAbort");
    await responseClosed;
    assert.equal(session.activeRequests, 0);
    assert.deepEqual(pending.events, ["onAbort"]);
  });
  await t.test("caller authorization and byte ranges issue zero HTTP requests", async () => {
    const { Loader } = make();
    for (const extra of [{ headers: { Authorization: "synthetic-private" } }, { headers: { Cookie: "synthetic-private" } }, { rangeStart: 4, rangeEnd: 10 }]) {
      assert.equal((await request(Loader, `${base}/must-not-fetch`, extra).terminal).name, "onError");
    }
    assert.equal(observed.some((row) => row.path === "/must-not-fetch"), false);
    assert.ok(observed.every((row) => !row.authorization && !row.cookie && !row.range));
  });
});
