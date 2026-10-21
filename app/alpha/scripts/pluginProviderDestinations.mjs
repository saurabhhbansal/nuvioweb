// Trusted registration only, never a guest API. Records come from reviewed,
// immutable provider-owned declarations, not destinations observed at runtime.
import { createHash } from "node:crypto";
import { normalizePluginHost, PLUGIN_CONTRACT_LIMITS } from "../js/core/plugins/pluginContract.js";

export function createProviderDestinationApproval(records) {
  if (!Array.isArray(records) || records.length > 20) throw new TypeError("invalid provider declarations");
  const policies = new Map();
  for (const record of records) {
    if (!record || typeof record.id !== "string" || !/^[a-z0-9-]{1,80}$/.test(record.id) || policies.has(record.id) ||
        !/^[a-f0-9]{64}$/.test(record.sourceSha256) || !Array.isArray(record.destinations) ||
        !record.destinations.length || record.destinations.length > PLUGIN_CONTRACT_LIMITS.hosts) throw new TypeError("invalid provider declarations");
    const hosts = new Set();
    for (const destination of record.destinations) {
      if (typeof destination !== "string" || destination.length > PLUGIN_CONTRACT_LIMITS.url) throw new TypeError("invalid provider destination");
      let url;
      try { url = new URL(destination); } catch { throw new TypeError("invalid provider destination"); }
      const host = normalizePluginHost(url.hostname);
      if (!host || url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || /[\s\\]/.test(destination)) throw new TypeError("invalid provider destination");
      hosts.add(host);
    }
    policies.set(record.id, { sha256: record.sourceSha256, hosts: [...hosts].sort() });
  }
  return function approve({ id, source } = {}) {
    const policy = policies.get(id);
    if (!policy || typeof source?.code !== "string" || Buffer.byteLength(source.code) > PLUGIN_CONTRACT_LIMITS.codeBytes ||
        createHash("sha256").update(source.code).digest("hex") !== policy.sha256) return { ok: false, error: "provider-declaration" };
    return { ok: true, hosts: [...policy.hosts] };
  };
}

// Upstream xprime source at this exact hash declares its metadata URL (line6),
// fallback (278), domain-catalog fetch (328), enc/dec service (379/408).
// The same-owner domain catalog is NOT trusted to authorize a new runtime host.
export const approvePinnedProviderDestinations = createProviderDestinationApproval([{
  id: "xprime", sourceSha256: "279882bcb321cde7e57722251ae2b96fda8e9549b0cb17e78cc8d44866e1e150",
  destinations: ["https://api.themoviedb.org", "https://xprime.tv", "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json", "https://enc-dec.app/api/enc-xprime", "https://enc-dec.app/api/dec-xprime"]
}]);
