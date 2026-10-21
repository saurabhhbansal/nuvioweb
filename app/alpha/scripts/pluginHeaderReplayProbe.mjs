// Manual-only, deterministic synthetic replay. No live provider transport.
import assert from "node:assert/strict";
import { acquirePublicSource, probePluginSource } from "./pluginSourceProbe.mjs";
const tap = "https://raw.githubusercontent.com/phisher98/nuvio-providers/6f88d1c6bddabf30d0768d76224d600ac32bab7c/providers/";
const pins = [
  ["xprime", tap + "xprime.js", 36936, "279882bcb321cde7e57722251ae2b96fda8e9549b0cb17e78cc8d44866e1e150", ["xprime.tv", "api.themoviedb.org"]],
  ["hdhub4u", tap + "hdhub4u.js", 59747, "eb859d79ac773aabe62c720c6890cd32e17669995675ff34c16ae0db7cf70256", ["hdhub4u.frl", "api.themoviedb.org"]],
  ["vixsrc", tap + "vixsrc.js", 12214, "f3a4107c2a43d3e239b571a0068ba053c457872fef7b76cff3f94affa4005a6c", ["vixsrc.to", "api.themoviedb.org"]],
  ["penguplay", "https://raw.githubusercontent.com/G2nOOn/Nuvio-Plugin/58c3708a491914f5c1439f6f3ddb3269b8b0ca8e/providers/2peckle.js", 13046, "08fc26eaf2d375b86549de848bea0a289cae12c64c689f33c452e005c5dc28b0", ["pengu.uk", "api.themoviedb.org"]]
].filter(row => !process.argv[2] || row[0] === process.argv[2]);
assert.ok(pins.length > 0, "known provider selection");
const providerHeaders = {
  xprime: ["User-Agent", "Accept", "Accept-Language", "Accept-Encoding"],
  hdhub4u: ["User-Agent", "Referer", "Origin", "Accept", "Accept-Language"],
  vixsrc: ["User-Agent", "Accept", "Accept-Language", "Accept-Encoding"],
  penguplay: ["User-Agent", "Accept"]
};
const metadata = JSON.stringify({ id: 453405, title: "Replay fixture", name: "Replay fixture", release_date: "2024-01-01", imdb_id: "tt1386697", external_ids: { imdb_id: "tt1386697" } });
const streams = JSON.stringify({ streams: ["1080p", "2160p"].map(quality => ({
  name: `2peckle synthetic fixture ${quality} HEVC`, title: `Replay fixture ${quality}`,
  description: "Hindi English Dual Audio HEVC x265 H.265 10bit",
  url: `https://media.example/fixture-${quality}.mkv`, quality, size: 1073741824,
  behaviorHints: { videoSize: 1073741824, filename: `Fixture.${quality}.Hindi.HEVC.mkv`, bingeGroup: `${quality} Hindi HEVC` }
})) });
const sources = [];
for (let i = 0; i < pins.length; i += 2) sources.push(...await Promise.all(pins.slice(i, i + 2).map(async ([id, url, bytes, sha256, hosts]) => ({ id, hosts, source: await acquirePublicSource(url, { bytes, sha256 }) }))));
const providers = [];
for (const { id, hosts, source } of sources) {
  const dispatches = [], lookups = [];
  const resolveHost = async host => { assert.ok(hosts.includes(host)); lookups.push(host); return ["93.184.216.34"]; };
  const transport = async (raw, options) => {
    const url = new URL(raw);
    assert.ok(hosts.includes(url.hostname)); assert.equal(options.redirect, "manual"); assert.equal(options.credentials, "omit");
    assert.deepEqual(options.addresses, ["93.184.216.34"]);
    const event = { host: url.hostname, headers: Object.keys(options.headers).sort(), route: "unmatched", status: 0 };
    dispatches.push(event);
    if (url.hostname === "api.themoviedb.org" && /^\/3\/(?:movie|tv)\/453405(?:\/external_ids)?$/.test(url.pathname)) {
      event.route = "metadata-redirect"; event.status = 302;
      return { status: 302, headers: { location: "/__fixture/metadata.json" }, body: "" };
    }
    if (url.hostname === "api.themoviedb.org" && url.pathname === "/__fixture/metadata.json") {
      event.route = "metadata"; event.status = 200; return { status: 200, body: metadata };
    }
    if (url.hostname === "pengu.uk" && /\/stream\/movie\/(?:tt1386697|453405|tmdb:453405)\.json$/.test(url.pathname)) {
      event.route = "stream-list"; event.status = 200; return { status: 200, body: streams };
    }
    throw new Error("replay-unmatched-request");
  };
  const result = await probePluginSource({ source, id, hosts, transport, resolveHost, headerPolicy: Object.fromEntries(hosts.map(h => [h, providerHeaders[id]])) });
  const observed = result.diagnostic.observation;
  assert.equal(result.diagnostic.ok, true, "bounded diagnostic completed");
  assert.equal(result.actual.normalizedRows, 0, "no unsupported row counted as adapter acceptance");
  assert.equal(dispatches.some(event => event.route === "unmatched"), false, "no generic replay success or unnoticed route miss");
  if (id === "penguplay") {
    assert.equal(observed.rows, 2, "unchanged source extracts both explicit provider-tagged quality fixtures");
    assert.equal(observed.rowsWithHeaders, 2);
    assert.deepEqual(observed.networkRefusals, []);
    assert.equal(result.actual.error, "playback-headers");
  }
  if (id === "hdhub4u") { assert.equal(observed.bootstrapOk, false); assert.equal(observed.observedImport, "cheerio-without-node-native"); }
  if (id === "vixsrc") { assert.deepEqual(observed.networkRefusals, ["header-policy"]); assert.ok(observed.observedHeaderNames.includes("connection")); }
  if (id === "xprime") assert.deepEqual(observed.networkRefusals, ["host"]);
  const actualEvents = dispatches.slice(0, result.actual.transportDispatches);
  providers.push({
    id, sourceBytes: source.bytes, sourceSha256: source.sha256, sourceChanged: false,
    getStreamsInvoked: observed.entryFunction, rawRowsFromSeparateDiagnosticVm: observed.rows,
    rawRowsWithPlaybackHeaders: observed.rowsWithHeaders, adapterAcceptedRows: result.actual.normalizedRows,
    adapterError: result.actual.error, diagnosticRefusals: observed.networkRefusals,
    importRefused: observed.observedImport, observedHeaderNames: observed.observedHeaderNames,
    usedHeaderNames: [...new Set(actualEvents.flatMap(e => e.headers))].sort(),
    usedHosts: [...new Set(actualEvents.map(e => e.host))].sort(),
    dispatches: { adapter: result.actual.transportDispatches, diagnostic: result.diagnostic.transportDispatches },
    checkedRedirects: { adapter: actualEvents.filter(e => e.status === 302).length, diagnostic: dispatches.slice(actualEvents.length).filter(e => e.status === 302).length },
    addressChecksAcrossBothVms: lookups.length, unexpectedReplayRoutes: dispatches.filter(e => e.route === "unmatched").length
  });
}
console.log(JSON.stringify({
  issue: 11, disposition: "PARTIAL_NO_PLAYABLE_STREAM_ACCEPTANCE", engine: "QuickJS/WASM Asyncify0.32.0",
  userVisibleCapabilityChanged: "none; application execution remains disabled", sourceWrittenToDisk: false,
  transport: "synthetic deterministic routes, not recorded live responses", liveProviderReads: 0,
  dnsAddressesAreFixtures: true, liveSocketPinningProved: false, ownerCredentialsInjected: false,
  unchangedLimits: { timeMs:250, memoryBytes:16777216, stackBytes:65536, outputBytes:65536, sourceBytes:262144, brokerRequests:4, responseBytes:262144, totalResponseBytes:1048576, redirects:2, retainedLogs:0 },
  headerLimits: { count:16, valueBytes:1024, totalBytes:8192, optionJsonBytes:12288 },
  providers
}, null, 2));
