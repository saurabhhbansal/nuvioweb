// Runs one scraper's code. Only ever called inside the plugin Web Worker
// (and in Node tests); the main thread never evaluates plugin code.

import { cleanPluginStreams } from "./pluginStreams.js";

// Names hidden from plugin code. Best effort only: the worker, not this list,
// is the isolation boundary (no DOM, no localStorage, terminated after each run).
const HIDDEN_GLOBALS = [
  "indexedDB", "caches", "importScripts", "localStorage", "sessionStorage",
  "XMLHttpRequest", "WebSocket", "EventSource", "postMessage", "close", "Worker"
];

export function createAxiosShim(fetchImpl) {
  const request = async (config = {}) => {
    let url = String(config.url || "");
    if (config.params && typeof config.params === "object") {
      const target = new URL(url);
      Object.entries(config.params).forEach(([key, value]) => target.searchParams.set(key, String(value)));
      url = target.href;
    }
    let body = config.data;
    const headers = { ...(config.headers || {}) };
    if (body != null && typeof body === "object" && !(body instanceof URLSearchParams)) {
      body = JSON.stringify(body);
      if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/json";
      }
    } else if (body instanceof URLSearchParams) {
      body = body.toString();
    }
    const response = await fetchImpl(url, { method: config.method || "GET", headers, body });
    const text = await response.text();
    let data = text;
    if (config.responseType !== "text") {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    const result = { data, status: response.status, statusText: response.statusText || "", headers: {}, config };
    response.headers?.forEach?.((value, key) => {
      result.headers[key] = value;
    });
    if (response.status >= 400) {
      const error = new Error(`Request failed with status code ${response.status}`);
      error.response = result;
      throw error;
    }
    return result;
  };
  const withMethod = (method) => (url, config = {}) => request({ ...config, url, method });
  const withBody = (method) => (url, data, config = {}) => request({ ...config, url, data, method });
  const axios = (configOrUrl, config) =>
    typeof configOrUrl === "string" ? request({ ...config, url: configOrUrl }) : request(configOrUrl);
  Object.assign(axios, {
    request,
    get: withMethod("GET"),
    delete: withMethod("DELETE"),
    head: withMethod("HEAD"),
    post: withBody("POST"),
    put: withBody("PUT"),
    create: () => axios,
    default: axios
  });
  return axios;
}

export function createRequire(modules = {}) {
  const table = {
    cheerio: modules.cheerio,
    "cheerio-without-node-native": modules.cheerio,
    "react-native-cheerio": modules.cheerio,
    "crypto-js": modules.cryptoJs,
    axios: modules.axios
  };
  return (name) => {
    const resolved = table[String(name)];
    if (!resolved) throw new Error(`Module not available to plugins: ${name}`);
    return resolved;
  };
}

// Globals the desktop app defines before running a plugin. Set on the global
// object (not passed as parameters) so a plugin that declares its own
// `const TMDB_API_KEY` still parses; restored afterwards for in-process runs.
export function pluginHostGlobals({ scraperId = "", settings = {}, tmdbApiKey = "" } = {}) {
  const scope = globalThis;
  const globals = {
    SCRAPER_ID: String(scraperId || ""),
    SCRAPER_SETTINGS: settings && typeof settings === "object" ? settings : {},
    global: scope,
    window: scope
  };
  if (tmdbApiKey) globals.TMDB_API_KEY = String(tmdbApiKey);
  return globals;
}

function applyGlobals(globals) {
  const scope = globalThis;
  const saved = Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(scope, key)]);
  Object.entries(globals).forEach(([key, value]) => {
    // Keep a global the environment already has (a worker's own `self`-style
    // names); only fill what is missing, as the desktop shim does.
    if (key === "global" || key === "window") {
      if (typeof scope[key] === "undefined") scope[key] = value;
      return;
    }
    scope[key] = value;
  });
  return () => {
    saved.forEach(([key, descriptor]) => {
      if (descriptor) Object.defineProperty(scope, key, descriptor);
      else delete scope[key];
    });
  };
}

export async function runScraperCode({ code, args = [], modules = {}, fetchImpl, consoleImpl = console, globals = null }) {
  const restoreGlobals = globals ? applyGlobals(globals) : () => {};
  try {
    return await runScraperCodeInner({ code, args, modules, fetchImpl, consoleImpl });
  } finally {
    restoreGlobals();
  }
}

function loadPluginModule({ code, modules, fetchImpl, consoleImpl }) {
  const module = { exports: {} };
  const require = createRequire(modules);
  const hidden = HIDDEN_GLOBALS.map(() => undefined);
  const factory = new Function(
    "module", "exports", "require", "fetch", "console", ...HIDDEN_GLOBALS,
    `${String(code || "")}
;return {` +
      ` getStreams: typeof getStreams === "function" ? getStreams : undefined,` +
      ` onSettings: typeof onSettings === "function" ? onSettings : undefined };`
  );
  const globals = factory(module, module.exports, require, fetchImpl, consoleImpl, ...hidden) || {};
  const exported = module.exports;
  return {
    getStreams:
      (typeof exported?.getStreams === "function" && exported.getStreams) ||
      (typeof exported === "function" && exported) ||
      globals.getStreams,
    onSettings: (typeof exported?.onSettings === "function" && exported.onSettings) || globals.onSettings
  };
}

async function runScraperCodeInner({ code, args, modules, fetchImpl, consoleImpl }) {
  const { getStreams } = loadPluginModule({ code, modules, fetchImpl, consoleImpl });
  if (typeof getStreams !== "function") {
    throw new Error("Scraper does not export getStreams");
  }
  const raw = await getStreams(...args);
  return cleanPluginStreams(raw);
}

const SETTING_TYPES = new Set(["header", "info", "text", "toggle", "select"]);
const MAX_SETTINGS = 50;

function settingText(value, max = 200) {
  return value == null ? "" : String(value).slice(0, max);
}

// The settings form a plugin describes with onSettings(), in the desktop
// app's format. Anything unrecognised is dropped.
export function normalizeSettingsLayout(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw
    .slice(0, MAX_SETTINGS)
    .map((item) => {
      const type = String(item?.type || "").toLowerCase();
      if (!SETTING_TYPES.has(type)) return null;
      const field = { type, label: settingText(item.label || item.title), description: settingText(item.description, 500) };
      if (type === "header" || type === "info") return field.label || field.description ? field : null;
      const key = settingText(item.key, 80).trim();
      if (!key || seen.has(key)) return null;
      seen.add(key);
      field.key = key;
      if (type === "text") {
        field.placeholder = settingText(item.placeholder);
        field.isPassword = item.isPassword === true;
        field.defaultValue = settingText(item.defaultValue, 2000);
      } else if (type === "toggle") {
        field.defaultValue = item.defaultValue === true || item.defaultValue === "true";
      } else {
        field.options = (Array.isArray(item.options) ? item.options : [])
          .slice(0, 100)
          .map((option) =>
            option && typeof option === "object"
              ? { label: settingText(option.label ?? option.value), value: settingText(option.value ?? option.label) }
              : { label: settingText(option), value: settingText(option) }
          )
          .filter((option) => option.value !== "");
        if (!field.options.length) return null;
        field.defaultValue = settingText(item.defaultValue ?? field.options[0].value);
      }
      return field;
    })
    .filter(Boolean);
}

// The plugin's settings form, or [] when it has none.
export async function runSettingsCode({ code, modules = {}, fetchImpl, consoleImpl = console, globals = null }) {
  const restoreGlobals = globals ? applyGlobals(globals) : () => {};
  try {
    const { onSettings } = loadPluginModule({ code, modules, fetchImpl, consoleImpl });
    if (typeof onSettings !== "function") return [];
    return normalizeSettingsLayout(await onSettings());
  } finally {
    restoreGlobals();
  }
}
