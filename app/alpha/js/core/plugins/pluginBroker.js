// Bounded network broker for the future plugin sandbox.
//
// A plugin runtime must never receive global fetch. This broker is the only
// network primitive the sandbox will expose: HTTPS only, exact allowlisted
// hostnames, per-hop redirect re-authorization, no credentials or headers, and
// hard request/response budgets. The transport is injected so tests use no real
// network and the future sandbox can supply a cancellation-aware adapter.
import { normalizePluginHost, PLUGIN_CONTRACT_LIMITS } from "./pluginContract.js";

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const IP_HOST = /^(?:\d{1,3}(?:\.\d{1,3}){3}|\[.*\])$/;

function byteSize(body) {
  if (body == null) return 0;
  if (typeof body === "string") return new TextEncoder().encode(body).length;
  if (body instanceof Uint8Array) return body.byteLength;
  if (body instanceof ArrayBuffer) return body.byteLength;
  return null;
}

export function createPluginNetworkBroker({
  allowedHosts = [],
  transport,
  maxRequests = 8,
  maxResponseBytes = 1024 * 1024,
  maxRedirects = 2
} = {}) {
  if (typeof transport !== "function") throw new TypeError("transport must be a function");
  const hosts = Array.isArray(allowedHosts) ? allowedHosts : [];
  const allowlist = new Set(hosts.map((host) => normalizePluginHost(host)).filter(Boolean));
  let requestCount = 0;

  const authorize = (raw) => {
    if (typeof raw !== "string") return { error: "url" };
    const value = raw.trim();
    if (!value || value.length > PLUGIN_CONTRACT_LIMITS.url) return { error: "url" };
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return { error: "url" };
    }
    if (parsed.protocol !== "https:") return { error: "scheme" };
    if (parsed.username || parsed.password) return { error: "credentials" };
    if (parsed.port && parsed.port !== "443") return { error: "port" };
    if (parsed.hostname && IP_HOST.test(parsed.hostname)) return { error: "ip" };
    const host = normalizePluginHost(parsed.hostname);
    if (!host) return { error: "host" };
    if (!allowlist.has(host)) return { error: "host" };
    return { url: parsed };
  };

  async function request(rawUrl, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    if (method !== "GET") return { ok: false, error: "method" };
    const first = authorize(rawUrl);
    if (first.error) return { ok: false, error: first.error };
    // Count only dispatches that passed URL policy so rejected input cannot
    // consume the budget, while every outbound request still counts.
    requestCount += 1;
    if (requestCount > maxRequests) return { ok: false, error: "requests" };
    let current = first.url;

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      let response;
      try {
        // Only the URL and method cross the boundary: never headers or tokens.
        response = await transport(current.href, { method: "GET" });
      } catch {
        return { ok: false, error: "transport" };
      }
      if (!response || typeof response !== "object") return { ok: false, error: "transport" };
      const status = Number(response.status);
      if (!Number.isInteger(status) || status < 100 || status > 599) return { ok: false, error: "transport" };

      const location = response.headers?.location;
      if (REDIRECT_STATUS.has(status) && location) {
        if (hop === maxRedirects) return { ok: false, error: "redirect-limit" };
        let next;
        try {
          next = new URL(String(location), current);
        } catch {
          return { ok: false, error: "redirect-url" };
        }
        const authorized = authorize(next.href);
        if (authorized.error) return { ok: false, error: authorized.error };
        current = authorized.url;
        continue;
      }

      const size = byteSize(response.body);
      if (size === null) return { ok: false, error: "response-body" };
      if (size > maxResponseBytes) return { ok: false, error: "response-size" };
      return { ok: true, status, body: response.body, url: current.href, hops: hop };
    }
    return { ok: false, error: "redirect-limit" };
  }

  return {
    request,
    get requestCount() {
      return requestCount;
    },
    allowedHosts: [...allowlist],
    limits: { maxRequests, maxResponseBytes, maxRedirects }
  };
}
