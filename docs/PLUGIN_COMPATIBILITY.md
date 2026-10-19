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
3. **Sandbox runtime.** Hard wall-clock/CPU budget, memory and output caps, ≤N brokered network requests to `allowedHosts` only, no credentials/headers, cancellation and worker teardown, default-off feature flag.
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

## Guarantees and limits

- The contract module is pure: no I/O, timers, storage, DOM, network or evaluation.
- Passing contract tests does **not** mean a plugin is compatible, safe or supported. No compatibility claim is made.
- The inherited URL-template `pluginRuntime` remains as-is and is not part of this contract.

## Rollback

Revert the contract module, tests, fixture and this document through a protected PR. No user data, schema, persistence or deployment state is involved.
