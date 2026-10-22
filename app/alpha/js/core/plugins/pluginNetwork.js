// Network policy shared by the repo loader (main thread) and the plugin worker.
// Plain functions only: this file is bundled into the worker too.

const PRIVATE_V4 = /^(?:0|10|127)\.|^169\.254\.|^192\.168\.|^172\.(?:1[6-9]|2\d|3[01])\./;

export class NeedsProxyError extends Error {
  constructor(message = "Request blocked by the browser; a proxy is needed") {
    super(message);
    this.name = "NeedsProxyError";
    this.needsProxy = true;
  }
}

// Plugins may only reach public http(s) hosts: never this app, loopback or the local network.
export function isBlockedTarget(value, appOrigin = globalThis.location?.origin || "") {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    return true;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return true;
  if (url.username || url.password) return true;
  if (appOrigin && url.origin === appOrigin) return true;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.startsWith("[") ||
    PRIVATE_V4.test(host)
  );
}

// The proxy must be https, except a proxy the user runs on this machine.
export function normalizeProxyUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return "";
    if (url.username || url.password || url.search || url.hash) return "";
    return url.href;
  } catch {
    return "";
  }
}

function plainHeaders(headers) {
  if (!headers) return {};
  if (typeof headers.forEach === "function" && !Array.isArray(headers)) {
    const out = {};
    headers.forEach((value, key) => {
      out[key] = String(value);
    });
    return out;
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [String(key), String(value)])
  );
}

export function buildProxyRequest(proxy, targetUrl, init = {}) {
  const url = new URL(proxy.url);
  url.searchParams.set("url", targetUrl);
  const headers = plainHeaders(init.headers);
  if (Object.keys(headers).length) url.searchParams.set("headers", JSON.stringify(headers));
  const proxyHeaders = {};
  if (proxy.token) proxyHeaders.Authorization = `Bearer ${proxy.token}`;
  if (init.body != null) proxyHeaders["Content-Type"] = headers["Content-Type"] || headers["content-type"] || "text/plain";
  return {
    url: url.href,
    init: {
      method: String(init.method || "GET").toUpperCase() === "POST" ? "POST" : "GET",
      headers: proxyHeaders,
      body: init.body ?? undefined,
      credentials: "omit",
      signal: init.signal
    }
  };
}

// fetch() for plugin code: blocks private targets, uses the proxy when set,
// never sends cookies, and turns CORS/network failures into NeedsProxyError.
export function createPluginFetch({ fetchImpl = globalThis.fetch, proxy = null, appOrigin, onNeedsProxy } = {}) {
  return async function pluginFetch(input, init = {}) {
    const target = typeof input === "string" ? input : String(input?.url || input || "");
    if (isBlockedTarget(target, appOrigin)) {
      throw new TypeError("Plugin request target is not allowed");
    }
    if (proxy?.url) {
      const request = buildProxyRequest(proxy, target, init);
      return fetchImpl(request.url, request.init);
    }
    try {
      return await fetchImpl(target, {
        method: init.method || "GET",
        headers: plainHeaders(init.headers),
        body: init.body ?? undefined,
        credentials: "omit",
        redirect: "follow",
        signal: init.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      onNeedsProxy?.();
      throw new NeedsProxyError();
    }
  };
}
