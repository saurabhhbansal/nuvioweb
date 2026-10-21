// Pure policy helpers. No DNS, sockets, settings or host credentials.
import { normalizePluginHost } from "./pluginContract.js";
const HEADER_NAMES = new Set(["user-agent", "referer", "origin", "accept", "accept-language", "accept-encoding", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "sec-fetch-user"]);

export function pluginHeaderPolicy(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length > 20) throw new TypeError("invalid header policy");
  const policy = new Map();
  for (const [host, names] of Object.entries(raw)) {
    if (normalizePluginHost(host) !== host || !Array.isArray(names) || names.length > 16 || names.some(name => typeof name !== "string" || !HEADER_NAMES.has(name.toLowerCase()))) throw new TypeError("invalid header policy");
    policy.set(host, new Set(names.map(name => name.toLowerCase())));
  }
  return policy;
}

export function pluginRequestHeaders(raw, host, policy, authorize) {
  if (raw === undefined) return { headers: {} };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "header-shape" };
  const entries = Object.entries(raw);
  if (entries.length > 16) return { error: "header-size" };
  const headers = {};
  let bytes = 0;
  for (const [key, value] of entries) {
    const name = key.toLowerCase();
    if (!HEADER_NAMES.has(name) || !policy.get(host)?.has(name)) return { error: "header-policy" };
    if (Object.hasOwn(headers, name)) return { error: "header-duplicate" };
    if (typeof value !== "string" || /[^\x20-\x7e]/.test(value)) return { error: "header-value" };
    bytes += key.length + value.length + 4;
    if (value.length > 1024 || bytes > 8192) return { error: "header-size" };
    if (name === "origin" || name === "referer") {
      const checked = authorize(value);
      if (checked.error || checked.url.search || checked.url.hash || (name === "origin" && value !== checked.url.origin)) return { error: "header-origin" };
    }
    headers[name] = value;
  }
  return { headers };
}

// Conservative globally routable subset; mapped, scoped, transition and special
// ranges fail closed. A live transport must pin these addresses, not re-resolve.
export function isPublicPluginAddress(raw) {
  if (typeof raw !== "string" || raw.length > 45) return false;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(raw)) {
    const parts = raw.split(".");
    // Reject alternate/octal spellings before a transport parser can reinterpret them.
    if (parts.some(part => part.length > 1 && part[0] === "0")) return false;
    const p = parts.map(Number);
    if (p.some(n => n > 255)) return false;
    const [a, b, c] = p;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (!/^[0-9a-f:]+$/i.test(raw)) return false;
  let canonical;
  try { canonical = new URL(`https://[${raw}]/`).hostname.slice(1, -1); } catch { return false; }
  const parts = canonical.split(":");
  const first = parseInt(parts[0], 16), second = parseInt(parts[1] || "0", 16);
  return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 && first !== 0x3fff &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
}
