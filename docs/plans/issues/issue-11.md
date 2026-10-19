# Issue #11: [M2][P1] Prototype sandboxed Nuvio JavaScript plugin compatibility

**Plan status:** In progress — bounded contract/normalization unit implemented and tested; sandbox runtime, quotas and network broker outstanding.  
**Milestone:** M2 · **Priority:** P1  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/11  
**Workstream:** [M2 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Prototype sandboxed Nuvio JavaScript plugin compatibility

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

M2-01; M0-01

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Planned interfaces and deliverables

An optional bounded plugin worker and host fetch adapter, manifest normalization and attack tests

The issue-owning agent must convert this initial artifact inventory into precise file paths, types/interfaces, test fixture IDs and API contracts after checking the imported codebase. Avoid introducing extra auth systems or central media relay as implicit dependencies.

## Detailed implementation sequence

1. Review GYK QuickJS/Worker implementation and license
2. Define supported Nuvio plugin APIs and a bounded network adapter
3. Implement proof-of-concept isolated runtime behind feature flag
4. Fuzz quota, malformed output, access restriction and sandbox security

**Integration sequencing:** land the smallest verifiable unit first; update the plan if tests reveal a wrong assumption, then create separate follow-up issues for work outside scope.

## Functional acceptance criteria

- [ ] Representative supported JS plugin fixtures return normalized streams
- [ ] Execution time, memory/network/output quotas are enforced
- [ ] No open hosted fetch proxy or worker host escape

## Verification design

Allowed/disallowed host cases, redirects/SSRF, huge code/HTML/outputs, cancellation, API parity and sandbox abuse.

**Evidence that must be attached before closure:** commands actually run, exit codes and assertions, tested browser/device versions if applicable, failures and workarounds. Do not mark a box checked based on static inspection alone.

## Threat, cost, privacy and licensing review

Treat manifest/plugin/media as untrusted. Guard XSS, CORS, SSRF, browser codec incompatibility, unsafe plugin API exposure, huge inputs and quality downgrades.

Confirm no secrets are introduced, provider/API costs are bounded, third-party source licenses are preserved and users receive no unexpected paid action. Escalate platform authorization or payment-policy uncertainties instead of guessing.

## Telemetry, rollback and ownership

Capture bounded, redacted failure counters and trace IDs without exposing access tokens, media URL queries or personal playback metadata.

**Rollback:** Disable experimental add-on/engine via feature flag, restore native playback and keep clear unsupported messaging.

## Definition of done

- [ ] Dependency assumptions and interface/API contract verified against code or published upstream evidence.
- [ ] All issue acceptance criteria tested and documented.
- [ ] Negative/security/budget cases covered as relevant.
- [ ] Docs, compatibility notes and source provenance updated.
- [ ] Reviewed pull request linked to issue, with rollout and rollback evidence.

## Inspected implementation and first unit — 2026-10-19

**Verified current state.** The imported "plugin" layer is not a JavaScript runtime at all: `core/player/pluginRuntime.js` stores `{name,urlTemplate}` entries and substitutes `{tmdbId}/{mediaType}/{season}/{episode}` into a URL; `PluginManager.executeScrapersStreaming` simply maps those into `{sourceId,sourceName,streams}` groups, which `streamRepository.getPluginStreams` wraps as `kind:"plugin"` groups. There is no third-party code execution, no GYK/QuickJS integration, no network broker, no quota, and no sandbox today. No dependency or license for a JS engine has been reviewed or added.

**Security constraint.** `docs/SECURITY_PRIVACY.md` explicitly states that a browser Worker alone is insufficient for arbitrary trusted isolation. A prototype must therefore not claim host-escape safety. The first unit deliberately implements only the bounded contract and result normalization that any later engine (QuickJS/WASM with injected bindings is the leading candidate) must satisfy; execution stays unimplemented and disabled.

### Unit 1 — plugin descriptor and result contract (this unit)

Targets: new `app/alpha/js/core/plugins/pluginContract.js`, its `.test.mjs`, and this plan plus the compatibility document. No runtime wiring, no feature flag change, no network, no dependency.

Contract:
- `normalizePluginDescriptor(input)` accepts `{id,name,version,apiVersion,code,allowedHosts}`. Bounds: code ≤256KiB UTF-8, id ≤80, name ≤120, version ≤40, apiVersion must be integer1, 1–20 allowed hostnames. Hostnames are lowercase DNS names, at least two labels, no scheme/port/path/wildcard/IP literal/`localhost`/`.local`. Control characters stripped from text; unknown fields dropped; unsupported apiVersion rejected.
- `normalizePluginStreams(raw)` and `normalizePluginResult(raw)` bound groups ≤20 and streams ≤50 per group, text ≤200 chars, URL ≤4096. Media URLs must be absolute `http:`/`https:`, must not contain embedded credentials, and anything else is dropped and counted, never rewritten. Output objects are freshly constructed so unknown/prototype keys never propagate.
- Errors are returned as bounded reason codes, not raw exception text or input echoes.

Tests must cover oversized code, wildcard/IP/localhost/postal hostnames, `javascript:`/`data:`/protocol-relative/credential URLs, control characters, truncation, oversized groups/streams, malformed inputs, and a `__proto__` payload that must not pollute `Object.prototype`.

**Non-goals.** No JS evaluation, no Worker, no fetch, no UI, no enabling the inherited template feature, no claim that any plugin is supported or sandboxed. Later units must choose and review the engine, add quotas/cancellation/network broker, and only then expose a default-off feature.

**Verification.** `node --test app/alpha/js/core/plugins/pluginContract.test.mjs`, full `npm test --prefix app/alpha`, lint, inert build/artifact check, docs/governance/ledger checks. Rollback: protected revert deletes the contract module/tests/docs; no runtime behavior changes.

### Unit 1 results — contract and fixture (2026-10-19)

Implemented `app/alpha/js/core/plugins/pluginContract.js` (pure descriptor and result normalization), `pluginContract.test.mjs`, the original `tests/fixtures/plugins/representative-plugin.js`, and [PLUGIN_COMPATIBILITY.md](../../PLUGIN_COMPATIBILITY.md).

Executed with pinned Node22.23.1: `node --test app/alpha/js/core/plugins/pluginContract.test.mjs` —10/10 pass,0 skipped. Cases cover oversized/empty code, unsupported API versions, wildcard/IP/localhost/postal host allowlists, duplicate collapse, `javascript:`/`data:`/`file:`/protocol-relative/credential/oversized URLs, control-character stripping and truncation, group/stream bounds with dropped counts, malformed inputs, a `__proto__` pollution payload, and the representative fixture's contract compliance. No execution, network, storage, DOM or runtime wiring was added; the inherited URL-template feature is untouched.

**Limits.** This does not make any plugin compatible or sandboxed. Execution remains unimplemented pending an engine-level sandbox decision (QuickJS/WASM with injected bindings is the leading candidate), dependency/license review, quotas, a bounded network broker, cancellation and a default-off flag. No third-party code or dependency was added.

**Next unit.** Engine decision + dependency/licence review; then a default-off sandbox runtime that consumes `normalizePluginResult` and a broker restricted to `allowedHosts`, with timeout/output/request quotas and abuse tests.

**Rollback.** Protected revert of the contract module, tests, fixture and document; no runtime behavior or user data changes.

### Unit 2 results — test-only QuickJS/WASM engine prototype (2026-10-19)

Selected QuickJS/WASM with only injected bindings for evaluation. Added `quickjs-emscripten@0.32.0` (MIT; QuickJS MIT) as an `app/alpha` **devDependency**, with `package-lock` updated and `npm audit --audit-level=low` reporting0 vulnerabilities. It is imported only by `app/alpha/scripts/pluginSandboxPrototype.mjs`, which is not imported by application code; the production build remains12 assets and a recursive `quickjs` search of `app/alpha/dist` is absent.

Implemented `app/alpha/scripts/pluginSandboxPrototype.mjs` and `.test.mjs`: per-execution QuickJS context, memory limit, stack limit, wall-clock interrupt deadline, only `api.log` plus JSON input injected, pending-job pumping for async functions that resolve without host I/O, output-size cap and normalization through `normalizePluginResult`.

Executed: focused prototype tests7/7 pass,0 skipped (representative fixture returns one normalized group and drops its `javascript:` stream; `fetch`/`require`/`process`/`XMLHttpRequest`/`WebSocket`/`importScripts` are `undefined`; infinite loop→`timeout`; large allocation→`memory`; oversized output→`output-size`; malformed output yields no groups; empty code rejected). `npm test --prefix app/alpha`1198/1198 pass; lint pass; inert build/12-asset/private-field check pass; audit0.

**Limits.** Test-only, not wired to the app; no network broker, cancellation UI, persistent quotas or default-off flag; a plugin awaiting host I/O times out. QuickJS/WASM still needs independent security and dependency-policy review plus bundle measurements before any shipped runtime. No compatibility claim.

**Next unit.** Bounded network broker (`allowedHosts` only, no credentials/headers, request/time/output quotas), cancellation/teardown, repeated-failure limits and a default-off runtime seam consuming the contract.

**Rollback.** Protected revert removes the prototype, tests, fixture adjustment and devDependency; the shipped bundle is unchanged either way.

### Unit 3a — bounded network broker policy (planned 2026-10-19)

**Scope.** A pure, injected-transport broker that any future sandbox binding must use for plugin network access. No global `fetch`, no credentials, no headers, no real network in tests.

Contract (`app/alpha/js/core/plugins/pluginBroker.js`): `createPluginNetworkBroker({allowedHosts, transport, maxRequests=8, maxResponseBytes=1MiB, maxRedirects=2})` with `request(url,{method:"GET"})`.

- HTTPS only, exact allowlisted hostnames (no subdomain widening), default port only, no embedded credentials, no IP literals, URL length bounded.
- Requests counted before dispatch; exceeding `maxRequests` fails closed.
- Redirects are re-authorized per hop against the same allowlist with a hard hop limit, so an allowlisted host cannot bounce the broker to an arbitrary destination.
- The transport receives only the URL and method — never headers, tokens or cookies. Responses larger than `maxResponseBytes` and non-GET methods fail closed.
- Errors are bounded codes (`url`, `scheme`, `credentials`, `host`, `port`, `ip`, `method`, `requests`, `redirect-limit`, `redirect-url`, `response-size`, `response-body`, `transport`), never raw exception text.

**Tests (red first where the rule is missing):** allowlisted success; denied scheme/host/subdomain/credentials/IP/port/URL length; method and request-count limits; redirect to an allowed host followed; redirect to a disallowed host rejected; redirect loop bounded; oversized response rejected; transport failure; transport receives no headers/tokens; host allowlist defensively normalized.

**Non-goals.** No QuickJS binding, no runtime wiring, no feature flag, no real fetch. Unit 3b will inject this broker as the only network primitive and add cancellation.

**Rollback.** Protected revert deletes the broker and tests; no runtime or data change.

### Unit 3a results — bounded network broker policy (2026-10-19)

Implemented `app/alpha/js/core/plugins/pluginBroker.js` with an injected transport and exported host normalization from the contract module. Rules: HTTPS only, exact allowlisted hostnames, default port only, no credentials/IP literals, bounded URL length, GET only, redirects re-authorized per hop with a hard limit, authorized-dispatch request cap, response-byte cap, and bounded error codes with no raw transport text. The transport receives only `(url, {method:"GET"})`.

Executed: focused `node --test app/alpha/js/core/plugins/pluginBroker.test.mjs` —10/10 pass,0 skipped (allowlisted success and no headers; scheme/credential/IP/port/host/subdomain/length denials; method and request caps; same-host redirect; cross-host redirect rejection; redirect loop; oversized response; transport failure leakage; allowlist normalization). `npm test --prefix app/alpha` —1208/1208 pass; lint pass; inert build/12-asset check pass. No real network, QuickJS binding, runtime wiring or feature flag was added.

**Next unit (3b).** Bind the broker as the sandbox's only network primitive (asyncified host function), add cancellation/deadline propagation and teardown, then expose a default-off runtime seam consuming `normalizePluginResult`. Independent security/dependency review remains required before any shipped runtime.

**Rollback.** Protected revert deletes the broker and tests; no runtime or data change.

### Unit 3b results — broker-bound sandbox with deadline cancellation (2026-10-19)

Implemented `app/alpha/scripts/pluginSandboxNetworkPrototype.mjs` and tests. `api.fetch` is an asyncified QuickJS host function backed by `createPluginNetworkBroker`; the VM has no global `fetch`, and headers/credentials/destinations never cross the boundary. A host-side deadline races each broker call, suspended host calls are awaited before context disposal, and broker errors surface as bounded `plugin-network:<code>` failures that plugins may catch.

Executed: focused tests7/7 pass,0 skipped (allowlisted fetch and normalization, no-headers transport call, denied host, request cap, slow-host deadline, oversized and redirected-away responses, catchable denial, no global fetch). `npm test --prefix app/alpha`1215/1215 pass; lint pass; inert build/12-asset check pass. No application wiring, feature flag, real network or default-off runtime was added.

**Limits.** Deadline cancellation is host-race based, not AbortSignal propagation into a real transport; no persistent per-account quotas, no user-facing cancellation and no independent security/dependency review. The asyncified WASM build is larger/slower and affects the future browser-bundle decision.

**Next unit (4).** Default-off runtime seam consuming the contract + broker, persistent quota/allowlist source, abuse corpus (hangs, repeated failures, malformed output, huge inputs), then independent security/dependency review and bundle measurement.

**Rollback.** Protected revert deletes the network prototype and tests; no runtime or data change.

### Unit 4 results — abuse corpus and quota hardening (2026-10-19)

Added `app/alpha/scripts/pluginSandboxAbuse.test.mjs` over both prototypes and two corrective guards: source bytes >256KiB are rejected before engine start (`code-size`), and an explicit completion flag makes `undefined`/unserializable results an `output` failure instead of a false timeout. The corpus also exposed a real classifier bug — `/oom/` matched inside the word "boom" and misreported ordinary plugin exceptions as memory exhaustion; the pattern now uses a word boundary.

Executed: abuse tests11/11 pass,0 skipped (oversized code, 64MiB allocation under1MiB budget→`memory`, unbounded recursion fails closed, 5,000 logs capped, `undefined`→`output`, thrown error→`plugin`, 512KiB input bounded, three repeated failures isolated with a later success, 25-request flood capped at4, redirect loop bounded, timed-out execution does not poison a later one). Full `npm test --prefix app/alpha`1226/1226 pass; lint and inert build/12-asset check pass. Test-only; no runtime wiring, feature flag or real network.

**Limits.** Deadline cancellation remains host-race based; no persistent per-account quotas, user-facing cancellation, default-off runtime seam, independent security/dependency review or browser-bundle measurement.

**Next unit (5).** Default-off runtime seam consuming the contract + broker, persistent quota/allowlist source, bundle-size measurement of the engine in the browser build, and the security/dependency review package. No shipping claim until those are reviewed.

**Rollback.** Protected revert removes the abuse suite and guards; no runtime or data change.
