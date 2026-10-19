// Bounded contract for Nuvio JavaScript plugins.
//
// This module defines and validates what a plugin is allowed to declare and what
// a future sandboxed runtime may return. It intentionally performs NO execution,
// network access or persistence. A browser Worker alone is not sufficient
// isolation for untrusted code (see docs/SECURITY_PRIVACY.md), so execution
// remains unimplemented until an engine-level sandbox is reviewed.

export const PLUGIN_CONTRACT_LIMITS = Object.freeze({
  codeBytes: 262144,
  id: 80,
  name: 120,
  version: 40,
  hosts: 20,
  hostLength: 253,
  groups: 20,
  streams: 50,
  text: 200,
  quality: 80,
  url: 4096
});

export const PLUGIN_API_VERSION = 1;

const DNS_HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa"];

function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

function withoutControlCharacters(value) {
  let output = "";
  for (const character of value) {
    const code = character.codePointAt(0);
    output += code <= 0x1f || code === 0x7f ? " " : character;
  }
  return output;
}

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return withoutControlCharacters(value).trim().slice(0, max);
}

function normalizeHost(value) {
  if (typeof value !== "string") return null;
  const host = value.trim().toLowerCase();
  if (!host || host.length > PLUGIN_CONTRACT_LIMITS.hostLength) return null;
  if (/[^\x21-\x7e]/.test(host)) return null;
  if (/[:/@*?#\\\s]/.test(host)) return null;
  if (host.endsWith(".")) return null;
  if (IPV4_LITERAL.test(host)) return null;
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
  return DNS_HOSTNAME.test(host) ? host : null;
}

function safeMediaUrl(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > PLUGIN_CONTRACT_LIMITS.url) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  return raw;
}

function normalizeStream(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const url = safeMediaUrl(raw.url);
  if (!url) return null;
  const name = cleanText(raw.name, PLUGIN_CONTRACT_LIMITS.text) || "Plugin stream";
  return {
    name,
    title: cleanText(raw.title, PLUGIN_CONTRACT_LIMITS.text),
    description: cleanText(raw.description, PLUGIN_CONTRACT_LIMITS.text),
    quality: cleanText(raw.quality, PLUGIN_CONTRACT_LIMITS.quality),
    url
  };
}

export function normalizePluginHost(value) {
  return normalizeHost(value);
}

export function normalizePluginStreams(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const streams = [];
  let dropped = 0;
  for (const item of list) {
    if (streams.length >= PLUGIN_CONTRACT_LIMITS.streams) {
      dropped += 1;
      continue;
    }
    const stream = normalizeStream(item);
    if (stream) streams.push(stream);
    else dropped += 1;
  }
  return { streams, dropped };
}

export function normalizePluginResult(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const groups = [];
  let dropped = 0;
  for (const item of list) {
    if (groups.length >= PLUGIN_CONTRACT_LIMITS.groups) {
      dropped += 1;
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      dropped += 1;
      continue;
    }
    const sourceName =
      cleanText(item.sourceName, PLUGIN_CONTRACT_LIMITS.text) ||
      cleanText(item.sourceId, PLUGIN_CONTRACT_LIMITS.id) ||
      "Plugin";
    const sourceId =
      cleanText(item.sourceId, PLUGIN_CONTRACT_LIMITS.id) || sourceName;
    const normalized = normalizePluginStreams(item.streams);
    dropped += normalized.dropped;
    if (!normalized.streams.length) {
      dropped += 1;
      continue;
    }
    groups.push({ sourceId, sourceName, streams: normalized.streams });
  }
  return { groups, dropped };
}

export function normalizePluginDescriptor(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["descriptor"] };
  }
  const errors = [];
  const id = cleanText(input.id, PLUGIN_CONTRACT_LIMITS.id);
  if (!id) errors.push("id");
  const name = cleanText(input.name, PLUGIN_CONTRACT_LIMITS.name);
  if (!name) errors.push("name");
  const version = cleanText(input.version, PLUGIN_CONTRACT_LIMITS.version) || "1.0.0";
  const apiVersion = input.apiVersion === undefined ? PLUGIN_API_VERSION : input.apiVersion;
  if (apiVersion !== PLUGIN_API_VERSION) errors.push("apiVersion");
  const code = typeof input.code === "string" ? input.code : "";
  if (!code.trim()) errors.push("code");
  else if (byteLength(code) > PLUGIN_CONTRACT_LIMITS.codeBytes) errors.push("code-size");
  const hostsInput = Array.isArray(input.allowedHosts) ? input.allowedHosts : [];
  if (!hostsInput.length) errors.push("allowedHosts");
  if (hostsInput.length > PLUGIN_CONTRACT_LIMITS.hosts) errors.push("allowedHosts-size");
  const allowedHosts = [];
  for (const candidate of hostsInput.slice(0, PLUGIN_CONTRACT_LIMITS.hosts)) {
    const host = normalizeHost(candidate);
    if (!host) {
      errors.push("allowedHosts-entry");
      continue;
    }
    if (!allowedHosts.includes(host)) allowedHosts.push(host);
  }
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  return {
    ok: true,
    descriptor: Object.freeze({
      id,
      name,
      version,
      apiVersion,
      code,
      allowedHosts: Object.freeze(allowedHosts)
    })
  };
}
