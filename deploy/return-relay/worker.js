// External player return relay (Cloudflare Workers module syntax).
// See docs/EXTERNAL_RETURN_RELAY.md and ADR-019 in docs/DECISIONS.md.
//
// An external player that supports a callback (x-success / x-cancel / x-error)
// opens /api/external-return/report/<token>?outcome=... when playback stops.
// The app later asks /api/external-return/collect/<token> once and gets the
// report back. That is all this Worker does.
//
// What it keeps, and for how long:
// - Only the token, outcome, provider, position, duration and progress, plus
//   the *names* of the query parameters the player sent (never their values).
// - For at most REPORT_TTL_MS, in one Durable Object per token, deleted on
//   collection or by an alarm, whichever comes first.
// - Never the stream URL. Some players append the address they played to the
//   callback (for example a `lastPlayedUrl` or `url` parameter). Every
//   parameter outside ALLOWED_PARAMS is dropped unread, nothing is logged, and
//   observability is off in wrangler.toml so request URLs are not retained.
//
// It never fetches anything, proxies nothing and serves no media.

const TOKEN = /^[a-f0-9]{32}$/;
const REPORT_TTL_MS = 10 * 60 * 1000;
const MAX_VALUE = 1_000_000_000;
const PROVIDERS = new Set(["outplayer", "infuse", "lenna", "vlc"]);
const OUTCOMES = new Set(["finished", "stopped"]);
const SOURCE_OUTCOMES = new Set(["finished", "stopped", "success", "cancel", "error"]);
// Parameter names worth reporting back for diagnosis. A name is recorded only
// if it is in this list; its value is read only for the numeric fields.
const NOTED_PARAMS = ["position", "duration", "progress", "lastPlayedUrl", "url"];
const ALLOWED_PARAMS = new Set(["outcome", "provider", "sourceOutcome", "position", "duration", "progress", "return"]);

const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};

function originAllowed(origin, allowed) {
  if (!origin) return false;
  let url;
  try { url = new URL(origin); } catch (_) { return false; }
  if (url.protocol !== "https:" || url.origin !== origin) return false;
  return String(allowed || "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean).some((entry) => {
    // "https://*.example.pages.dev" allows any one-label preview subdomain.
    if (entry.startsWith("https://*.")) {
      const suffix = entry.slice("https://*".length);
      const label = url.host.slice(0, -suffix.length);
      return url.host.endsWith(suffix) && label.length > 0 && !label.includes(".");
    }
    return entry === origin.toLowerCase();
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!originAllowed(origin, env.ALLOWED_ORIGINS)) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET", Vary: "Origin" };
}

function json(status, payload, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8", ...extra }
  });
}

function readNumber(search, name) {
  if (!search.has(name)) return { value: null };
  const value = Number(search.get(name));
  if (!Number.isFinite(value) || value < 0 || value > MAX_VALUE) return { invalid: true };
  return { value };
}

// Parses a callback into the only fields the relay keeps. Returns null when the
// report is not one the app could use.
export function parseReport(search) {
  const outcome = search.get("outcome");
  const provider = String(search.get("provider") || "").trim().toLowerCase();
  const source = search.get("sourceOutcome");
  const position = readNumber(search, "position");
  const duration = readNumber(search, "duration");
  const progress = readNumber(search, "progress");
  if (!OUTCOMES.has(outcome) || !PROVIDERS.has(provider)) return null;
  if (position.invalid || duration.invalid || progress.invalid) return null;
  if (progress.value != null && progress.value > 1) return null;
  if (position.value != null && duration.value != null && position.value > duration.value * 1.1 + 60) return null;
  return {
    outcome,
    provider,
    sourceOutcome: SOURCE_OUTCOMES.has(source) ? source : outcome,
    position: position.value,
    duration: duration.value,
    progress: progress.value,
    parameterNames: NOTED_PARAMS.filter((name) => search.has(name))
  };
}

// Builds the query the relay reads from: allowlisted parameters only. Anything
// else, including a stream address a player appended, never reaches parsing.
export function allowlistedSearch(url) {
  const kept = new URLSearchParams();
  for (const [name, value] of url.searchParams) {
    if (ALLOWED_PARAMS.has(name)) kept.append(name, value);
    else if (NOTED_PARAMS.includes(name)) kept.append(name, "");
  }
  return kept;
}

const PAGE_STYLE = ":root{color-scheme:dark}body{margin:0;min-height:100svh;display:grid;place-items:center;background:#090a0d;color:#f7f7f8;font:16px/1.45 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;padding:24px 20px}main{width:min(100%,390px);padding:30px 24px;border:1px solid #30323a;border-radius:24px;background:#191a1f;text-align:center}h1{margin:12px 0 0;font-size:24px}p{color:#c4c6ce}";

function page(status, heading, detail) {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NuvioWeb</title><style>${PAGE_STYLE}</style></head><body><main><strong>NuvioWeb</strong><h1>${heading}</h1><p>${detail}</p></main></body></html>`;
  return new Response(body, {
    status,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    }
  });
}

// One instance per token. It holds a single report and deletes itself.
export class ReturnSlot {
  constructor(state) {
    this.storage = state.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/put" && request.method === "POST") {
      const report = await request.json();
      const expiresAt = Date.now() + REPORT_TTL_MS;
      await this.storage.put("report", { ...report, expiresAt });
      await this.storage.setAlarm(expiresAt);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/take" && request.method === "POST") {
      const report = await this.storage.get("report");
      await this.storage.deleteAll();
      if (!report || Number(report.expiresAt) <= Date.now()) return Response.json({ found: false });
      const { expiresAt: _expiresAt, ...rest } = report;
      return Response.json({ found: true, ...rest });
    }
    return new Response(null, { status: 404 });
  }

  async alarm() {
    await this.storage.deleteAll();
  }
}

function slot(env, token) {
  return env.RETURN_SLOTS.get(env.RETURN_SLOTS.idFromName(token));
}

async function limited(env, request) {
  if (!env.REPORT_LIMIT?.limit) return false;
  const key = request.headers.get("CF-Connecting-IP") || "unknown";
  try {
    const { success } = await env.REPORT_LIMIT.limit({ key });
    return !success;
  } catch (_) {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: Object.keys(cors).length ? 204 : 403, headers: { ...BASE_HEADERS, ...cors } });
    }
    if (url.pathname === "/api/external-return/health" && request.method === "GET") {
      return json(200, { ok: true }, cors);
    }
    // Return notifications need keys this relay does not hold.
    if (url.pathname === "/api/external-return/push/public-key" && request.method === "GET") {
      return json(200, { enabled: false }, cors);
    }
    const match = /^\/api\/external-return\/(report|collect)\/([^/]+)$/.exec(url.pathname);
    if (!match) return json(404, { found: false, error: "not_found" }, cors);
    const [, action, token] = match;
    if (request.method !== "GET") return json(405, { found: false, error: "method_not_allowed" }, cors);
    if (!TOKEN.test(token)) {
      return action === "collect"
        ? json(400, { found: false, error: "invalid_token" }, cors)
        : page(400, "Playback unavailable", "This playback report could not be accepted.");
    }
    if (await limited(env, request)) {
      return action === "collect"
        ? json(429, { found: false, error: "rate_limited" }, cors)
        : page(429, "Try again shortly", "Too many playback reports from this network. Return to NuvioWeb and update your progress there.");
    }
    if (action === "collect") {
      if (!Object.keys(cors).length) return json(403, { found: false, error: "origin_not_allowed" });
      const response = await slot(env, token).fetch("https://slot/take", { method: "POST" });
      return json(200, await response.json(), cors);
    }
    const report = parseReport(allowlistedSearch(url));
    if (!report) return page(400, "Playback unavailable", "This playback report could not be accepted. Return to NuvioWeb and update your progress there.");
    await slot(env, token).fetch("https://slot/put", { method: "POST", body: JSON.stringify(report) });
    if (report.provider === "infuse" && report.sourceOutcome === "error") {
      return page(200, "Playback unavailable", "Infuse could not play this stream. Return to NuvioWeb to choose another source.");
    }
    const finished = report.provider === "outplayer" && report.sourceOutcome === "finished";
    return page(200, finished ? "Playback completed" : "Playback received",
      "Return to NuvioWeb from your Home Screen to update Continue Watching.");
  }
};
