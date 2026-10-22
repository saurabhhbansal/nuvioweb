// Plugin Web Worker entry. Built to dist/plugin-worker.bundle.js by scripts/build.mjs.
// One worker runs one scraper once, then the main thread terminates it.
import { load } from "cheerio/slim";
import CryptoJS from "crypto-js";
import { createPluginFetch } from "./pluginNetwork.js";
import { createAxiosShim, pluginHostGlobals, runScraperCode, runSettingsCode } from "./pluginSandbox.js";

const scope = globalThis;

scope.onmessage = async (event) => {
  const { code, args, proxy, appOrigin, host, mode } = event.data || {};
  let needsProxy = false;
  const fetchImpl = createPluginFetch({
    fetchImpl: scope.fetch.bind(scope),
    proxy,
    appOrigin,
    onNeedsProxy: () => {
      needsProxy = true;
    }
  });
  const quiet = { log() {}, info() {}, debug() {}, warn() {}, error() {} };
  const modules = { cheerio: { load }, cryptoJs: CryptoJS, axios: createAxiosShim(fetchImpl) };
  if (mode === "settings") {
    try {
      const layout = await runSettingsCode({ code, fetchImpl, consoleImpl: quiet, globals: pluginHostGlobals(host || {}), modules });
      scope.postMessage({ ok: true, layout, streams: [] });
    } catch (error) {
      scope.postMessage({ ok: false, layout: [], streams: [], error: String(error?.message || error).slice(0, 300) });
    }
    return;
  }
  try {
    const streams = await runScraperCode({
      code,
      args,
      fetchImpl,
      consoleImpl: quiet,
      globals: pluginHostGlobals(host || {}),
      modules: { cheerio: { load }, cryptoJs: CryptoJS, axios: createAxiosShim(fetchImpl) }
    });
    scope.postMessage({ ok: true, streams, needsProxy });
  } catch (error) {
    scope.postMessage({ ok: false, streams: [], needsProxy: needsProxy || Boolean(error?.needsProxy), error: String(error?.message || error).slice(0, 300) });
  }
};
