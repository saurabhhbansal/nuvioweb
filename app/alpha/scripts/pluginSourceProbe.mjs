// Manual-source diagnostics only. No app/CI import, guest host-global copying,
// real provider transport, raw source persistence or raw exception/log export.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { executeGetStreamsPrototype } from "./pluginGetStreamsPrototype.mjs";
import { executePluginWithNetworkPrototype } from "./pluginSandboxNetworkPrototype.mjs";

export async function acquirePublicSource(url, expected = {}) {
  const destination = new URL(url);
  assert.equal(destination.origin, "https://raw.githubusercontent.com", "fixed public source origin");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, "public source status");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    assert.ok(bytes <= 256 * 1024, "public source acquisition ceiling");
    chunks.push(chunk);
  }
  const source = Buffer.concat(chunks);
  const sha256 = createHash("sha256").update(source).digest("hex");
  const code = source.toString("utf8");
  assert.ok(Buffer.from(code, "utf8").equals(source), "identical source UTF-8 round trip");
  if (expected.bytes !== undefined) assert.equal(bytes, expected.bytes, "pinned bytes");
  if (expected.sha256 !== undefined) assert.equal(sha256, expected.sha256, "pinned digest");
  return { code, bytes, sha256 };
}

const apis = ["console", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "TextDecoder", "TextEncoder", "URL", "URLSearchParams", "atob", "btoa", "fetch", "AbortController", "AbortSignal", "Buffer", "Headers", "Request", "Response", "crypto", "require", "cheerio", "CryptoJS", "window", "document", "DOMParser", "self", "global", "navigator", "performance"];
const modules = ["cheerio", "cheerio-without-node-native", "crypto-js", "axios", "fs", "path", "crypto", "buffer", "url", "node:fs", "node:path", "node:crypto"];
const optionNames = ["method", "headers", "body", "signal", "redirect", "credentials", "mode", "cache", "timeout", "agent"];
const methodNames = ["GET", "POST", "HEAD", "PUT", "DELETE", "PATCH", "OPTIONS"];
const streamFields = ["name", "title", "url", "quality", "size", "headers", "provider", "format", "infoHash", "behaviorHints"];
const booleanFields = ["bootstrapOk", "entryFunction", "invocationResolved", "returnedArray", "requestHeadersPresent", "unsupportedOtherOption", "sampleHasHeaders", "headerScanTruncated"];
const countFields = ["rows", "fetchAttempts", "unsupportedRequestRejections", "rowsWithHeaders"];
const refusalNames = ["header-shape", "header-policy", "header-duplicate", "header-value", "header-size", "header-origin", "request-options", "request-size", "dns-policy", "dns", "private-address", "redirect-mode", "redirect-disallowed", "redirect-unvalidated", "url", "scheme", "credentials", "host", "port", "ip", "method", "requests", "redirect-limit", "redirect-url", "response-size", "response-total", "response-body", "transport", "cancelled", "timeout"];
const headerNames = ["user-agent", "referer", "origin", "accept", "accept-language", "accept-encoding", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "sec-fetch-user", "content-type", "authorization", "cookie", "connection", "upgrade-insecure-requests", "cache-control", "pragma", "dnt", "other"];
const arrayFields = { observedOptions: optionNames, observedMethods: methodNames, missingGlobals: apis, sampleFields: streamFields, networkRefusals: refusalNames, observedHeaderNames: headerNames };
const fields = [...booleanFields, ...countFields, ...Object.keys(arrayFields), "missingApi", "caughtErrorName", "observedImport"];

export async function probePluginSource({ source, id, hosts, transport: replayTransport, headerPolicy, resolveHost }) {
  assert.ok(source && createHash("sha256").update(source.code).digest("hex") === source.sha256, "unaltered descriptor.code");
  let transportCalls = 0;
  const transport = async (...args) => { transportCalls++; return replayTransport ? replayTransport(...args) : { status: 200, body: "{}" }; };
  const actual = await executeGetStreamsPrototype({
    descriptor: { id, name: id, code: source.code, allowedHosts: hosts }, approvedHosts: hosts,
    input: { tmdbId: 453405, mediaType: "movie" }, transport, headerPolicy, resolveHost
  });
  const actualDispatches = transportCalls;
  // Exact adapter prelude, not a looser fake-fetch implementation. Diagnostics
  // wrap outside source bytes; require only throws and never resolves a module.
  const adapter = await readFile(new URL("./pluginGetStreamsPrototype.mjs", import.meta.url), "utf8");
  const prefix = adapter.slice(adapter.indexOf("var console ="), adapter.indexOf("var __entry ="));
  assert.ok(prefix.startsWith("var console =") && prefix.includes("unsupported-request"), "diagnostic prelude");
  const diagnosticCode = prefix + `
var __probe = { bootstrapOk:false, entryFunction:false, invocationResolved:false, returnedArray:false, rows:0,
  fetchAttempts:0, unsupportedRequestRejections:0, requestHeadersPresent:false, unsupportedOtherOption:false,
  sampleHasHeaders:false, headerScanTruncated:false, rowsWithHeaders:0, sampleFields:[],
  missingApi:'none', caughtErrorName:'none', observedOptions:[], observedMethods:[], missingGlobals:[], observedImport:'none', networkRefusals:[], observedHeaderNames:[] };
function __classify(e) {
  if (e && ['ReferenceError','TypeError','Error','SyntaxError'].indexOf(e.name) !== -1) __probe.caughtErrorName = e.name;
  var message = typeof e === 'string' ? e : e instanceof Error ? String(e.message) : '';
  var network = /plugin-network:([a-z-]+)/.exec(message);
  if (network && ${JSON.stringify(refusalNames)}.indexOf(network[1]) !== -1 && __probe.networkRefusals.indexOf(network[1]) === -1) __probe.networkRefusals.push(network[1]);
  ${JSON.stringify(apis)}.forEach(function(name) {
    if (message === name + ' is not defined' || message === "'" + name + "' is not defined" || message === 'ReferenceError: ' + name + ' is not defined') {
      __probe.missingApi = name;
      if (__probe.missingGlobals.indexOf(name) === -1) __probe.missingGlobals.push(name);
    }
  });
}
var __observe = function() {
  for (var i = 0; i < arguments.length; i++) if (arguments[i] instanceof Error || typeof arguments[i] === 'string') __classify(arguments[i]);
};
console = Object.freeze({ log:__observe, info:__observe, warn:__observe, debug:__observe, error:__observe });
var require = function(name) {
  __probe.observedImport = ${JSON.stringify(modules)}.indexOf(name) !== -1 ? name : 'other-module';
  throw new Error('unsupported-module');
};
var __strictFetch = fetch;
fetch = async function(url, options) {
  __probe.fetchAttempts++;
  if (options && typeof options === 'object') {
    if (Object.prototype.hasOwnProperty.call(options, 'headers')) __probe.requestHeadersPresent = true;
    if (Object.keys(options).some(function(k) { return ['method','headers','redirect'].indexOf(k) === -1; })) __probe.unsupportedOtherOption = true;
    if (options.headers && typeof options.headers === 'object') Object.keys(options.headers).forEach(function(k) {
      var name = k.toLowerCase();
      if (${JSON.stringify(headerNames)}.indexOf(name) === -1) name = 'other';
      if (__probe.observedHeaderNames.indexOf(name) === -1) __probe.observedHeaderNames.push(name);
    });
    ${JSON.stringify(optionNames)}.forEach(function(k) {
      if (Object.prototype.hasOwnProperty.call(options, k) && __probe.observedOptions.indexOf(k) === -1) __probe.observedOptions.push(k);
    });
    ${JSON.stringify(methodNames)}.forEach(function(m) {
      if (options.method === m && __probe.observedMethods.indexOf(m) === -1) __probe.observedMethods.push(m);
    });
  }
  try { return await __strictFetch(url, options); }
  catch (e) {
    if (e instanceof Error && e.message === 'unsupported-request') __probe.unsupportedRequestRejections++;
    __classify(e);
    throw e;
  }
};
var __entry = null;
try {
  __entry = (function() { var module = { exports:{} }; var exports = module.exports;
${source.code}
;return typeof module.exports.getStreams === 'function' ? module.exports.getStreams : typeof getStreams === 'function' ? getStreams : null; })();
  __probe.bootstrapOk = true;
} catch (e) { __classify(e); }
async function resolve(api, input) {
  __probe.entryFunction = typeof __entry === 'function';
  if (__probe.entryFunction) try {
    var rows = await __entry('453405', 'movie', undefined, undefined);
    __probe.invocationResolved = true; __probe.returnedArray = Array.isArray(rows);
    __probe.rows = Array.isArray(rows) ? rows.length : 0;
    if (Array.isArray(rows)) {
      __probe.headerScanTruncated = rows.length > 50;
      rows.slice(0, 50).forEach(function(row) {
        if (row && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row,'headers')) __probe.rowsWithHeaders++;
      });
      var first = rows[0];
      if (first && typeof first === 'object') {
        __probe.sampleFields = ${JSON.stringify(streamFields)}.filter(function(k) { return Object.prototype.hasOwnProperty.call(first,k); });
        __probe.sampleHasHeaders = Object.prototype.hasOwnProperty.call(first,'headers');
      }
    }
  } catch (e) { __classify(e); }
  return [__probe];
}`;
  let observation;
  const diagnostic = await executePluginWithNetworkPrototype({
    code: diagnosticCode, allowedHosts: hosts, transport, headerPolicy, resolveHost, limits: { logs: 0 },
    validateResult(raw) {
      if (!Array.isArray(raw) || raw.length !== 1 || !raw[0] ||
          Object.keys(raw[0]).sort().join("|") !== [...fields].sort().join("|")) return false;
      const p = raw[0];
      if (!["none", ...apis].includes(p.missingApi) || !["none", "ReferenceError", "TypeError", "Error", "SyntaxError"].includes(p.caughtErrorName)) return false;
      if (!["none", "other-module", ...modules].includes(p.observedImport)) return false;
      if (booleanFields.some((k) => typeof p[k] !== "boolean")) return false;
      if (countFields.some((k) => !Number.isSafeInteger(p[k]) || p[k] < 0 || p[k] > 1000)) return false;
      for (const [key, allowed] of Object.entries(arrayFields)) {
        if (!Array.isArray(p[key]) || p[key].length > allowed.length || p[key].some((x) => !allowed.includes(x))) return false;
      }
      observation = Object.fromEntries(fields.map((k) => [k, p[k]]));
      return true;
    }
  });
  const rows = actual.groups?.flatMap((group) => group.streams) ?? [];
  const literalModules = [...source.code.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
  return {
    id, sourceBytes: source.bytes, sourceSha256: source.sha256, sourceChanged: false, sourceWrittenToDisk: false,
    sourceSyntax: { asyncKeywordMentioned: /\basync\b/.test(source.code), awaitKeywordMentioned: /\bawait\b/.test(source.code),
      literalRequireReferences: [...new Set(literalModules.filter((m) => modules.includes(m)))], unknownLiteralRequireCount: literalModules.filter((m) => !modules.includes(m)).length,
      headersFieldMentioned: /\bheaders\s*:/.test(source.code) },
    actual: { attempted: true, ok: actual.ok, error: actual.error ?? null, normalizedRows: rows.length,
      normalizedRowsSha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex"), transportDispatches: actualDispatches },
    diagnostic: { ok: diagnostic.ok, error: diagnostic.error ?? null, transportDispatches: transportCalls - actualDispatches, observation: observation ?? null },
    totalTransportDispatches: transportCalls, liveProviderRequests: 0
  };
}
