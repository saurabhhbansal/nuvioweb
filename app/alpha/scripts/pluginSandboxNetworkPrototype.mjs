// Test-only broker-bound sandbox prototype.
//
// Extends the QuickJS prototype with the bounded network broker as the VM's
// ONLY network primitive: `api.fetch` is an asyncified host function backed by
// `createPluginNetworkBroker`, so the VM never sees global fetch, headers,
// credentials or an arbitrary destination. Still not shipped and not wired to
// the application; independent security review is required before that.
import { newAsyncContext } from "quickjs-emscripten";
import { createPluginNetworkBroker } from "../js/core/plugins/pluginBroker.js";
import { normalizePluginResult, PLUGIN_CONTRACT_LIMITS } from "../js/core/plugins/pluginContract.js";
import { PLUGIN_SANDBOX_DEFAULTS } from "./pluginSandboxPrototype.mjs";

function withDeadline(promise, deadline) {
  let timer;
  const remaining = Math.max(0, deadline - Date.now());
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: "timeout" }), remaining);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function networkErrorCode(message) {
  const match = /plugin-network:([a-z-]+)/.exec(String(message || ""));
  return match ? match[1] : null;
}

export async function executePluginWithNetworkPrototype({
  code,
  input = {},
  allowedHosts = [],
  transport,
  limits = {},
  brokerLimits = {}
} = {}) {
  if (typeof code !== "string" || !code.trim()) return { ok: false, error: "code" };
  if (new TextEncoder().encode(code).length > PLUGIN_CONTRACT_LIMITS.codeBytes) return { ok: false, error: "code-size" };
  if (typeof transport !== "function") return { ok: false, error: "transport-config" };
  const budget = { ...PLUGIN_SANDBOX_DEFAULTS, ...limits };
  const startedAt = Date.now();
  const logs = [];
  let inflightHostCalls = 0;
  const broker = createPluginNetworkBroker({
    allowedHosts,
    transport,
    maxRequests: brokerLimits.maxRequests ?? 4,
    maxResponseBytes: brokerLimits.maxResponseBytes ?? 256 * 1024,
    maxRedirects: brokerLimits.maxRedirects ?? 2
  });

  let context;
  try {
    context = await newAsyncContext();
  } catch {
    return { ok: false, error: "engine" };
  }
  // The execution budget starts after engine construction so slow WASM startup
  // cannot consume the plugin's wall-clock allowance.
  const deadline = Date.now() + budget.timeMs;
  try {
    context.runtime.setMemoryLimit(budget.memoryBytes);
    context.runtime.setMaxStackSize(budget.stackBytes);
    context.runtime.setInterruptHandler(() => Date.now() > deadline);

    const api = context.newObject();
    const log = context.newFunction("log", (...args) => {
      if (logs.length >= budget.logs) return;
      const parts = args.map((argument) => {
        try {
          return String(context.dump(argument) ?? "");
        } catch {
          return "";
        }
      });
      logs.push(parts.join(" ").slice(0, budget.logLength));
    });
    context.setProp(api, "log", log);
    log.dispose();
    context.setProp(context.global, "api", api);
    api.dispose();

    const inputHandle = context.newString(JSON.stringify(input ?? {}));
    context.setProp(context.global, "inputJson", inputHandle);
    inputHandle.dispose();

    const hostFetch = context.newAsyncifiedFunction("__hostFetch", async (urlHandle) => {
      inflightHostCalls += 1;
      try {
        const url = context.getString(urlHandle);
        const result = await withDeadline(broker.request(url), deadline);
        return context.newString(JSON.stringify(result));
      } finally {
        inflightHostCalls -= 1;
      }
    });
    context.setProp(context.global, "__hostFetch", hostFetch);
    hostFetch.dispose();

    const prelude = context.evalCode(`
api.fetch = function (url) {
  var result = JSON.parse(__hostFetch(String(url)));
  if (!result.ok) {
    var failure = new Error("plugin-network:" + result.error);
    failure.code = result.error;
    throw failure;
  }
  return result;
};`);
    if (prelude.error) {
      prelude.error.dispose();
      return { ok: false, error: "engine" };
    }
    prelude.value.dispose();

    const setup = await context.evalCodeAsync(
      `${code}
;globalThis.__nuvioResult = undefined;
globalThis.__nuvioError = undefined;
globalThis.__nuvioDone = false;
resolve(api, JSON.parse(inputJson)).then(
  function (value) { globalThis.__nuvioResult = JSON.stringify(value); globalThis.__nuvioDone = true; },
  function (error) { globalThis.__nuvioError = String((error && error.message) || error); globalThis.__nuvioDone = true; }
);`,
      "plugin.js"
    );
    if (setup.error) {
      let detail;
      try {
        detail = context.dump(setup.error);
      } catch {}
      setup.error.dispose();
      const networkCode = networkErrorCode(detail?.message);
      return {
        ok: false,
        error: networkCode || (Date.now() > deadline ? "timeout" : "runtime"),
        elapsedMs: Date.now() - startedAt
      };
    }
    setup.value.dispose();

    let serialized;
    for (;;) {
      const jobs = context.runtime.executePendingJobs(50);
      if (jobs.error) {
        let detail;
        try {
          detail = context.dump(jobs.error);
        } catch {}
        jobs.error.dispose();
        return {
          ok: false,
          error: /out of memory|oom|memory limit/i.test(String(detail?.message || ""))
            ? "memory"
            : Date.now() > deadline
              ? "timeout"
              : "runtime",
          elapsedMs: Date.now() - startedAt
        };
      }
      const doneProbe = context.evalCode("String(globalThis.__nuvioDone)");
      const resultProbe = context.evalCode("String(globalThis.__nuvioResult)");
      const errorProbe = context.evalCode("String(globalThis.__nuvioError)");
      let doneValue;
      let resultValue;
      let errorValue;
      try {
        doneValue = context.dump(doneProbe.value);
        resultValue = context.dump(resultProbe.value);
        errorValue = context.dump(errorProbe.value);
      } finally {
        doneProbe.value.dispose();
        resultProbe.value.dispose();
        errorProbe.value.dispose();
      }
      if (doneProbe.error) doneProbe.error.dispose();
      if (resultProbe.error) resultProbe.error.dispose();
      if (errorProbe.error) errorProbe.error.dispose();

      if (doneValue === "true") {
        if (typeof errorValue === "string" && errorValue !== "undefined") {
          const networkCode = networkErrorCode(errorValue);
          // An in-VM allocation overshoot can surface as a catchable plugin
          // rejection rather than an engine-level failure. Classify it with the
          // same word-bounded OOM rule used for engine errors.
          const memoryFailure = /\bout of memory\b|memory limit|\boom\b/i.test(errorValue);
          return {
            ok: false,
            error: networkCode || (memoryFailure ? "memory" : Date.now() > deadline ? "timeout" : "plugin"),
            elapsedMs: Date.now() - startedAt
          };
        }
        if (typeof resultValue === "string" && resultValue !== "undefined") {
          serialized = resultValue;
          break;
        }
        return { ok: false, error: "output", elapsedMs: Date.now() - startedAt };
      }
      if (Date.now() > deadline) {
        // Let a suspended host call resume (it is bounded by withDeadline)
        // before the context is disposed; disposing mid-suspension crashes.
        while (inflightHostCalls > 0 && Date.now() < deadline + 100) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        return { ok: false, error: "timeout", elapsedMs: Date.now() - startedAt };
      }
      if (jobs.value === 0) {
        // The VM may be suspended waiting for a host promise; yield so it can
        // settle instead of reporting a false timeout.
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }

    if (serialized.length > budget.outputBytes) return { ok: false, error: "output-size" };
    let parsed;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      return { ok: false, error: "output-json" };
    }
    const normalized = normalizePluginResult(parsed);
    return {
      ok: true,
      groups: normalized.groups,
      dropped: normalized.dropped,
      logs,
      requests: broker.requestCount,
      elapsedMs: Date.now() - startedAt
    };
  } catch (error) {
    const networkCode = networkErrorCode(error?.message);
    return {
      ok: false,
      error: networkCode || (Date.now() > deadline ? "timeout" : "runtime"),
      elapsedMs: Date.now() - startedAt
    };
  } finally {
    try {
      context.dispose();
    } catch {}
  }
}
