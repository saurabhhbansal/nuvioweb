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

// The user agent the desktop app sends when a plugin sets none. Sites often
// refuse requests without a browser-like one.
export const DEFAULT_PLUGIN_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function utf8ToBase64Url(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUtf8(value) {
  const padded = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function hasHeader(headers, name) {
  const wanted = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === wanted);
}

// Proxy contract v2. The target, headers and redirect mode travel base64url
// encoded: plain URLs and user-agent strings in a query string trip CDN
// firewalls in front of the proxy, which answer without CORS headers. The
// proxy answers 200 and reports the upstream status, final URL and headers in
// x-proxy-* response headers, so redirects and Set-Cookie survive the trip.
export function buildProxyRequest(proxy, targetUrl, init = {}) {
  const url = new URL(proxy.url);
  url.searchParams.set("v", "2");
  url.searchParams.set("u", utf8ToBase64Url(targetUrl));
  const headers = plainHeaders(init.headers);
  if (!hasHeader(headers, "user-agent")) headers["User-Agent"] = DEFAULT_PLUGIN_USER_AGENT;
  url.searchParams.set("h", utf8ToBase64Url(JSON.stringify(headers)));
  if (init.redirect === "manual") url.searchParams.set("r", "manual");
  const proxyHeaders = {};
  if (proxy.token) proxyHeaders.Authorization = `Bearer ${proxy.token}`;
  const method = String(init.method || "GET").toUpperCase() === "POST" ? "POST" : "GET";
  if (method === "POST" && init.body != null) {
    proxyHeaders["Content-Type"] = headers["Content-Type"] || headers["content-type"] || "text/plain";
  }
  return {
    url: url.href,
    init: {
      method,
      headers: proxyHeaders,
      body: method === "POST" ? init.body ?? undefined : undefined,
      credentials: "omit",
      signal: init.signal
    }
  };
}

// A response shaped like the desktop app's fetch result: the upstream status,
// final URL and every header (Set-Cookie included), and json() that resolves
// to null instead of throwing on a non-JSON body.
export function createPluginResponse({ status, url, headers = {}, bytes }) {
  const lower = {};
  Object.entries(headers || {}).forEach(([key, value]) => {
    lower[String(key).toLowerCase()] = Array.isArray(value) ? value.map(String) : String(value);
  });
  const read = (name) => {
    const value = lower[String(name).toLowerCase()];
    if (value == null) return null;
    return Array.isArray(value) ? value.join(", ") : value;
  };
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  const text = () => new TextDecoder().decode(data);
  const headerApi = {
    get: read,
    has: (name) => read(name) != null,
    getSetCookie: () => [].concat(lower["set-cookie"] || []),
    forEach: (callback) => Object.keys(lower).forEach((key) => callback(read(key), key)),
    entries: () => Object.keys(lower).map((key) => [key, read(key)])[Symbol.iterator](),
    [Symbol.iterator]: () => Object.keys(lower).map((key) => [key, read(key)])[Symbol.iterator]()
  };
  const response = {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    url,
    redirected: false,
    headers: headerApi,
    text: async () => text(),
    json: async () => {
      try {
        const body = text();
        return body === "" ? null : JSON.parse(body);
      } catch {
        return null;
      }
    },
    arrayBuffer: async () => data.slice().buffer,
    clone: () => createPluginResponse({ status, url, headers, bytes: data })
  };
  return response;
}

async function readProxyResponse(response, targetUrl) {
  const rawStatus = response.headers?.get?.("x-proxy-status");
  const status = Number(rawStatus);
  if (!rawStatus || !Number.isInteger(status) || status < 100) {
    // The proxy itself refused or failed (bad token, blocked host, rate limit).
    throw new TypeError(`Plugin proxy error ${response.status}`);
  }
  let headers = {};
  try {
    headers = JSON.parse(base64UrlToUtf8(response.headers.get("x-proxy-headers") || "")) || {};
  } catch {
    headers = {};
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return createPluginResponse({
    status,
    url: response.headers.get("x-proxy-final-url") || targetUrl,
    headers,
    bytes
  });
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
      const response = await fetchImpl(request.url, request.init);
      return readProxyResponse(response, target);
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
