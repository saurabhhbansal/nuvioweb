// Trusted, finite prototype budgets. The guest stack must trip before the
// host/WASM stack; 512KiB formerly produced a host RangeError and dirty teardown.
export const PLUGIN_SANDBOX_DEFAULTS = Object.freeze({
  timeMs: 250, memoryBytes: 16 * 1024 * 1024, stackBytes: 64 * 1024,
  inputBytes: 1024 * 1024, outputBytes: 64 * 1024, logs: 20, logLength: 200
});
export const PLUGIN_SANDBOX_CEILINGS = Object.freeze({
  timeMs: 5000, memoryBytes: 32 * 1024 * 1024, stackBytes: 64 * 1024,
  inputBytes: 1024 * 1024, outputBytes: 1024 * 1024, logs: 20, logLength: 200
});
export function pluginSandboxBudget(limits = {}) {
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) return null;
  const budget = { ...PLUGIN_SANDBOX_DEFAULTS, ...limits };
  return Object.entries(budget).every(([key, value]) =>
    Object.hasOwn(PLUGIN_SANDBOX_CEILINGS, key) && Number.isSafeInteger(value) &&
    value >= (key === "logs" || key === "logLength" ? 0 : 1) && value <= PLUGIN_SANDBOX_CEILINGS[key]) ? budget : null;
}
