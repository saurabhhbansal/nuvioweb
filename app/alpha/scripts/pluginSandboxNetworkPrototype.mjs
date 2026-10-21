// Test-only broker-bound sandbox prototype.
//
// Extends the QuickJS prototype with the bounded network broker as the VM's
// ONLY network primitive: sync/Promise guest facades share
// `createPluginNetworkBroker`; trusted policy bounds guest metadata headers.
// No global host fetch, credentials or arbitrary destination. Not wired to
// the application; independent security review is required before that.
import { newAsyncContext } from "quickjs-emscripten";
import { createPluginNetworkBroker } from "../js/core/plugins/pluginBroker.js";
import { normalizePluginResult, PLUGIN_CONTRACT_LIMITS } from "../js/core/plugins/pluginContract.js";
import { pluginSandboxBudget } from "./pluginSandboxLimits.mjs";
export { PLUGIN_SANDBOX_CEILINGS } from "./pluginSandboxLimits.mjs";

function networkErrorCode(message) {
  if (message === "plugin-output:playback-headers") return "playback-headers";
  const match = /plugin-network:([a-z-]+)/.exec(String(message || ""));
  const codes = new Set(["url", "scheme", "credentials", "host", "port", "ip", "method", "requests", "redirect-limit", "redirect-url", "response-size", "response-total", "response-body", "transport", "cancelled", "timeout", "header-shape", "header-policy", "header-duplicate", "header-value", "header-size", "header-origin", "request-options", "request-size", "dns-policy", "dns", "private-address", "redirect-mode", "redirect-disallowed", "redirect-unvalidated", "async-fetch-required"]);
  return match && codes.has(match[1]) ? match[1] : null;
}

export async function executePluginWithNetworkPrototype({
  code,
  input = {},
  allowedHosts = [],
  transport,
  limits = {},
  brokerLimits = {},
  signal,
  validateResult, headerPolicy, resolveHost
} = {}) {
  if (typeof code !== "string" || !code.trim()) return { ok: false, error: "code" };
  if (new TextEncoder().encode(code).length > PLUGIN_CONTRACT_LIMITS.codeBytes) return { ok: false, error: "code-size" };
  if (typeof transport !== "function") return { ok: false, error: "transport-config" };
  const budget = pluginSandboxBudget(limits);
  if (!budget) return { ok: false, error: "limits" };
  if (signal?.aborted) return { ok: false, error: "cancelled" };
  let inputJson;
  try { inputJson = JSON.stringify(input ?? {}); } catch { return { ok: false, error: "input" }; }
  if (typeof inputJson !== "string" || new TextEncoder().encode(inputJson).length > budget.inputBytes) return { ok: false, error: "input-size" };
  const startedAt = Date.now();
  const logs = [];
  let inflightHostCalls = 0;
  let pumpingJobs = false;
  const pendingReplies = new Set();
  const completedReplies = [];
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let broker;
  try {
    broker = createPluginNetworkBroker({
      allowedHosts, transport, signal: controller.signal, headerPolicy, resolveHost,
      maxRequests: brokerLimits.maxRequests ?? 4,
      maxResponseBytes: brokerLimits.maxResponseBytes ?? 256 * 1024,
      maxTotalResponseBytes: brokerLimits.maxTotalResponseBytes ?? 1024 * 1024,
      maxRedirects: brokerLimits.maxRedirects ?? 2
    });
  } catch { return { ok: false, error: "limits" }; }
  signal?.addEventListener("abort", cancel, { once: true });
  let context;
  let timer;
  let deadline = Infinity;
  const stopped = () => signal?.aborted ? "cancelled" : Date.now() >= deadline || controller.signal.aborted ? "timeout" : null;
  try {
    try { context = await newAsyncContext(); }
    catch { return { ok: false, error: "engine" }; }
    if (signal?.aborted) return { ok: false, error: "cancelled" };
    // WASM startup is not plugin execution time. Only the running VM receives
    // this deadline; cancellation during startup is observed before execution.
    deadline = Date.now() + budget.timeMs;
    timer = setTimeout(cancel, budget.timeMs);
    context.runtime.setMemoryLimit(budget.memoryBytes);
    context.runtime.setMaxStackSize(budget.stackBytes);
    context.runtime.setInterruptHandler(() => Boolean(stopped()));

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

    const inputHandle = context.newString(inputJson);
    context.setProp(context.global, "inputJson", inputHandle);
    inputHandle.dispose();

    function readRequest(urlHandle, optionsHandle) {
      const url = context.getString(urlHandle);
      const kind = optionsHandle ? context.typeof(optionsHandle) : "undefined";
      if (!["string", "undefined"].includes(kind)) return { error: "request-options" };
      const rawOptions = kind === "string" ? context.getString(optionsHandle) : "{}";
      if (new TextEncoder().encode(rawOptions).length > 12288) return { error: "request-size" };
      try { return { url, options: JSON.parse(rawOptions) }; } catch { return { error: "request-options" }; }
    }
    async function perform(request) {
      if (request.error) return { ok: false, error: request.error };
      try { return await broker.request(request.url, request.options); }
      catch { return { ok: false, error: "transport" }; }
    }
    const hostFetch = context.newAsyncifiedFunction("__hostFetch", (urlHandle, optionsHandle) => {
      // Asyncify cannot suspend the synchronous job pump. Legacy synchronous
      // callers fail closed here; the async facade uses a guest Promise below.
      if (pumpingJobs) return context.newString('{"ok":false,"error":"async-fetch-required"}');
      const request = readRequest(urlHandle, optionsHandle);
      inflightHostCalls++;
      return perform(request).then(result => context.newString(JSON.stringify(result))).finally(() => { inflightHostCalls--; });
    });
    context.setProp(context.global, "__hostFetch", hostFetch);
    hostFetch.dispose();
    const hostFetchAsync = context.newFunction("__hostFetchAsync", (urlHandle, optionsHandle) => {
      if (pendingReplies.size >= broker.limits.maxRequests) return context.newString('{"ok":false,"error":"requests"}');
      const request = readRequest(urlHandle, optionsHandle);
      const reply = context.newPromise();
      pendingReplies.add(reply);
      inflightHostCalls++;
      // Never enter the VM from a transport continuation (including while a
      // legacy Asyncify frame is suspended). Drain completions at the job pump.
      void perform(request).then(result => { completedReplies.push({ reply, result }); }).finally(() => { inflightHostCalls--; });
      return reply.handle.dup();
    });
    context.setProp(context.global, "__hostFetchAsync", hostFetchAsync);
    hostFetchAsync.dispose();

    const prelude = context.evalCode(`
api.fetch = function (url, options) {
  var encoded = JSON.stringify(options === undefined ? {} : options);
  if (typeof encoded !== "string" || encoded.length > 12288) throw new Error("plugin-network:request-size");
  var result = JSON.parse(__hostFetch(String(url), encoded));
  if (!result.ok) {
    var failure = new Error("plugin-network:" + result.error);
    failure.code = result.error;
    throw failure;
  }
  return result;
};
api.fetchAsync = async function (url, options) {
  var encoded = JSON.stringify(options === undefined ? {} : options);
  if (typeof encoded !== "string" || encoded.length > 12288) throw new Error("plugin-network:request-size");
  var result = JSON.parse(await __hostFetchAsync(String(url), encoded));
  if (!result.ok) throw new Error("plugin-network:" + result.error);
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
    if (stopped()) {
      setup.error?.dispose();
      setup.value?.dispose();
      return { ok: false, error: stopped(), elapsedMs: Date.now() - startedAt };
    }
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
      for (const { reply, result } of completedReplies.splice(0)) {
        const value = context.newString(JSON.stringify(result));
        try { reply.resolve(value); } finally { value.dispose(); reply.dispose(); pendingReplies.delete(reply); }
      }
      let jobs;
      pumpingJobs = true;
      try { jobs = context.runtime.executePendingJobs(50); } finally { pumpingJobs = false; }
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
      if (stopped()) return { ok: false, error: stopped(), elapsedMs: Date.now() - startedAt };
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
        for (const probe of [doneProbe, resultProbe, errorProbe]) {
          probe.value?.dispose();
          probe.error?.dispose();
        }
      }

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
        // Let a suspended host call unwind after broker cancellation before
        // disposing the context; disposing mid-suspension crashes.
        while (inflightHostCalls > 0 && Date.now() < deadline + 100) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        return { ok: false, error: "timeout", elapsedMs: Date.now() - startedAt };
      }
      // Let already-ready broker promises settle before a timer hop. Bound the
      // microtask drain, then yield to I/O/timers so abort/deadline cannot starve.
      for (let turn = 0; turn < 32 && inflightHostCalls > 0 && !completedReplies.length; turn++) await Promise.resolve();
      if (jobs.value === 0 && !completedReplies.length) await new Promise((resolve) => setTimeout(resolve, 2));
    }

    if (stopped()) return { ok: false, error: stopped(), elapsedMs: Date.now() - startedAt };
    if (new TextEncoder().encode(serialized).length > budget.outputBytes) return { ok: false, error: "output-size" };
    let parsed;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      return { ok: false, error: "output-json" };
    }
    // Compatibility policies must inspect plain serialized data on the host:
    // guest getters/toJSON can change fields after any in-guest validation.
    if (validateResult !== undefined && (typeof validateResult !== "function" || validateResult(parsed) !== true)) {
      return { ok: false, error: "output-policy" };
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
      error: stopped() || networkCode || "runtime",
      elapsedMs: Date.now() - startedAt
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.abort();
    // The broker settles ignored aborts before the asyncified host function
    // unwinds; late transport responses have no reference to this context.
    while (inflightHostCalls > 0) await new Promise((resolve) => setTimeout(resolve, 0));
    for (const reply of pendingReplies) reply.dispose();
    pendingReplies.clear();
    completedReplies.length = 0;
    try { context?.dispose(); } catch {}
  }
}
