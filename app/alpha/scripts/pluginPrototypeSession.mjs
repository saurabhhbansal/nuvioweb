// Test-only, default-off lifecycle seam. No application import, storage, real
// transport or public API. Configuration is trusted host policy, never plugin input.
import { normalizePluginDescriptor, normalizePluginHost } from "../js/core/plugins/pluginContract.js";
import { pluginMediaInput } from "./pluginPrototypeInput.mjs";

export function createPluginPrototypeSession({
  enabled = false, approvedHosts = [], transport,
  loadEngine = () => import("./pluginSandboxNetworkPrototype.mjs"),
  maxExecutions = 4, maxFailures = 3
} = {}) {
  if (!Number.isSafeInteger(maxExecutions) || maxExecutions < 1 || maxExecutions > 16 ||
      !Number.isSafeInteger(maxFailures) || maxFailures < 1 || maxFailures > 4) throw new TypeError("invalid session limits");
  const approved = new Set(approvedHosts.map(normalizePluginHost).filter(Boolean));
  let active;
  let executions = 0;
  let failures = 0;
  let closed = enabled !== true;

  return Object.freeze({
    async execute(descriptor, input = {}, { signal } = {}) {
      if (closed) return { ok: false, error: "disabled" };
      if (active) return { ok: false, error: "busy" };
      if (executions >= maxExecutions || failures >= maxFailures) return { ok: false, error: "session-quota" };
      if (signal?.aborted) return { ok: false, error: "cancelled" };
      const normalized = normalizePluginDescriptor(descriptor);
      if (!normalized.ok) return { ok: false, error: "descriptor" };
      const plugin = normalized.descriptor;
      // Never turn the descriptor's self-declared hosts into host authorization.
      if (plugin.allowedHosts.some((host) => !approved.has(host))) return { ok: false, error: "host-policy" };
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      active = controller;
      executions += 1;
      try {
        // Lazy only after opt-in, quota, descriptor and host-policy gates.
        const engine = await loadEngine();
        if (controller.signal.aborted || closed) return { ok: false, error: "cancelled" };
        // Input intentionally contains only media identity, never arbitrary
        // account/session data, settings, credentials or caller metadata.
        const safeInput = pluginMediaInput(input);
        const result = await engine.executePluginWithNetworkPrototype({
          code: plugin.code, allowedHosts: plugin.allowedHosts, input: safeInput,
          transport, signal: controller.signal, limits: { logs: 0 }
        });
        if (controller.signal.aborted || closed) return { ok: false, error: "cancelled" };
        if (!result.ok) { failures += 1; return { ok: false, error: result.error }; }
        // Deliberately discard arbitrary plugin logs and host diagnostics.
        return { ok: true, groups: result.groups, dropped: result.dropped };
      } catch {
        failures += 1;
        return { ok: false, error: controller.signal.aborted ? "cancelled" : "engine" };
      } finally {
        signal?.removeEventListener("abort", cancel);
        controller.abort();
        active = undefined;
      }
    },
    disable() { closed = true; active?.abort(); },
    get status() { return { enabled: !closed, active: Boolean(active), executions, failures }; }
  });
}
