// Main-thread side of the plugin worker: one worker per scraper run,
// a hard timeout, and termination whatever happens.

export const PLUGIN_WORKER_URL = "./plugin-worker.bundle.js";
// Generous: some plugins chain several slow pages. Results still show as each
// plugin finishes, so a slow one does not hold back the rest.
export const DEFAULT_SCRAPER_TIMEOUT_MS = 45000;

const defaultWorkerFactory = () => new Worker(PLUGIN_WORKER_URL);

export function runScraperInWorker(
  { code, args, proxy = null, host = null, mode = "streams", timeoutMs = DEFAULT_SCRAPER_TIMEOUT_MS },
  { workerFactory = defaultWorkerFactory, appOrigin = globalThis.location?.origin || "" } = {}
) {
  return new Promise((resolve) => {
    let worker;
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        worker?.terminate();
      } catch {}
      resolve(result);
    };
    try {
      worker = workerFactory();
    } catch (error) {
      finish({ ok: false, streams: [], needsProxy: false, error: String(error?.message || "Worker unavailable") });
      return;
    }
    timer = setTimeout(() => finish({ ok: false, streams: [], needsProxy: false, timedOut: true, error: "Timed out" }), timeoutMs);
    worker.onmessage = (event) => {
      const data = event?.data || {};
      finish({
        ok: data.ok === true,
        streams: Array.isArray(data.streams) ? data.streams : [],
        needsProxy: data.needsProxy === true,
        layout: Array.isArray(data.layout) ? data.layout : [],
        error: data.error ? String(data.error) : ""
      });
    };
    worker.onerror = (event) => {
      event?.preventDefault?.();
      finish({ ok: false, streams: [], needsProxy: false, error: String(event?.message || "Worker error") });
    };
    worker.postMessage({ code, args, proxy, appOrigin, host, mode });
  });
}
