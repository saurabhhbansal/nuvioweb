// Reference plugin request proxy (Cloudflare Workers module syntax), contract v2.
// For running a proxy for yourself only. The project never deploys or hosts it.
// See docs/PLUGIN_PROXY_DECISION.md.
//
// Restrictions, all required:
// - PROXY_TOKENS: comma-separated bearer tokens; requests without one are rejected.
// - ALLOWED_HOSTS: comma-separated host names. "*" allows any public host; the
//   token is then the only gate, so keep it secret and the proxy to yourself.
// - Per-token rate limit (best effort, per isolate).
// - Only GET/POST, https targets, no private or loopback targets, redirects
//   followed here with every hop re-checked, responses over MAX_BYTES and
//   audio/video refused (no media relay).
//
// Request:  GET|POST <proxy>?v=2&u=<base64url target>&h=<base64url JSON headers>[&r=manual]
// Response: 200 with the upstream body and
//   x-proxy-status     upstream status
//   x-proxy-final-url  URL after redirects
//   x-proxy-headers    base64url JSON of upstream headers (set-cookie as a list)
// Any other status is the proxy's own refusal or failure.

const RATE_LIMIT_PER_MINUTE = 240;
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const FORWARDED_HEADERS = new Set(["accept", "accept-language", "content-type", "cookie", "origin", "referer", "user-agent", "x-requested-with"]);
const EXPOSED = "x-proxy-status, x-proxy-final-url, x-proxy-headers";
const buckets = new Map();

function list(value, lower = true) {
  return String(value || "").split(",").map((entry) => (lower ? entry.trim().toLowerCase() : entry.trim())).filter(Boolean);
}

function isPrivateHost(host) {
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")
    || /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host)
    || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
    || host.startsWith("[");
}

function rateLimited(token, now = Date.now()) {
  const bucket = buckets.get(token);
  if (!bucket || now - bucket.start > 60_000) {
    buckets.set(token, { start: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_PER_MINUTE;
}

function reply(status, body, extra = {}) {
  return new Response(body, {
    status,
    headers: { "access-control-allow-origin": "*", "access-control-expose-headers": EXPOSED, ...extra }
  });
}

function fromBase64Url(value) {
  const padded = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function allowedTarget(url, allowed) {
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (isPrivateHost(host)) return false;
  return allowed.includes("*") || allowed.includes(host);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return reply(204, null, { "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST" });
    }
    if (!["GET", "POST"].includes(request.method)) return reply(405, "Method not allowed");
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token || !list(env.PROXY_TOKENS, false).includes(token)) return reply(401, "Token required");
    if (rateLimited(token)) return reply(429, "Rate limit");

    const params = new URL(request.url).searchParams;
    const allowed = list(env.ALLOWED_HOSTS);
    let target;
    let sent;
    try {
      target = new URL(fromBase64Url(params.get("u")));
      sent = JSON.parse(params.get("h") ? fromBase64Url(params.get("h")) : "{}");
    } catch {
      return reply(400, "Bad request");
    }
    if (!allowedTarget(target, allowed)) return reply(403, "Host not allowed");

    const headers = new Headers();
    Object.entries(sent || {}).forEach(([key, value]) => {
      if (FORWARDED_HEADERS.has(key.toLowerCase())) headers.set(key, String(value));
    });
    let method = request.method;
    let body = method === "POST" ? await request.arrayBuffer() : undefined;
    const manual = params.get("r") === "manual";

    let upstream;
    for (let hop = 0; ; hop += 1) {
      upstream = await fetch(target, { method, headers, body, redirect: "manual" });
      const location = upstream.headers.get("location");
      if (manual || !location || upstream.status < 300 || upstream.status >= 400 || hop >= MAX_REDIRECTS) break;
      target = new URL(location, target);
      if (!allowedTarget(target, allowed)) return reply(403, "Host not allowed");
      if (upstream.status === 303 || ((upstream.status === 301 || upstream.status === 302) && method === "POST")) {
        method = "GET";
        body = undefined;
      }
    }

    const type = upstream.headers.get("content-type") || "application/octet-stream";
    if (/^(video|audio)\//i.test(type)) return reply(415, "No media relay");
    if (Number(upstream.headers.get("content-length") || 0) > MAX_BYTES) return reply(413, "Too large");
    const data = await upstream.arrayBuffer();
    if (data.byteLength > MAX_BYTES) return reply(413, "Too large");

    const upstreamHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (key !== "set-cookie") upstreamHeaders[key] = value;
    });
    const cookies = typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
    if (cookies.length) upstreamHeaders["set-cookie"] = cookies;

    return reply(200, data, {
      "content-type": type,
      "x-proxy-status": String(upstream.status),
      "x-proxy-final-url": target.href,
      "x-proxy-headers": toBase64Url(JSON.stringify(upstreamHeaders))
    });
  }
};
