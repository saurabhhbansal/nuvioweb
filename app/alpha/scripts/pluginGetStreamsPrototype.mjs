// Test-only narrow GYK-shaped API adapter, NOT installed-plugin support.
// No GYK source is copied. See the pinned API comparison in docs/agent-runs/.
import { normalizePluginDescriptor, normalizePluginHost } from "../js/core/plugins/pluginContract.js";
import { executePluginWithNetworkPrototype } from "./pluginSandboxNetworkPrototype.mjs";
import { pluginMediaInput } from "./pluginPrototypeInput.mjs";

function allowedSerializedResult(raw) {
  return Array.isArray(raw) && raw.length === 1 && raw.every((group) =>
    group && typeof group === "object" && Array.isArray(group.streams) && group.streams.every((stream) =>
      stream && typeof stream === "object" && !Array.isArray(stream) &&
      !["headers", "subtitles", "infoHash", "behaviorHints"].some((key) => Object.hasOwn(stream, key)) &&
      (!Object.hasOwn(stream, "url") || typeof stream.url === "string")));
}

export async function executeGetStreamsPrototype({ descriptor, approvedHosts = [], input = {}, transport, signal, limits, brokerLimits } = {}) {
  const checked = normalizePluginDescriptor(descriptor);
  if (!checked.ok) return { ok: false, error: "descriptor" };
  const plugin = checked.descriptor;
  const approved = new Set((Array.isArray(approvedHosts) ? approvedHosts : []).map(normalizePluginHost).filter(Boolean));
  if (plugin.allowedHosts.some((host) => !approved.has(host))) return { ok: false, error: "host-policy" };
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
    return stream && (stream.headers !== undefined || stream.subtitles !== undefined || stream.infoHash !== undefined || stream.behaviorHints !== undefined ||
      (stream.url !== undefined && typeof stream.url !== "string"));
  })) throw new Error("unsupported-output");
  return [{ sourceId: ${JSON.stringify(plugin.id)}, sourceName: ${JSON.stringify(plugin.name)}, streams: streams }];
}`;
  // Only media identity enters the guest; no settings/API keys/tokens are copied.
  const safeInput = pluginMediaInput(input);
  const result = await executePluginWithNetworkPrototype({
    code, input: safeInput, allowedHosts: plugin.allowedHosts, transport, signal,
    limits: { ...limits, logs: 0 }, brokerLimits, validateResult: allowedSerializedResult
  });
  // No plugin logs, source, raw exceptions or extra host diagnostics leave here.
  return result.ok ? { ok: true, groups: result.groups, dropped: result.dropped } : { ok: false, error: result.error };
}
