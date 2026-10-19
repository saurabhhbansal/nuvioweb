# Nuvio JavaScript plugin compatibility — contract and status

Status: **bounded contract plus a test-only engine prototype; execution is not shipped and no plugin is supported yet.** Last updated 2026-10-19.

This document defines the bounded shapes that a future sandboxed plugin runtime must accept and return. It is deliberately narrower than "Nuvio JS plugin compatibility": nothing here executes third-party code, performs network requests, reads storage or touches the DOM. The inherited `pluginRuntime.js` remains a URL-template feature and is unchanged.

## Why execution is not implemented yet

- [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md) states that a browser Worker alone is insufficient for arbitrary trusted isolation. A Worker can still reach worker-global `fetch`, and same-origin storage or message channels create escape paths that static code review cannot reliably close.
- The credible options are an engine-level sandbox (QuickJS compiled to WASM with only injected bindings) or a cross-origin isolated container. Both need a dependency/licensing review, a bundle-size decision, a network broker design and a cancellation model before any untrusted code runs.
- The repository has no reviewed GYK/QuickJS integration, dependency or license today. Adding one is a separate, security-sensitive unit.

## Descriptor contract

`normalizePluginDescriptor(input)` in `app/alpha/js/core/plugins/pluginContract.js` accepts exactly:

| Field | Rule |
| --- | --- |
| `id` | 1–80 characters, control characters removed |
| `name` | 1–120 characters, control characters removed |
| `version` | ≤40 characters, defaults to `1.0.0` |
| `apiVersion` | must be the integer `1`; no string coercion |
| `code` | nonempty UTF-8 source ≤256 KiB |
| `allowedHosts` | 1–20 lowercase DNS hostnames; no scheme, port, path, wildcard, IP literal, `localhost`, `.local`, `.internal`, `.localhost`, `.home.arpa` or trailing dot |

Unknown fields are dropped. Failures return bounded reason codes (`descriptor`, `id`, `name`, `apiVersion`, `code`, `code-size`, `allowedHosts`, `allowedHosts-size`, `allowedHosts-entry`) and never echo input.

## Result contract

`normalizePluginResult(raw)` and `normalizePluginStreams(raw)` produce groups shaped like the existing stream repository expects:

```js
[{ sourceId, sourceName, streams: [{ name, title, description, quality, url }] }]
```

- ≤20 groups; ≤50 streams per group; text ≤200 characters; quality ≤80; URL ≤4096.
- Only absolute `http:`/`https:` URLs survive. `javascript:`, `data:`, `file:`, protocol-relative and credential-bearing URLs are dropped and counted, never rewritten or fetched.
- Control characters are replaced, text is trimmed and capped, empty groups are dropped, and every output object is freshly constructed so forged `__proto__`/constructor keys cannot propagate.
- `dropped` counts discards for diagnostics without retaining the discarded content.

## Staged plan

1. **Contract and fixture (this unit).** Pure normalization, hostile-input tests and an original `tests/fixtures/plugins/representative-plugin.js`. No execution.
2. **Engine decision and dependency review (prototype complete).** QuickJS/WASM with only injected bindings was selected for evaluation: MIT-licensed `quickjs-emscripten` 0.32.0 (QuickJS itself MIT), installed as an `app/alpha` **devDependency**, not imported by shipped code and therefore absent from the browser bundle. A test-only prototype executes the representative fixture, enforces memory/time/output budgets and exposes no host networking or process globals. See the prototype section below.
3. **Sandbox runtime.** Hard wall-clock/CPU budget, memory and output caps, ≤N brokered network requests to `allowedHosts` only, no credentials/headers, cancellation and teardown, default-off feature flag. The broker policy and its QuickJS binding (below) are prototyped in tests; a shipped runtime, real cancellation propagation and the default-off flag remain.
4. **Parity and abuse corpus.** Representative plugin fixtures, malformed output, redirects/private addresses, huge code/output, hangs, cancellation and repeated-failure limits.

## Engine prototype (test-only, 2026-10-19)

`app/alpha/scripts/pluginSandboxPrototype.mjs` runs inside Node tests only. It creates a QuickJS/WASM context per execution, sets a memory limit, stack limit and wall-clock interrupt deadline, injects only `api.log` and the JSON input, pumps pending jobs so an async function that resolves without host I/O can finish, and normalizes output through `normalizePluginResult`.

Observed with pinned Node 22.23.1 (`node --test app/alpha/scripts/pluginSandboxPrototype.test.mjs`, 7/7):

- The representative fixture returns one normalized group with the original `https` stream and drops its `javascript:` stream.
- `fetch`, `require`, `process`, `XMLHttpRequest`, `WebSocket` and `importScripts` are all `undefined` inside the sandbox.
- An infinite loop is interrupted at the wall-clock budget (`timeout`).
- A large allocation beyond the memory limit fails closed (`memory`).
- Oversized serialized output is rejected (`output-size`) before normalization.
- Malformed but parseable output normalizes to no groups without throwing; empty code is rejected before starting an engine.

**Limits:** this prototype is not wired into the application, has no network broker, no cancellation UI, no persistent quotas and no default-off flag. A plugin that awaits host I/O simply times out. QuickJS/WASM isolation still needs independent security review, dependency-policy review and browser-bundle measurements before any runtime ships. No compatibility claim follows.

## Network broker policy (test-only, 2026-10-19)

`app/alpha/js/core/plugins/pluginBroker.js` is the only network primitive the sandbox will receive; it is not wired to the app yet. `createPluginNetworkBroker({allowedHosts, transport, maxRequests, maxResponseBytes, maxRedirects})` enforces:

- HTTPS only, exact allowlisted hostnames (no subdomain widening), default port only, no embedded credentials, no IP literals, bounded URL length.
- Only `GET`; the injected transport receives **only** the URL and method — never headers, cookies or tokens.
- Redirects are re-authorized per hop against the same allowlist with a hard hop limit, so an allowlisted host cannot bounce to another destination.
- Authorized dispatches are counted against `maxRequests`; oversized or non-text/binary responses beyond `maxResponseBytes` fail closed.
- Failures are bounded codes (`url`, `scheme`, `credentials`, `ip`, `port`, `host`, `method`, `requests`, `redirect-limit`, `redirect-url`, `response-size`, `response-body`, `transport`) with no raw exception text.

Focused tests (`node --test app/alpha/js/core/plugins/pluginBroker.test.mjs`, 10/10) cover allowlisted success, every denial class, method/request caps, same-host redirects, cross-host redirect rejection, redirect loops, oversized bodies, transport failure leakage and defensive allowlist normalization. No real network is used.

## Broker-bound sandbox prototype (test-only, 2026-10-19)

`app/alpha/scripts/pluginSandboxNetworkPrototype.mjs` binds the broker to QuickJS: `api.fetch` is an asyncified host function that calls `createPluginNetworkBroker` and returns a bounded envelope. The VM has no global `fetch`; headers, credentials and destination selection never cross the boundary. A host-side deadline races every broker call so a slow exchange cannot outlive the budget, and the context is not disposed while a host call is suspended.

Observed with `node --test app/alpha/scripts/pluginSandboxNetworkPrototype.test.mjs` (7/7):

- Allowlisted fetch returns the body, the transport receives only `(url, {method:"GET"})`, and streams are normalized.
- A non-allowlisted destination fails with `host` and never reaches the transport.
- The broker request cap is enforced across plugin calls (`requests`).
- A slow host request is cut off by the execution deadline (`timeout`).
- Oversized and redirected-away responses fail closed (`response-size`, `host`).
- A plugin can catch a denial and continue; the host does not crash.
- The VM still has no global `fetch` — only the brokered `api.fetch`.

**Limits:** test-only, not wired to the app; no default-off runtime seam, no AbortSignal propagation into a real transport, no persistent per-account quotas, no user-facing cancellation, and no independent security/dependency review yet. The asyncified WASM build is larger and slower than the sync variant, which matters for the future browser-bundle decision. No compatibility or sandbox claim follows.

## Abuse corpus (test-only, 2026-10-19)

`app/alpha/scripts/pluginSandboxAbuse.test.mjs` exercises both prototypes against hostile input and repeated use (11/11, `node --test`):

- Oversized source (>256 KiB) is rejected before any engine starts (`code-size`) in both prototypes.
- A 64 MiB allocation under a 1 MiB memory budget fails closed (`memory`).
- Unbounded recursion fails closed without escaping the sandbox.
- 5,000 `api.log` calls are capped at the configured log limit.
- Returning `undefined` is an explicit `output` failure rather than a hang; a thrown plugin error is `plugin`, not a host crash.
- A 512 KiB input is bounded and still executes.
- Three repeated failing executions stay isolated and a later execution succeeds.
- A 25-request flood is capped at the broker limit; a redirect loop is bounded; a timed-out network execution does not poison a later one.

This corpus caught a real classifier bug: `/oom/` matched inside the word "boom", misreporting ordinary plugin exceptions as memory exhaustion; the pattern now uses a word boundary. Completion is tracked with an explicit done flag so `undefined`/unserializable results cannot be mistaken for timeouts.

## Engine bundle cost (measured 2026-10-19)

The asyncified QuickJS variant — required because `api.fetch` must await a brokered host call — measures **1,083,888 B raw / ≈377,955 B gzip** as JavaScript plus its `emscripten-module.wasm` asset; inlining the WASM as base64 would cost ≈464,960 B gzip. The sync variant is smaller (554,608 B raw) but cannot await host requests. Decision: async variant, external WASM asset, lazy-loaded only when the default-off plugin feature is explicitly enabled, never in the initial bundle. Full numbers, method and shipping requirements: [engine evaluation](PLUGIN_ENGINE_EVALUATION.md).

## Guarantees and limits

- The contract module is pure: no I/O, timers, storage, DOM, network or evaluation.
- Passing contract tests does **not** mean a plugin is compatible, safe or supported. No compatibility claim is made.
- The inherited URL-template `pluginRuntime` remains as-is and is not part of this contract.

## Rollback

Revert the contract module, tests, fixture and this document through a protected PR. No user data, schema, persistence or deployment state is involved.

## Browser engine execution (unit 6a, test-only)

The opt-in asset builder and `tests/browser/plugin-engine.spec.mjs` execute the real broker-bound QuickJS prototype from bundled JS + external WASM in Chromium156.0.8078.4 on Linux ARM64. 9/9 browser scenarios pass: the representative fixture normalizes one group/one stream and drops its `javascript:` URL; host globals are absent; an allowed synthetic fetch works through the broker; a denied host dispatches nothing; timeout, memory and output-size budgets fail closed; an unexpected external request is blocked and recorded; no page errors. The builder rejects output paths that escape through a symlink, and the representative test asserts the browser's actual `application/wasm` response. Asset hashes, MIME types and sizes are recorded in [the engine evaluation](PLUGIN_ENGINE_EVALUATION.md).

This remains test-only: the engine is not imported by the application, not exposed behind a feature flag, not emitted by the normal build or stager, and not part of the preview. No plugin is shipped, compatible or supported; a future default-off seam and independent security review are still required.
