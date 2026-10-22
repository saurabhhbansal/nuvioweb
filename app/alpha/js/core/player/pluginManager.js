import { LocalStore } from "../storage/localStore.js";
import { PluginRuntime } from "./pluginRuntime.js";

const PLUGINS_ENABLED_KEY = "pluginsEnabled";

export const PluginManager = {
  // Saved per device. Until the user flips it, plugins are on whenever the
  // profile has a repository (repositories sync; this switch does not).
  get pluginsEnabled() {
    const saved = LocalStore.get(PLUGINS_ENABLED_KEY, null);
    if (typeof saved === "boolean") return saved;
    return PluginRuntime.listSources().length > 0;
  },

  setPluginsEnabled(enabled) {
    LocalStore.set(PLUGINS_ENABLED_KEY, Boolean(enabled));
  },

  listPluginSources() {
    return PluginRuntime.listSources();
  },

  addPluginSource(source) {
    PluginRuntime.addSource(source);
  },

  removePluginSource(sourceId) {
    PluginRuntime.removeSource(sourceId);
  },

  setPluginSourceEnabled(sourceId, enabled) {
    PluginRuntime.setSourceEnabled(sourceId, enabled);
  },

  loadPluginManifest(url) {
    return PluginRuntime.loadManifest(url);
  },

  describePluginSources(options) {
    return PluginRuntime.describeSources(options);
  },

  setScraperEnabled(key, enabled) {
    PluginRuntime.setScraperEnabled(key, enabled);
  },

  getScraperSettings(key) {
    return PluginRuntime.getScraperSettings(key);
  },

  setScraperSettings(key, values) {
    PluginRuntime.setScraperSettings(key, values);
  },

  getScraperSettingsLayout(scraper) {
    return PluginRuntime.getSettingsLayout(scraper);
  },

  getProxySettings() {
    return PluginRuntime.getProxySettings();
  },

  setProxySettings(settings) {
    PluginRuntime.setProxySettings(settings);
  },

  async executeScrapersStreaming({ tmdbId, mediaType, season = null, episode = null, tmdbApiKey = "", onGroup = null } = {}) {
    if (!this.pluginsEnabled) {
      return [];
    }
    return PluginRuntime.execute({ tmdbId, mediaType, season, episode, tmdbApiKey, onGroup });
  }
};
