// Trakt sign-in helper for the Cloudflare Pages site, served at /api/trakt/*.
//
// Trakt's device sign-in only hands out a token when the poll carries the
// app's client secret. A secret cannot live in the page, so these three
// requests go through here, where it is added from the Pages project's
// encrypted settings. Nothing else does: no media, no other host, no storage.
// The browser keeps the token it gets back; this never sees it again unless
// the browser asks for a refresh.

const TRAKT_API_BASE_URL = "https://api.trakt.tv";
// Cloudflare in front of Trakt refuses requests with no User-Agent.
const TRAKT_USER_AGENT = "NuvioWeb";
const MAX_BODY_BYTES = 8 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_FIELDS = ["access_token", "refresh_token", "expires_in", "created_at", "token_type", "scope"];
const DEVICE_FIELDS = ["device_code", "user_code", "verification_url", "expires_in", "interval"];
const DEFAULT_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

function reply(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

function pick(payload, fields) {
  return Object.fromEntries(fields.filter((key) => payload?.[key] != null).map((key) => [key, payload[key]]));
}

function configuration(env = {}) {
  return {
    clientId: String(env.TRAKT_CLIENT_ID || "").trim(),
    clientSecret: String(env.TRAKT_CLIENT_SECRET || "").trim(),
    redirectUri: String(env.TRAKT_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim()
  };
}

// Only this site's own pages may spend its secret. Browsers always send Origin
// on a cross-site POST, so a request from anywhere else is refused here.
function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw Object.assign(new Error("too large"), { status: 413 });
  if (!text) return {};
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
  return value;
}

async function callTrakt(fetchImpl, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${TRAKT_API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": TRAKT_USER_AGENT },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }
    return { status: response.status, payload, retryAfter: response.headers.get("Retry-After") || "" };
  } finally {
    clearTimeout(timer);
  }
}

function relay(result, fields) {
  if (result.status >= 200 && result.status < 300) return reply(200, pick(result.payload, fields));
  // The status is what the browser reads (400 pending, 409 used, 410 expired,
  // 418 denied, 429 slow down), so it is passed on as it came.
  const seconds = String(result.retryAfter).trim();
  return reply(
    Math.max(400, Math.min(599, Number(result.status) || 502)),
    { error: String(result.payload?.error_description || result.payload?.error || "Trakt authorization failed") },
    /^[0-9]+$/.test(seconds) ? { "Retry-After": seconds } : {}
  );
}

export async function handleTraktAuth(request, env = {}, fetchImpl = fetch) {
  const config = configuration(env);
  const configured = Boolean(config.clientId && config.clientSecret);
  const path = new URL(request.url).pathname.replace(/\/+$/, "");

  if (path === "/api/trakt/health") {
    return request.method === "GET" ? reply(200, { configured }) : reply(405, { error: "Method not allowed" });
  }
  if (!configured) return reply(503, { error: "Trakt sign-in is not configured on this site" });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  if (!sameOrigin(request)) return reply(403, { error: "Forbidden" });

  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    return reply(error.status || 400, { error: "Invalid request" });
  }
  const text = (value) => (typeof value === "string" ? value.trim() : "");

  try {
    if (path === "/api/trakt/device/code") {
      return relay(await callTrakt(fetchImpl, "/oauth/device/code", { client_id: config.clientId }), DEVICE_FIELDS);
    }
    if (path === "/api/trakt/device/token") {
      if (!text(body.code)) return reply(400, { error: "Missing device code" });
      return relay(
        await callTrakt(fetchImpl, "/oauth/device/token", {
          code: text(body.code),
          client_id: config.clientId,
          client_secret: config.clientSecret
        }),
        TOKEN_FIELDS
      );
    }
    if (path === "/api/trakt/refresh") {
      if (!text(body.refresh_token)) return reply(400, { error: "Missing refresh token" });
      return relay(
        await callTrakt(fetchImpl, "/oauth/token", {
          refresh_token: text(body.refresh_token),
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: "refresh_token"
        }),
        TOKEN_FIELDS
      );
    }
  } catch {
    return reply(502, { error: "Unable to reach Trakt" });
  }
  return reply(404, { error: "Not found" });
}
