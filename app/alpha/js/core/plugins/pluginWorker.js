// Plugin Web Worker entry. Built to dist/plugin-worker.bundle.js by scripts/build.mjs.
// One worker runs one scraper once, then the main thread terminates it.
import { load } from "cheerio/slim";
import CryptoJS from "crypto-js";
import { createPluginFetch } from "./pluginNetwork.js";
import { createAxiosShim, runScraperCode } from "./pluginSandbox.js";

const scope = globalThis;

scope.onmessage = async (event) => {
  const { code, args, proxy, appOrigin } = event.data || {};
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
  try {
    const streams = await runScraperCode({
      code,
      args,
      fetchImpl,
      consoleImpl: quiet,
      modules: { cheerio: { load }, cryptoJs: CryptoJS, axios: createAxiosShim(fetchImpl) }
    });
    scope.postMessage({ ok: true, streams, needsProxy });
  } catch (error) {
    scope.postMessage({ ok: false, streams: [], needsProxy: needsProxy || Boolean(error?.needsProxy), error: String(error?.message || error).slice(0, 300) });
  }
};
