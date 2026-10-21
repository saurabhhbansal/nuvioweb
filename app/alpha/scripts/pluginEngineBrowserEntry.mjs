// Browser-only fixture entry for the opt-in plugin engine asset build.
//
// This module is NOT imported by the application bundle, the static preview or
// the stager. It exists so the browser test can execute the real broker-bound
// QuickJS prototype with a synthetic in-memory transport. The VM receives only
// the injected bindings from pluginSandboxNetworkPrototype; no headers,
// credentials, cookies or real network access cross the boundary.
import { executePluginWithNetworkPrototype } from "./pluginSandboxNetworkPrototype.mjs";
import { createPluginPrototypeSession } from "./pluginPrototypeSession.mjs";
import { executeGetStreamsPrototype } from "./pluginGetStreamsPrototype.mjs";

const SYNTHETIC_BODIES = new Map([
  ["/data", JSON.stringify({ ok: true, value: 42 })],
  ["/slow", "slow"]
]);

globalThis.__nuvioPluginEngine = {
  async run({ code, input = {}, allowedHosts = [], limits = {}, brokerLimits = {}, cancelOnDispatch = false } = {}) {
    const transportCalls = [];
    const controller = new AbortController();
    let transportSignal;
    let cancelTimer;
    const transport = async (url, { signal }) => {
      transportCalls.push(url);
      transportSignal = signal;
      const path = new URL(url).pathname;
      if (path === "/slow") {
        if (cancelOnDispatch) cancelTimer = setTimeout(() => controller.abort(), 5);
        // Deliberately ignores abort: teardown must discard this late operation.
        return new Promise(() => {});
      }
      if (SYNTHETIC_BODIES.has(path)) return { status: 200, headers: {}, body: SYNTHETIC_BODIES.get(path) };
      return { status: 404, headers: {}, body: "" };
    };
    try {
      const result = await executePluginWithNetworkPrototype({
        code, input, allowedHosts, transport, limits, brokerLimits, signal: controller.signal
      });
      return { ...result, transportCalls: transportCalls.length, transportAborted: transportSignal?.aborted ?? false };
    } finally { clearTimeout(cancelTimer); }
  },
  async runGetStreams({ descriptor, input } = {}) {
    let transportCalls = 0;
    const result = await executeGetStreamsPrototype({
      descriptor, input, transport: async () => {
        transportCalls += 1;
        return { status: 200, body: '{"url":"https://media.example/s"}' };
      }
    });
    return { ...result, transportCalls };
  },
  async runSession({ enabled, descriptor, input } = {}) {
    const session = createPluginPrototypeSession({
      enabled, approvedHosts: ["allowed.example"], maxExecutions: 1,
      transport: async () => ({ status: 200, body: "" })
    });
    const first = await session.execute(descriptor, input);
    const second = await session.execute(descriptor, input);
    return { first, second, status: session.status };
  }
};
