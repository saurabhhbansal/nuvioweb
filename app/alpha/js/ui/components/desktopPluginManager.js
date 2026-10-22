import { AuthManager } from "../../core/auth/authManager.js";
import { PluginManager } from "../../core/player/pluginManager.js";
import { PluginSyncService } from "../../core/profile/pluginSyncService.js";
import { isRepoUrl } from "../../core/plugins/pluginRepo.js";
import { I18n } from "../../i18n/index.js";

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createSourceId() {
  return `plugin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function statusLabel(status) {
  if (!status) return "";
  if (status.needsProxy) return t("plugin_status_needs_proxy", {}, "Needs proxy");
  if (status.timedOut) return t("plugin_status_timed_out", {}, "Timed out");
  if (!status.ok) return t("plugin_status_failed", {}, "Failed");
  if (!status.count) return t("plugin_status_no_streams", {}, "No streams");
  return t("plugin_status_streams", { count: status.count }, `${status.count} streams`);
}

export function createDesktopPluginManager({ requestRender } = {}) {
  const state = {
    isLoading: false,
    pluginsEnabled: false,
    sources: [],
    details: new Map(),
    scrapers: [],
    repoUrl: "",
    addError: "",
    proxyUrl: "",
    proxyToken: "",
    proxyError: "",
    removeTarget: null,
    settingsLayouts: new Map(),
    settingsTarget: null,
    statusMessage: "",
    statusTone: "",
    syncInFlight: null,
    syncPending: false
  };

  const rerender = async () => {
    await requestRender?.();
  };

  const setStatus = (message = "", tone = "") => {
    state.statusMessage = message;
    state.statusTone = tone;
  };

  const loadSources = () => {
    state.pluginsEnabled = PluginManager.pluginsEnabled;
    state.sources = PluginManager.listPluginSources();
  };

  const loadDetails = async ({ force = false } = {}) => {
    const repos = await PluginManager.describePluginSources({ force });
    state.details = new Map(repos.map((repo) => [repo.source.id, repo]));
    state.scrapers = repos.flatMap((repo) => repo.scrapers);
    void detectSettings();
  };

  // Finds which plugins have their own settings form, a few at a time, and
  // shows a Settings button on those.
  const detectSettings = async () => {
    const pending = state.scrapers.filter((scraper) => !state.settingsLayouts.has(scraper.key));
    let next = 0;
    const lane = async () => {
      while (next < pending.length) {
        const scraper = pending[next++];
        let layout = [];
        try {
          layout = await PluginManager.getScraperSettingsLayout(scraper);
        } catch {}
        state.settingsLayouts.set(scraper.key, layout);
        if (layout.length) await rerender();
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, pending.length) }, lane));
  };

  const openSettings = (scraper) => {
    const layout = state.settingsLayouts.get(scraper?.key) || [];
    if (!layout.length) return;
    const saved = PluginManager.getScraperSettings(scraper.key);
    const values = {};
    layout.forEach((field) => {
      if (field.key) values[field.key] = Object.prototype.hasOwnProperty.call(saved, field.key) ? saved[field.key] : field.defaultValue;
    });
    state.settingsTarget = { scraper, layout, values };
    void rerender();
  };

  const saveSettings = async (form) => {
    const target = state.settingsTarget;
    if (!target) return;
    const values = {};
    target.layout.forEach((field, index) => {
      if (!field.key) return;
      const input = form?.querySelector?.(`#desktop-plugin-setting-${index}`);
      if (!input) return;
      values[field.key] = field.type === "toggle" ? Boolean(input.checked) : String(input.value ?? "");
    });
    PluginManager.setScraperSettings(target.scraper.key, values);
    state.settingsTarget = null;
    setStatus(t("plugin_settings_saved", { name: target.scraper.name }, `${target.scraper.name} settings saved on this device.`), "success");
    await rerender();
  };

  const syncSources = async () => {
    if (!AuthManager.isAuthenticated) {
      setStatus(t("plugin_saved_locally", {}, "Saved locally"), "warning");
      await rerender();
      return false;
    }
    if (state.syncInFlight) {
      state.syncPending = true;
      return state.syncInFlight;
    }
    setStatus(t("plugin_syncing", {}, "Syncing…"));
    await rerender();
    const run = async () => {
      let synced = true;
      do {
        state.syncPending = false;
        synced = (await PluginSyncService.push({ automatic: true })) && synced;
      } while (state.syncPending);
      return synced;
    };
    state.syncInFlight = run();
    try {
      const synced = await state.syncInFlight;
      const pending = PluginSyncService.hasPendingLocalMutation();
      setStatus(
        synced
          ? t("plugin_synced", {}, "Synced")
          : pending
            ? t("plugin_sync_waiting", {}, "Saved locally — sync will resume after profile hydration.")
            : t("plugin_sync_failed", {}, "Sync failed — changes are still saved locally."),
        synced ? "success" : pending ? "warning" : "error"
      );
      await rerender();
      return synced;
    } finally {
      state.syncInFlight = null;
    }
  };

  const mutateSources = async (change, message) => {
    const before = PluginManager.listPluginSources();
    change();
    loadSources();
    setStatus(message);
    await rerender();
    PluginSyncService.recordLocalMutation(null, before, PluginManager.listPluginSources());
    await syncSources();
  };

  const addSource = async () => {
    const url = String(state.repoUrl || "").trim();
    if (!isRepoUrl(url)) {
      state.addError = t("plugin_invalid_repo_url", {}, "Enter a plugin repository URL (https://…/manifest.json).");
      await rerender();
      return;
    }
    if (state.sources.some((source) => source.url === url)) {
      state.addError = t("plugin_repo_exists", {}, "That repository is already added.");
      await rerender();
      return;
    }
    state.addError = "";
    try {
      // Name the repository from its manifest; an unreachable repo is still saved.
      const manifest = await PluginManager.loadPluginManifest(url).catch(() => null);
      const name = manifest?.name || new URL(url).hostname;
      await mutateSources(() => {
        PluginManager.addPluginSource({ id: createSourceId(), name, url, enabled: true });
      }, t("plugin_repo_saved", {}, "Repository saved."));
      state.repoUrl = "";
      await loadDetails();
      await rerender();
    } catch (error) {
      console.warn("Plugin repository add failed", error);
      state.addError = t("plugin_repo_add_failed", {}, "Unable to add that repository.");
      await rerender();
    }
  };

  const setSourceEnabled = async (source) => {
    if (!source?.id) return;
    await mutateSources(
      () => PluginManager.setPluginSourceEnabled(source.id, source.enabled === false),
      source.enabled === false ? t("plugin_repo_enabled", {}, "Repository enabled.") : t("plugin_repo_disabled", {}, "Repository disabled.")
    );
  };

  const setScraperEnabled = async (scraper) => {
    if (!scraper?.key) return;
    PluginManager.setScraperEnabled(scraper.key, !scraper.enabled);
    await loadDetails();
    setStatus(t("plugin_saved_on_device", {}, "Saved on this device."), "warning");
    await rerender();
  };

  const confirmRemove = async () => {
    const source = state.removeTarget;
    state.removeTarget = null;
    if (!source?.id) return;
    await mutateSources(() => PluginManager.removePluginSource(source.id), t("plugin_repo_removed", {}, "Repository removed."));
    await loadDetails();
    await rerender();
  };

  const saveProxy = async () => {
    try {
      PluginManager.setProxySettings({ url: state.proxyUrl, token: state.proxyToken });
      const saved = PluginManager.getProxySettings();
      state.proxyUrl = saved.url;
      state.proxyToken = saved.token;
      state.proxyError = "";
      setStatus(saved.url ? t("plugin_proxy_saved", {}, "Proxy saved on this device.") : t("plugin_proxy_cleared", {}, "Proxy turned off."), "success");
    } catch {
      state.proxyError = t("plugin_proxy_invalid", {}, "Use an https:// proxy address without a query string.");
    }
    await rerender();
  };

  const renderScraper = (scraper) => {
    const index = state.scrapers.indexOf(scraper);
    const label = statusLabel(scraper.status);
    return `
      <li class="desktop-plugin-scraper">
        <label class="desktop-plugin-toggle">
          <input type="checkbox" data-plugin-scraper-toggle="${index}" ${scraper.enabled ? "checked" : ""} />
          <span class="desktop-plugin-toggle-track" aria-hidden="true"><span></span></span>
          <span class="desktop-plugin-toggle-label">${escapeHtml(scraper.name)}</span>
        </label>
        ${label ? `<span class="desktop-plugin-count">${escapeHtml(label)}</span>` : ""}
        ${state.settingsLayouts.get(scraper.key)?.length ? `<button class="desktop-plugin-action" type="button" data-plugin-settings-open="${index}">${escapeHtml(t("plugin_settings", {}, "Settings"))}</button>` : ""}
      </li>
    `;
  };

  const renderSource = (source, index) => {
    const name = String(source?.name || "").trim() || t("plugin_repository", {}, "Repository");
    const enabled = source?.enabled !== false;
    const repo = state.details.get(source.id);
    const scrapers = repo?.error
      ? `<p class="desktop-plugin-form-message is-error">${escapeHtml(t("plugin_repo_load_failed", {}, "Couldn’t load this repository."))}</p>`
      : repo?.scrapers?.length
        ? `<ul class="desktop-plugin-scrapers">${repo.scrapers.map(renderScraper).join("")}</ul>`
        : "";
    return `
      <article class="desktop-plugin-source${enabled ? "" : " is-disabled"}">
        <div class="desktop-plugin-source-copy">
          <h3>${escapeHtml(name)}</h3>
          <p title="${escapeHtml(source.url)}">${escapeHtml(source.url)}</p>
          ${scrapers}
        </div>
        <div class="desktop-plugin-source-actions" aria-label="${escapeHtml(name)}">
          <label class="desktop-plugin-toggle">
            <input type="checkbox" data-plugin-source-toggle="${index}" ${enabled ? "checked" : ""} />
            <span class="desktop-plugin-toggle-track" aria-hidden="true"><span></span></span>
            <span class="desktop-plugin-toggle-label">${enabled ? t("plugin_enabled", {}, "Enabled") : t("plugin_disabled", {}, "Disabled")}</span>
          </label>
          <button class="desktop-plugin-action desktop-plugin-action-danger" type="button" data-plugin-source-remove="${index}">${escapeHtml(t("plugin_remove", {}, "Remove"))}</button>
        </div>
      </article>
    `;
  };

  const renderSettingField = (field, index) => {
    const id = `desktop-plugin-setting-${index}`;
    const value = state.settingsTarget.values[field.key];
    const description = field.description ? `<p class="desktop-plugin-setting-description">${escapeHtml(field.description)}</p>` : "";
    if (field.type === "header") return `<h3 class="desktop-plugin-setting-header">${escapeHtml(field.label)}</h3>${description}`;
    if (field.type === "info") {
      const gap = field.label && field.description ? " " : "";
      return `<p class="desktop-plugin-setting-info">${escapeHtml(field.label)}${gap}${escapeHtml(field.description)}</p>`;
    }
    if (field.type === "toggle") {
      const checked = value === true || value === "true" ? "checked" : "";
      return `<div class="desktop-plugin-field">
          <label class="desktop-plugin-toggle">
            <input id="${id}" type="checkbox" ${checked} />
            <span class="desktop-plugin-toggle-track" aria-hidden="true"><span></span></span>
            <span class="desktop-plugin-toggle-label">${escapeHtml(field.label || field.key)}</span>
          </label>${description}
        </div>`;
    }
    const label = `<label class="desktop-plugin-input-label" for="${id}">${escapeHtml(field.label || field.key)}</label>`;
    if (field.type === "select") {
      const options = field.options
        .map((option) => `<option value="${escapeHtml(option.value)}" ${String(value) === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
        .join("");
      return `<div class="desktop-plugin-field">${label}<select id="${id}" class="desktop-plugin-input">${options}</select>${description}</div>`;
    }
    const type = field.isPassword ? "password" : "text";
    return `<div class="desktop-plugin-field">${label}<input id="${id}" class="desktop-plugin-input" type="${type}" autocomplete="off" placeholder="${escapeHtml(field.placeholder)}" value="${escapeHtml(value ?? "")}" />${description}</div>`;
  };

  const renderSettingsDialog = () => {
    const target = state.settingsTarget;
    if (!target) return "";
    const name = target.scraper.name;
    return `
      <div class="desktop-plugin-dialog-backdrop" data-plugin-settings-backdrop>
        <section class="desktop-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="desktop-plugin-settings-title">
          <h2 id="desktop-plugin-settings-title">${escapeHtml(t("plugin_settings_title", { name }, `${name} settings`))}</h2>
          <p>${escapeHtml(t("plugin_settings_note", {}, "Saved on this device and passed only to this plugin."))}</p>
          <form class="desktop-plugin-form" data-plugin-settings-form>
            <div class="desktop-plugin-form-fields">${target.layout.map(renderSettingField).join("")}</div>
            <div class="desktop-plugin-dialog-actions">
              <button class="desktop-plugin-action" type="button" data-plugin-settings-cancel>${escapeHtml(t("plugin_cancel", {}, "Cancel"))}</button>
              <button class="desktop-plugin-primary-action" type="submit">${escapeHtml(t("plugin_proxy_save", {}, "Save"))}</button>
            </div>
          </form>
        </section>
      </div>
    `;
  };

  const renderConfirmation = () => {
    if (!state.removeTarget) return "";
    const name = state.removeTarget.name || t("plugin_repository", {}, "Repository");
    return `
      <div class="desktop-plugin-dialog-backdrop" data-plugin-dialog-backdrop>
        <section class="desktop-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="desktop-plugin-remove-title">
          <h2 id="desktop-plugin-remove-title">${escapeHtml(t("plugin_remove_title", { name }, `Remove ${name}?`))}</h2>
          <p>${escapeHtml(t("plugin_remove_body", {}, "This removes the repository from this profile."))}</p>
          <div class="desktop-plugin-dialog-actions">
            <button class="desktop-plugin-action" type="button" data-plugin-remove-cancel>${escapeHtml(t("plugin_cancel", {}, "Cancel"))}</button>
            <button class="desktop-plugin-action desktop-plugin-action-danger" type="button" data-plugin-remove-confirm>${escapeHtml(t("plugin_remove", {}, "Remove"))}</button>
          </div>
        </section>
      </div>
    `;
  };

  return {
    async load() {
      state.isLoading = true;
      await rerender();
      try {
        loadSources();
        const proxy = PluginManager.getProxySettings();
        state.proxyUrl = proxy.url;
        state.proxyToken = proxy.token;
        await loadDetails();
      } catch (error) {
        console.warn("Plugin repository load failed", error);
        setStatus(t("plugin_load_failed", {}, "Couldn’t load plugin repositories."), "error");
      } finally {
        state.isLoading = false;
        await rerender();
      }
    },

    render() {
      const statusClass = state.statusTone ? ` is-${state.statusTone}` : "";
      const sources = state.isLoading
        ? `<p class="desktop-plugin-empty">${escapeHtml(t("plugin_loading", {}, "Loading plugin repositories…"))}</p>`
        : state.sources.length
          ? state.sources.map(renderSource).join("")
          : `<p class="desktop-plugin-empty">${escapeHtml(t("plugin_none", {}, "No plugin repositories yet."))}</p>`;
      return `
        <div class="desktop-plugin-manager">
          <section class="desktop-plugin-master">
            <div>
              <h2>${escapeHtml(t("plugin_enable_plugins_title", {}, "Enable plugin providers globally"))}</h2>
              <p>${escapeHtml(t("plugin_enable_device_note", {}, "Plugins run in your browser on this device."))}</p>
            </div>
            <label class="desktop-plugin-toggle desktop-plugin-master-toggle">
              <input type="checkbox" data-plugins-enabled ${state.pluginsEnabled ? "checked" : ""} />
              <span class="desktop-plugin-toggle-track" aria-hidden="true"><span></span></span>
              <span class="desktop-plugin-toggle-label">${state.pluginsEnabled ? t("plugin_enabled", {}, "Enabled") : t("plugin_disabled", {}, "Disabled")}</span>
            </label>
          </section>
          <section class="desktop-plugin-section" aria-labelledby="desktop-plugin-sources-title">
            <div class="desktop-plugin-section-heading">
              <div>
                <h2 id="desktop-plugin-sources-title">${escapeHtml(t("plugin_repositories_title", {}, "Plugin repositories"))}</h2>
                <p>${escapeHtml(t("plugin_repositories_help", {}, "Add a repository’s manifest.json URL. Repositories sync with your Nuvio account."))}</p>
              </div>
              <span class="desktop-plugin-count">${state.sources.length}</span>
            </div>
            ${state.statusMessage ? `<p class="desktop-plugin-status${statusClass}" role="status">${escapeHtml(state.statusMessage)}</p>` : ""}
            <form class="desktop-plugin-form" data-plugin-form>
              <div class="desktop-plugin-field">
                <label class="desktop-plugin-input-label" for="desktop-plugin-url">${escapeHtml(t("plugin_repository_url", {}, "Repository URL"))}</label>
                <div class="desktop-plugin-input-row">
                  <input id="desktop-plugin-url" class="desktop-plugin-input" type="url" autocomplete="off" placeholder="https://example.com/plugins/manifest.json" value="${escapeHtml(state.repoUrl)}" data-plugin-url />
                  <button class="desktop-plugin-primary-action" type="submit">${escapeHtml(t("plugin_add_repository", {}, "Add repository"))}</button>
                </div>
              </div>
              ${state.addError ? `<p class="desktop-plugin-form-message is-error" role="alert">${escapeHtml(state.addError)}</p>` : ""}
            </form>
            <div class="desktop-plugin-source-list">${sources}</div>
          </section>
          <section class="desktop-plugin-section" aria-labelledby="desktop-plugin-proxy-title">
            <div class="desktop-plugin-section-heading">
              <div>
                <h2 id="desktop-plugin-proxy-title">${escapeHtml(t("plugin_proxy_title", {}, "Plugin proxy (optional)"))}</h2>
                <p>${escapeHtml(t("plugin_proxy_help", {}, "Some plugins are blocked by the browser and show “Needs proxy”. A proxy you run can fetch for them. Off by default; never sent your Nuvio sign-in."))}</p>
              </div>
            </div>
            <form class="desktop-plugin-form" data-plugin-proxy-form>
              <div class="desktop-plugin-form-fields">
                <div class="desktop-plugin-field">
                  <label class="desktop-plugin-input-label" for="desktop-plugin-proxy-url">${escapeHtml(t("plugin_proxy_url", {}, "Proxy URL"))}</label>
                  <input id="desktop-plugin-proxy-url" class="desktop-plugin-input" type="url" autocomplete="off" placeholder="https://proxy.example.com/" value="${escapeHtml(state.proxyUrl)}" data-plugin-proxy-url />
                </div>
                <div class="desktop-plugin-field">
                  <label class="desktop-plugin-input-label" for="desktop-plugin-proxy-token">${escapeHtml(t("plugin_proxy_token", {}, "Proxy token"))}</label>
                  <div class="desktop-plugin-input-row">
                    <input id="desktop-plugin-proxy-token" class="desktop-plugin-input" type="password" autocomplete="off" value="${escapeHtml(state.proxyToken)}" data-plugin-proxy-token />
                    <button class="desktop-plugin-primary-action" type="submit">${escapeHtml(t("plugin_proxy_save", {}, "Save"))}</button>
                  </div>
                </div>
              </div>
              ${state.proxyError ? `<p class="desktop-plugin-form-message is-error" role="alert">${escapeHtml(state.proxyError)}</p>` : ""}
            </form>
          </section>
          ${renderConfirmation()}
          ${renderSettingsDialog()}
        </div>
      `;
    },

    bind(container) {
      container.querySelector("[data-plugin-url]")?.addEventListener("input", (event) => {
        state.repoUrl = String(event.target?.value || "");
        state.addError = "";
      });
      container.querySelector("[data-plugin-form]")?.addEventListener("submit", (event) => {
        event.preventDefault();
        void addSource();
      });
      container.querySelector("[data-plugin-proxy-url]")?.addEventListener("input", (event) => {
        state.proxyUrl = String(event.target?.value || "");
        state.proxyError = "";
      });
      container.querySelector("[data-plugin-proxy-token]")?.addEventListener("input", (event) => {
        state.proxyToken = String(event.target?.value || "");
      });
      container.querySelector("[data-plugin-proxy-form]")?.addEventListener("submit", (event) => {
        event.preventDefault();
        void saveProxy();
      });
      container.querySelector("[data-plugins-enabled]")?.addEventListener("change", (event) => {
        PluginManager.setPluginsEnabled(Boolean(event.target?.checked));
        state.pluginsEnabled = PluginManager.pluginsEnabled;
        setStatus(t("plugin_saved_on_device", {}, "Saved on this device."), "warning");
        void rerender();
      });
      container.querySelectorAll("[data-plugin-source-toggle]").forEach((node) => {
        node.addEventListener("change", () => void setSourceEnabled(state.sources[Number(node.dataset.pluginSourceToggle)]));
      });
      container.querySelectorAll("[data-plugin-scraper-toggle]").forEach((node) => {
        node.addEventListener("change", () => void setScraperEnabled(state.scrapers[Number(node.dataset.pluginScraperToggle)]));
      });
      container.querySelectorAll("[data-plugin-source-remove]").forEach((node) => {
        node.addEventListener("click", () => {
          state.removeTarget = state.sources[Number(node.dataset.pluginSourceRemove)] || null;
          void rerender();
        });
      });
      container.querySelectorAll("[data-plugin-settings-open]").forEach((node) => {
        node.addEventListener("click", () => openSettings(state.scrapers[Number(node.dataset.pluginSettingsOpen)]));
      });
      container.querySelector("[data-plugin-settings-form]")?.addEventListener("submit", (event) => {
        event.preventDefault();
        void saveSettings(event.currentTarget);
      });
      container.querySelector("[data-plugin-settings-cancel]")?.addEventListener("click", () => {
        state.settingsTarget = null;
        void rerender();
      });
      container.querySelector("[data-plugin-settings-backdrop]")?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget) {
          state.settingsTarget = null;
          void rerender();
        }
      });
      container.querySelector("[data-plugin-remove-cancel]")?.addEventListener("click", () => {
        state.removeTarget = null;
        void rerender();
      });
      container.querySelector("[data-plugin-remove-confirm]")?.addEventListener("click", () => void confirmRemove());
      container.querySelector("[data-plugin-dialog-backdrop]")?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget) {
          state.removeTarget = null;
          void rerender();
        }
      });
    },

    async handleKeyDown(event) {
      if (event?.key === "Escape" && (state.removeTarget || state.settingsTarget)) {
        event.preventDefault();
        state.removeTarget = null;
        state.settingsTarget = null;
        await rerender();
        return true;
      }
      return false;
    }
  };
}
