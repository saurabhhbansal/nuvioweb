// Test-only policy broker. Transport must independently enforce streamed byte,
// DNS/private-address, redirect and credential policy before real I/O is added.
import { normalizePluginHost, PLUGIN_CONTRACT_LIMITS } from "./pluginContract.js";
import { pluginHeaderPolicy, pluginRequestHeaders, isPublicPluginAddress } from "./pluginRequestPolicy.js";

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const IP_HOST = /^(?:\d{1,3}(?:\.\d{1,3}){3}|\[.*\])$/;
export const PLUGIN_BROKER_CEILINGS = Object.freeze({
  maxRequests: 32, maxResponseBytes: 1024 * 1024,
  maxTotalResponseBytes: 4 * 1024 * 1024, maxRedirects: 5
});

function byteSize(body) {
  if (body == null) return 0;
  if (typeof body === "string") return new TextEncoder().encode(body).length;
  if (body instanceof Uint8Array) return body.byteLength;
  if (body instanceof ArrayBuffer) return body.byteLength;
  return null;
}

// Do not rely on a transport honoring abort. A late settlement must not resume
// a disposed VM; rejection handlers and the abort listener are always removed.
async function dispatch(transport, url, signal, options = {}) {
  if (signal?.aborted) return null;
  let onAbort;
  const aborted = new Promise((resolve) => {
    onAbort = () => resolve(null);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => signal?.aborted ? null : transport(url, signal ? { method: "GET", ...options, signal } : { method: "GET", ...options })),
      aborted
    ]);
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

export function createPluginNetworkBroker({
  allowedHosts = [], transport, maxRequests = 8,
  maxResponseBytes = 1024 * 1024, maxTotalResponseBytes = 4 * 1024 * 1024,
  maxRedirects = 2, signal, headerPolicy = {}, resolveHost
} = {}) {
  if (typeof transport !== "function") throw new TypeError("transport must be a function");
  const headersAllowed = pluginHeaderPolicy(headerPolicy);
  if (resolveHost !== undefined && typeof resolveHost !== "function") throw new TypeError("invalid resolver");
  const limits = { maxRequests, maxResponseBytes, maxTotalResponseBytes, maxRedirects };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < (key === "maxRedirects" ? 0 : 1) || value > PLUGIN_BROKER_CEILINGS[key]) {
      throw new TypeError("invalid broker limits");
    }
  }
  const hosts = Array.isArray(allowedHosts) ? allowedHosts : [];
  const allowlist = new Set(hosts.map((host) => normalizePluginHost(host)).filter(Boolean));
  let requestCount = 0;
  let responseBytes = 0;

  const authorize = (raw) => {
    if (typeof raw !== "string") return { error: "url" };
    const value = raw.trim();
    if (!value || value.length > PLUGIN_CONTRACT_LIMITS.url) return { error: "url" };
    let parsed;
    try { parsed = new URL(value); } catch { return { error: "url" }; }
    if (parsed.protocol !== "https:") return { error: "scheme" };
    if (parsed.username || parsed.password) return { error: "credentials" };
    if (parsed.port && parsed.port !== "443") return { error: "port" };
    if (parsed.hostname && IP_HOST.test(parsed.hostname)) return { error: "ip" };
    const host = normalizePluginHost(parsed.hostname);
    if (!host || !allowlist.has(host)) return { error: "host" };
    return { url: parsed };
  };

  async function request(rawUrl, options = {}) {
    if (signal?.aborted) return { ok: false, error: "cancelled" };
    if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(k => !["method", "headers", "redirect"].includes(k))) return { ok: false, error: "request-options" };
    const redirectMode = options.redirect === undefined ? "follow" : options.redirect;
    if (!["follow", "error", "manual"].includes(redirectMode)) return { ok: false, error: "redirect-mode" };
    const method = String(options.method || "GET").toUpperCase();
    if (method !== "GET") return { ok: false, error: "method" };
    const first = authorize(rawUrl);
    if (first.error) return { ok: false, error: first.error };
    let current = first.url;
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      if (signal?.aborted) return { ok: false, error: "cancelled" };
      if (responseBytes >= maxTotalResponseBytes) return { ok: false, error: "response-total" };
      if (requestCount >= maxRequests) return { ok: false, error: "requests" };
      const validatedHeaders = pluginRequestHeaders(options.headers, current.hostname, headersAllowed, authorize);
      if (validatedHeaders.error) return { ok: false, error: validatedHeaders.error };
      if ((Object.keys(validatedHeaders.headers).length || options.redirect !== undefined) && !resolveHost) return { ok: false, error: "dns-policy" };
      // Every authorized dispatch, including redirects and failures, consumes
      // budget. Reserve synchronously so concurrent calls cannot oversubscribe.
      requestCount += 1;
      let response;
      let addresses;
      if (resolveHost) {
        try { addresses = await dispatch(resolveHost, current.hostname, signal); }
        catch { return { ok: false, error: signal?.aborted ? "cancelled" : "dns" }; }
        if (signal?.aborted) return { ok: false, error: "cancelled" };
        if (!Array.isArray(addresses) || !addresses.length || addresses.length > 16) return { ok: false, error: "dns" };
        if ([...addresses].some(address => !isPublicPluginAddress(address))) return { ok: false, error: "private-address" };
      }
      const safeOptions = resolveHost ? { redirect: "manual", credentials: "omit", addresses: [...addresses], headers: { ...validatedHeaders.headers } } : { redirect: "manual", credentials: "omit" };
      try { response = await dispatch(transport, current.href, signal, safeOptions); }
      catch { return { ok: false, error: signal?.aborted ? "cancelled" : "transport" }; }
      if (response?.redirected === true) return { ok: false, error: "redirect-unvalidated" };
      if (signal?.aborted) return { ok: false, error: "cancelled" };
      if (!response || typeof response !== "object") return { ok: false, error: "transport" };
      const status = Number(response.status);
      if (!Number.isInteger(status) || status < 100 || status > 599) return { ok: false, error: "transport" };
      // Redirect bodies also consume bytes. This is a post-materialization
      // policy bound, not a streaming transport allocation guarantee.
      const size = byteSize(response.body);
      if (size === null) return { ok: false, error: "response-body" };
      responseBytes += size;
      if (size > maxResponseBytes) return { ok: false, error: "response-size" };
      if (responseBytes > maxTotalResponseBytes) return { ok: false, error: "response-total" };
      const location = response.headers?.location;
      if (REDIRECT_STATUS.has(status)) {
        if (redirectMode === "error") return { ok: false, error: "redirect-disallowed" };
        if (redirectMode === "manual") return { ok: true, status, body: "", url: current.href, hops: hop };
        if (typeof location !== "string" || !location) return { ok: false, error: "redirect-url" };
        if (hop === maxRedirects) return { ok: false, error: "redirect-limit" };
        let next;
        try { next = new URL(String(location), current); } catch { return { ok: false, error: "redirect-url" }; }
        const authorized = authorize(next.href);
        if (authorized.error) return { ok: false, error: authorized.error };
        current = authorized.url;
        continue;
      }
      return { ok: true, status, body: response.body, url: current.href, hops: hop };
    }
    return { ok: false, error: "redirect-limit" };
  }

  return {
    request,
    get requestCount() { return requestCount; },
    get responseBytes() { return responseBytes; },
    allowedHosts: [...allowlist], limits
  };
}
