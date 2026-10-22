// Reference plugin request proxy (Cloudflare Workers module syntax).
// NOT deployed. See docs/PLUGIN_PROXY_DECISION.md before running it anywhere.
//
// Restrictions, all required:
// - PROXY_TOKENS: comma-separated bearer tokens; requests without one are rejected.
// - ALLOWED_HOSTS: comma-separated host names; any other target is rejected.
// - Per-token rate limit (best effort, per isolate).
// - Only GET/POST, no redirects followed, no private or loopback targets,
//   responses over MAX_BYTES are refused (no video relay).

const RATE_LIMIT_PER_MINUTE = 60;
const MAX_BYTES = 2 * 1024 * 1024;
const FORWARDED_HEADERS = new Set(["accept", "accept-language", "content-type", "cookie", "origin", "referer", "user-agent", "x-requested-with"]);
const buckets = new Map();

function list(value, lower = true) {
  return String(value || "").split(",").map((entry) => (lower ? entry.trim().toLowerCase() : entry.trim())).filter(Boolean);
}

function isPrivateHost(host) {
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")
    || /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)
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

function reply(status, message, extra = {}) {
  return new Response(message, { status, headers: { "access-control-allow-origin": "*", ...extra } });
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
    let target;
    try { target = new URL(params.get("url") || ""); } catch { return reply(400, "Bad url"); }
    const host = target.hostname.toLowerCase();
    if (target.protocol !== "https:" || isPrivateHost(host) || !list(env.ALLOWED_HOSTS).includes(host)) {
      return reply(403, "Host not allowed");
    }

    const headers = new Headers();
    try {
      Object.entries(JSON.parse(params.get("headers") || "{}")).forEach(([key, value]) => {
        if (FORWARDED_HEADERS.has(key.toLowerCase())) headers.set(key, String(value));
      });
    } catch { return reply(400, "Bad headers"); }

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.arrayBuffer() : undefined,
      redirect: "manual"
    });
    if (Number(upstream.headers.get("content-length") || 0) > MAX_BYTES) return reply(413, "Too large");
    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return reply(413, "Too large");
    return reply(upstream.status, body, {
      "content-type": upstream.headers.get("content-type") || "application/octet-stream",
      "x-proxy-final-url": target.href
    });
  }
};
