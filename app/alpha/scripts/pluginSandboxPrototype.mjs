// Test-only sandbox prototype for Nuvio JavaScript plugins.
//
// This module is NOT imported by the shipped application and its dependency is a
// devDependency: it exists to prove that an engine-level sandbox (QuickJS/WASM)
// can execute a representative plugin with only injected bindings, no host
// globals, and enforced time/memory/output budgets before any runtime is wired.
//
// The prototype pumps QuickJS pending jobs so an async function that resolves
// without host I/O (the representative fixture) can finish. Brokered network
// requests and real cancellation are the next unit; a plugin awaiting host I/O
// here simply hits the wall-clock budget.
// See docs/PLUGIN_COMPATIBILITY.md for the staged plan and limits.
import { getQuickJS } from "quickjs-emscripten";
import { normalizePluginResult, PLUGIN_CONTRACT_LIMITS } from "../js/core/plugins/pluginContract.js";

export const PLUGIN_SANDBOX_DEFAULTS = Object.freeze({
  timeMs: 250,
  memoryBytes: 16 * 1024 * 1024,
  stackBytes: 512 * 1024,
  outputBytes: 64 * 1024,
  logs: 20,
  logLength: 200
});

function failureCode(error, deadline) {
  if (Date.now() > deadline) return "timeout";
  const message = String(error?.message || "");
  if (/out of memory|memory limit|\boom\b/i.test(message)) return "memory";
  if (/stack|too deep/i.test(message)) return "stack";
  if (/interrupt/i.test(message)) return "timeout";
  return "runtime";
}

function dumpHandle(context, handle) {
  try {
    return context.dump(handle);
  } catch {
    return undefined;
  }
}

export async function executePluginPrototype({ code, input = {}, limits = {} } = {}) {
  if (typeof code !== "string" || !code.trim()) return { ok: false, error: "code" };
  if (new TextEncoder().encode(code).length > PLUGIN_CONTRACT_LIMITS.codeBytes) return { ok: false, error: "code-size" };
  const budget = { ...PLUGIN_SANDBOX_DEFAULTS, ...limits };
  const startedAt = Date.now();
  const deadline = startedAt + budget.timeMs;
  const logs = [];
  let QuickJS;
  try {
    QuickJS = await getQuickJS();
  } catch {
    return { ok: false, error: "engine" };
  }
  const context = QuickJS.newContext();
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

    const setup = context.evalCode(
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
      const detail = dumpHandle(context, setup.error);
      setup.error.dispose();
      return { ok: false, error: failureCode({ message: detail?.message || "" }, deadline) };
    }
    setup.value.dispose();

    let serialized;
    for (;;) {
      const jobs = context.runtime.executePendingJobs(50);
      if (jobs.error) {
        const detail = dumpHandle(context, jobs.error);
        jobs.error.dispose();
        return { ok: false, error: failureCode({ message: detail?.message || "" }, deadline) };
      }
      const doneProbe = context.evalCode("String(globalThis.__nuvioDone)");
      const resultProbe = context.evalCode("String(globalThis.__nuvioResult)");
      const errorProbe = context.evalCode("String(globalThis.__nuvioError)");
      let done;
      let result;
      let pluginError;
      try {
        done = dumpHandle(context, doneProbe.value);
        result = dumpHandle(context, resultProbe.value);
        pluginError = dumpHandle(context, errorProbe.value);
      } finally {
        doneProbe.value.dispose();
        resultProbe.value.dispose();
        errorProbe.value.dispose();
      }
      if (doneProbe.error) doneProbe.error.dispose();
      if (errorProbe.error) errorProbe.error.dispose();
      if (resultProbe.error) resultProbe.error.dispose();
      if (done === "true") {
        if (typeof pluginError === "string" && pluginError !== "undefined") {
          // A rejected promise can be a quota interrupt or a genuine plugin error.
          const classified = failureCode({ message: pluginError }, deadline);
          return { ok: false, error: classified === "runtime" ? "plugin" : classified, elapsedMs: Date.now() - startedAt };
        }
        if (typeof result === "string" && result !== "undefined") {
          serialized = result;
          break;
        }
        return { ok: false, error: "output", elapsedMs: Date.now() - startedAt };
      }
      if (jobs.value === 0) {
        return { ok: false, error: "timeout", elapsedMs: Date.now() - startedAt };
      }
      if (Date.now() > deadline) {
        return { ok: false, error: "timeout", elapsedMs: Date.now() - startedAt };
      }
    }
    if (serialized.length > budget.outputBytes) {
      return { ok: false, error: "output-size", elapsedMs: Date.now() - startedAt };
    }
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
      elapsedMs: Date.now() - startedAt
    };
  } catch (error) {
    return { ok: false, error: failureCode(error, deadline), elapsedMs: Date.now() - startedAt };
  } finally {
    try {
      context.dispose();
    } catch {}
  }
}
