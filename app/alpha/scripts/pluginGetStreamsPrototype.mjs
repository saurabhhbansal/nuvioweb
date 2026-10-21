// Test-only narrow GYK-shaped API adapter, NOT installed-plugin support.
// No GYK source is copied. See the pinned API comparison in docs/agent-runs/.
import { normalizePluginDescriptor } from "../js/core/plugins/pluginContract.js";
import { executePluginWithNetworkPrototype } from "./pluginSandboxNetworkPrototype.mjs";

export async function executeGetStreamsPrototype({ descriptor, input = {}, transport, signal, limits, brokerLimits } = {}) {
  const checked = normalizePluginDescriptor(descriptor);
  if (!checked.ok) return { ok: false, error: "descriptor" };
  const plugin = checked.descriptor;
  // Guest-only compatibility shims. No browser/Node globals are provided; every
  // fetch still crosses the existing bounded broker with no headers or secrets.
  const code = `
var fetch = async function(url, options) {
  options = options === undefined ? {} : options;
  if (!options || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).some(function(key) { return key !== "method"; }) ||
      (options.method !== undefined && options.method !== "GET")) throw new Error("unsupported-request");
  var response = api.fetch(String(url));
  if (typeof response.body !== "string") throw new Error("unsupported-response");
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status, url: response.url,
    text: async function() { return response.body; },
    json: async function() { return JSON.parse(response.body); }
  };
};
var __entry = (function() {
  var module = { exports: {} };
  var exports = module.exports;
  ${plugin.code}
  return typeof module.exports.getStreams === "function" ? module.exports.getStreams :
    typeof getStreams === "function" ? getStreams : null;
})();
async function resolve(api, input) {
  if (!__entry) throw new Error("unsupported-entry");
  var streams = await __entry(String(input.tmdbId || ""), input.mediaType, input.season, input.episode);
  if (!Array.isArray(streams)) throw new Error("unsupported-output");
  if (streams.some(function(stream) {
    return stream && (stream.headers !== undefined || stream.subtitles !== undefined || stream.infoHash !== undefined ||
      (stream.url !== undefined && typeof stream.url !== "string"));
  })) throw new Error("unsupported-output");
  return [{ sourceId: ${JSON.stringify(plugin.id)}, sourceName: ${JSON.stringify(plugin.name)}, streams: streams }];
}`;
  // Only media identity enters the guest; no settings/API keys/tokens are copied.
  const safeInput = {
    tmdbId: typeof input.tmdbId === "string" || Number.isSafeInteger(input.tmdbId) ? String(input.tmdbId).slice(0, 40) : "",
    mediaType: input.mediaType === "tv" ? "tv" : "movie",
    season: Number.isSafeInteger(input.season) && input.season > 0 ? input.season : null,
    episode: Number.isSafeInteger(input.episode) && input.episode > 0 ? input.episode : null
  };
  const result = await executePluginWithNetworkPrototype({
    code, input: safeInput, allowedHosts: plugin.allowedHosts, transport, signal,
    limits: { ...limits, logs: 0 }, brokerLimits
  });
  // No plugin logs, source, raw exceptions or extra host diagnostics leave here.
  return result.ok ? { ok: true, groups: result.groups, dropped: result.dropped } : { ok: false, error: result.error };
}
