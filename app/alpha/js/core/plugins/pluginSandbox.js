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

async function runScraperCodeInner({ code, args, modules, fetchImpl, consoleImpl }) {
  const module = { exports: {} };
  const require = createRequire(modules);
  const hidden = HIDDEN_GLOBALS.map(() => undefined);
  const factory = new Function(
    "module", "exports", "require", "fetch", "console", ...HIDDEN_GLOBALS,
    `${String(code || "")}\n;return typeof getStreams === "function" ? getStreams : undefined;`
  );
  const globalGetStreams = factory(module, module.exports, require, fetchImpl, consoleImpl, ...hidden);
  const getStreams =
    (typeof module.exports?.getStreams === "function" && module.exports.getStreams) ||
    (typeof module.exports === "function" && module.exports) ||
    globalGetStreams;
  if (typeof getStreams !== "function") {
    throw new Error("Scraper does not export getStreams");
  }
  const raw = await getStreams(...args);
  return cleanPluginStreams(raw);
}
