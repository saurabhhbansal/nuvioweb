import { LocalStore } from "../storage/localStore.js";
import { createPluginCache } from "../plugins/pluginCache.js";
import { normalizeProxyUrl } from "../plugins/pluginNetwork.js";
import { isRepoUrl, scraperKey } from "../plugins/pluginRepo.js";
import { createPluginRepoLoader } from "../plugins/pluginRepoLoader.js";
import { mapPluginStreams } from "../plugins/pluginStreams.js";
import { runScraperInWorker } from "../plugins/pluginWorkerClient.js";

const SOURCES_KEY = "pluginSources";
const SCRAPER_STATE_KEY = "pluginScraperState";
const SCRAPER_STATUS_KEY = "pluginScraperStatus";
const PROXY_KEY = "pluginProxy";
const MAX_PARALLEL_SCRAPERS = 4;

// Sources are plugin repositories. Older builds stored URL templates under
// `urlTemplate`; those are not repositories and are dropped here.
export function normalizeSources(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  return input
    .map((source) => {
      const url = String(source?.url || source?.urlTemplate || "").trim();
      return {
        id: String(source?.id || `plugin_${Math.random().toString(36).slice(2, 10)}`),
        name: String(source?.name || "").trim(),
        url,
        enabled: source?.enabled !== false
      };
    })
    .filter((source) => {
      if (!isRepoUrl(source.url) || seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    });
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(lanes);
  return results;
}

export function createPluginRuntime({
  store = LocalStore,
  loader = null,
  runScraper = runScraperInWorker
} = {}) {
  let repoLoader = loader;
  const getLoader = () => (repoLoader ||= createPluginRepoLoader({ cache: createPluginCache() }));

  const runtime = {
    listSources() {
      return normalizeSources(store.get(SOURCES_KEY, []));
    },

    saveSources(sources) {
      store.set(SOURCES_KEY, normalizeSources(sources));
    },

    addSource(source) {
      this.saveSources([...this.listSources(), source]);
    },

    removeSource(sourceId) {
      this.saveSources(this.listSources().filter((source) => source.id !== sourceId));
    },

    setSourceEnabled(sourceId, enabled) {
      this.saveSources(
        this.listSources().map((source) => (source.id === sourceId ? { ...source, enabled: Boolean(enabled) } : source))
      );
    },

    getProxySettings() {
      const saved = store.get(PROXY_KEY, null) || {};
      const url = normalizeProxyUrl(saved.url);
      return { url, token: url ? String(saved.token || "") : "" };
    },

    setProxySettings({ url = "", token = "" } = {}) {
      const normalized = normalizeProxyUrl(url);
      if (String(url || "").trim() && !normalized) throw new Error("invalid-proxy-url");
      store.set(PROXY_KEY, normalized ? { url: normalized, token: String(token || "").trim() } : null);
    },

    isScraperEnabled(key, enabledByDefault = true) {
      const state = store.get(SCRAPER_STATE_KEY, {}) || {};
      return typeof state[key] === "boolean" ? state[key] : enabledByDefault;
    },

    setScraperEnabled(key, enabled) {
      const state = store.get(SCRAPER_STATE_KEY, {}) || {};
      store.set(SCRAPER_STATE_KEY, { ...state, [key]: Boolean(enabled) });
    },

    getScraperStatus(key) {
      return (store.get(SCRAPER_STATUS_KEY, {}) || {})[key] || null;
    },

    recordScraperStatus(key, status) {
      const all = store.get(SCRAPER_STATUS_KEY, {}) || {};
      store.set(SCRAPER_STATUS_KEY, { ...all, [key]: status });
    },

    loadManifest(url) {
      return getLoader().loadManifest(url, { proxy: this.getProxySettings() });
    },

    // Repos with their scrapers, for the settings screen.
    async describeSources({ force = false } = {}) {
      const proxy = this.getProxySettings();
      return Promise.all(
        this.listSources().map(async (source) => {
          try {
            const manifest = await getLoader().loadManifest(source.url, { proxy, force });
            return {
              source,
              manifest,
              error: "",
              scrapers: manifest.scrapers.map((scraper) => {
                const key = scraperKey(source.url, scraper.id);
                return { ...scraper, key, enabled: this.isScraperEnabled(key, scraper.enabledByDefault), status: this.getScraperStatus(key) };
              })
            };
          } catch (error) {
            return { source, manifest: null, error: String(error?.message || error), scrapers: [] };
          }
        })
      );
    },

    async execute({ tmdbId, mediaType, season = null, episode = null } = {}) {
      const type = mediaType === "series" ? "tv" : mediaType;
      if (!tmdbId || (type !== "movie" && type !== "tv")) return [];
      const proxy = this.getProxySettings();
      const repos = await this.describeSources();
      const jobs = repos
        .filter((repo) => repo.source.enabled)
        .flatMap((repo) => repo.scrapers.filter((scraper) => scraper.enabled && scraper.supportedTypes.includes(type)));
      const args = [String(tmdbId), type, season ?? null, episode ?? null];
      const groups = await mapLimit(jobs, MAX_PARALLEL_SCRAPERS, async (scraper) => {
        let result;
        try {
          const code = await getLoader().loadScraperCode(scraper, { proxy: proxy.url ? proxy : null });
          result = await runScraper({ code, args, proxy: proxy.url ? proxy : null });
        } catch (error) {
          result = { ok: false, streams: [], needsProxy: false, error: String(error?.message || error) };
        }
        this.recordScraperStatus(scraper.key, {
          ok: Boolean(result.ok),
          needsProxy: Boolean(result.needsProxy) && !proxy.url,
          timedOut: Boolean(result.timedOut),
          count: result.streams.length,
          at: Date.now()
        });
        if (!result.streams.length) return null;
        return { sourceId: scraper.key, sourceName: scraper.name, streams: mapPluginStreams(scraper, result.streams) };
      });
      return groups.filter(Boolean);
    }
  };
  return runtime;
}

export const PluginRuntime = createPluginRuntime();
