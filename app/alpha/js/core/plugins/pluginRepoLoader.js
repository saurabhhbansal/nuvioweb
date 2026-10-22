// Loads plugin repositories: manifest.json -> scraper list -> scraper code.
// Results are cached in IndexedDB so repos keep working offline or when the host is slow.
import { manifestUrlFor, parseManifest } from "./pluginRepo.js";
import { buildProxyRequest, isBlockedTarget } from "./pluginNetwork.js";

const MANIFEST_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_CODE_BYTES = 1024 * 1024;

async function fetchText(url, { fetchImpl, proxy, appOrigin }) {
  if (isBlockedTarget(url, appOrigin)) throw new Error("Repository address is not allowed");
  let response;
  try {
    response = await fetchImpl(url, { credentials: "omit" });
  } catch (error) {
    if (!proxy?.url) throw error;
    const request = buildProxyRequest(proxy, url);
    response = await fetchImpl(request.url, request.init);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_CODE_BYTES) throw new Error("File too large");
  return text;
}

export function createPluginRepoLoader({ cache, fetchImpl = (...args) => globalThis.fetch(...args), now = () => Date.now(), appOrigin } = {}) {
  return {
    async loadManifest(repoUrl, { proxy = null, force = false } = {}) {
      const manifestUrl = manifestUrlFor(repoUrl);
      if (!manifestUrl) throw new Error("Invalid repository URL");
      const key = `manifest:${manifestUrl}`;
      const cached = await cache.get(key);
      if (!force && cached && now() - cached.fetchedAt < MANIFEST_MAX_AGE_MS) {
        return cached.manifest;
      }
      try {
        const manifest = parseManifest(JSON.parse(await fetchText(manifestUrl, { fetchImpl, proxy, appOrigin })), manifestUrl);
        await cache.set(key, { manifest, fetchedAt: now() });
        return manifest;
      } catch (error) {
        if (cached) return cached.manifest;
        throw error;
      }
    },

    async loadScraperCode(scraper, { proxy = null } = {}) {
      const key = `code:${scraper.codeUrl}@${scraper.version}`;
      const cached = await cache.get(key);
      // Versioned code is immutable; unversioned code refreshes like the manifest.
      if (cached?.code && (scraper.version || now() - cached.fetchedAt < MANIFEST_MAX_AGE_MS)) {
        return cached.code;
      }
      try {
        const code = await fetchText(scraper.codeUrl, { fetchImpl, proxy, appOrigin });
        await cache.set(key, { code, fetchedAt: now() });
        return code;
      } catch (error) {
        if (cached?.code) return cached.code;
        throw error;
      }
    }
  };
}
