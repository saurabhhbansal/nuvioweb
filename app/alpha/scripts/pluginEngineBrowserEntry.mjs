// Browser-only fixture entry for the opt-in plugin engine asset build.
//
// This module is NOT imported by the application bundle, the static preview or
// the stager. It exists so the browser test can execute the real broker-bound
// QuickJS prototype with a synthetic in-memory transport. The VM receives only
// the injected bindings from pluginSandboxNetworkPrototype; no headers,
// credentials, cookies or real network access cross the boundary.
import { executePluginWithNetworkPrototype } from "./pluginSandboxNetworkPrototype.mjs";

const SYNTHETIC_BODIES = new Map([
  ["/data", JSON.stringify({ ok: true, value: 42 })],
  ["/slow", "slow"]
]);

globalThis.__nuvioPluginEngine = {
  async run({ code, input = {}, allowedHosts = [], limits = {}, brokerLimits = {} } = {}) {
    const transportCalls = [];
    const transport = async (url) => {
      transportCalls.push(url);
      const path = new URL(url).pathname;
      if (SYNTHETIC_BODIES.has(path)) {
        return { status: 200, headers: {}, body: SYNTHETIC_BODIES.get(path) };
      }
      return { status: 404, headers: {}, body: "" };
    };
    const result = await executePluginWithNetworkPrototype({
      code,
      input,
      allowedHosts,
      transport,
      limits,
      brokerLimits
    });
    // Return only a count: synthetic request paths stay inside the page.
    return { ...result, transportCalls: transportCalls.length };
  }
};
