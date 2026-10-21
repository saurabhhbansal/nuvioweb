# Issue #11: [M2][P1] Prototype sandboxed Nuvio JavaScript plugin compatibility

**Plan status:** In progress — test-only QuickJS/broker and opt-in asset emission implemented; acceptance remains unverified, application execution disabled. Current header/redirect continuation's plan-before-code contract, minimized continuation-crash amendment, commands and inline review are consolidated in the [single evidence section](../../evidence/issue11-real-plugins-2026-10-21.md#bounded-headers--per-hop-replay-slice--plan-before-implementation). Targets: `pluginRequestPolicy.js`, broker/QuickJS/getStreams/probe scripts and associated tests; no additional app wiring, live transport, parser or deployment. Historical continuation below.
## Provider-boundary follow-up — plan before code (after PR145)

Work only #11 on `m2/issue-11-provider-boundaries`, base c4713a3. User-approved seams remain the public broker, actual QuickJS getStreams adapter and four unchanged pinned-source replay. Targets: `pluginRequestPolicy.js`, broker/adapter tests, a bounded trusted provider-declaration approval helper/tests, `pluginHeaderReplayProbe.mjs`, compatibility/ledger/tracker and the single existing evidence document/compact JSON receipt.

Contract: discard well-formed hop-by-hop request metadata (Connection, Keep-Alive, Transfer-Encoding, Upgrade, TE, Trailer, Proxy-*), never forward Cookie/Authorization/Proxy-Authorization or credential options; keep original header count/value/total caps and reject malformed/duplicate/control values. Connection-nominated fields must not launder forbidden credentials or arbitrary headers. Independently verified provider-owned pinned declarations may approve exact HTTPS destinations once at registration, bound to provider/source identity; no arbitrary guest/runtime response can enlarge the set, no wildcard/IP/local/credential-bearing destinations. All hops retain host/header/public-address checks and original quotas/cancellation. Vixsrc replay first, then xprime; explicit fixtures, no generic success. Record raw diagnostic rows separately from adapter acceptance.

hdhub4u: inspect exact import and used parser API; either supply a genuinely sanctioned guest-only parser with license/resource/constructor negatives, or explicitly record unsupported dependency and technical reason—no silent shim. PenguPlay: preserve playback-header refusal and prepare only a short same-origin header-capable delivery design with allowlist/DNS/socket/redirect/credential/range/byte/logging/cost rules; no route, service or deployment.

Tests: red/green broker normalization and credential/Connection-nomination/size negatives, actual guest normalization tracer, declaration identity/schema/destination/redirect negatives; existing focused app/lint/inert-build/browser/docs/governance and ancestry gates. Inline actual-diff Standards/Spec review only, automated/not human; no reviewer agents/files. Evidence consolidated into the existing document <=200 total lines plus amended compact receipt, preserving prior facts by PR/history links. No new dependency/guest module/host object/app enablement or other issue change. Safe live transport still absent: select0 live-provider reads. Rollback: protected revert of this follow-up; app stays disabled, already-issued fixed public source acquisitions cannot be undone.

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

### Unit 5 results — engine bundle measurement and shipping decision (2026-10-19)

Added `app/alpha/scripts/measurePluginEngineBundle.mjs` (+3 unit tests for metafile accounting) and [PLUGIN_ENGINE_EVALUATION.md](../../PLUGIN_ENGINE_EVALUATION.md). Bundled both QuickJS variants with esbuild0.28.2 for the browser and measured JavaScript, the external `emscripten-module.wasm`, and an inlined-base64 alternative.

Measured: sync554,608B raw (JS51,474B + WASM503,134B; gzip parts247,846B); **async1,083,888B raw** (JS56,365B + WASM1,027,523B; gzip parts≈377,955B); inline-base64 async1,370,032B raw/≈464,960B gzip. Both bundles reference the WASM as an external asset.

Decision: asyncify variant only (the broker's `api.fetch` must await a host call); external WASM asset over base64; **lazy, explicit opt-in only**, never in the initial 12-asset bundle; no shipping claim until in-browser execution, build/stager emission of the WASM with `application/wasm` and cache/hash rules, quota wiring, browser tests and independent security/dependency review exist. Current preview sets no CSP; any future CSP must allow `wasm-unsafe-eval` for this feature only.

**Limits.** Measurement only; no bundled engine executed in a browser, no build/stager change, no default-off seam. Numbers are raw/gzip sums of parts for `quickjs-emscripten`0.32.0 and require re-measurement on upgrade.

**Next unit (6).** Implement the default-off lazy engine seam + build/stager WASM emission and an in-browser fixture journey, then the security/dependency review package.

**Rollback.** Protected revert removes the measurement tooling/tests/doc; no shipped artifact changes.

### Unit 6a — opt-in browser engine asset builder and in-browser fixture (planned 2026-10-19, before code)

Feasibility was spiked under ignored `dist/`: the asyncify QuickJS bundle plus external `emscripten-module.wasm` loaded from loopback with `application/wasm` and executed the real `executePluginWithNetworkPrototype` path. The representative fixture returned one normalized group with one stream, dropped its `javascript:` URL, and produced no page errors. The spike is not committed evidence; this unit makes it reproducible and reviewable.

**Targets.** New `app/alpha/scripts/pluginEngineBrowserEntry.mjs`, `app/alpha/scripts/pluginEngineAssets.mjs` (+ `.test.mjs`), `app/alpha/scripts/buildPluginEngineAssets.mjs`, `tests/browser/plugin-engine.spec.mjs`, and updates to `PLUGIN_ENGINE_EVALUATION.md`, this plan and ledgers. Reuse `pluginSandboxNetworkPrototype.mjs`, `pluginContract.js` and `representative-plugin.js` unchanged.

**Build contract.** `buildPluginEngineAssets({outdir})` bundles the asyncify variant with esbuild (minify, ESM, browser, es2022), copies the package's external `emscripten-module.wasm` beside the JS, and writes `plugin-engine.json` containing the engine package/version/license, file names, byte sizes, SHA-256 for both files, and the required MIME types (`text/javascript`, `application/wasm`). Output goes under `app/alpha/dist/` (ignored) and is only produced by this explicit tool or the browser test; the normal application build, stager and preview are unchanged.

**Browser fixture.** `tests/browser/plugin-engine.spec.mjs` builds the assets, serves them from an ephemeral loopback server with exact MIME types, and loads them in Chromium. Scenarios: representative fixture normalization and dropped `javascript:` URL; no `fetch`/`require`/`process`/`XMLHttpRequest`/`WebSocket`/`importScripts` inside the VM; allowed-host synthetic broker fetch; denied-host rejection with zero dispatch; wall-clock timeout; memory limit; oversized output; and no page errors/cross-origin requests. The fixture transport is synthetic and in-memory; no real network, account state or application bundle is used.

**Non-goals.** No application import or wiring, no feature flag exposure, no stager/preview asset emission, no service-worker cache change, no real provider fetch, no plugin compatibility claim and no shipping default. Unit 6b (app seam, stager emission, CSP/`wasm-unsafe-eval` decision and security review package) remains separate and owner/reviewer gated.

**Threats and controls.** Same-origin bundled JS/WASM only; the VM receives only injected bindings; transport never sees headers or credentials; exact allowlists and per-hop redirect authorization come from the reviewed broker; output/inputs are bounded; assets are generated deterministically from pinned devDependencies. Adding the WASM to any future CSP must scope `wasm-unsafe-eval` to this feature only. Asset cost is ~1.08MB raw/~378KB gzip plus external WASM and is not loaded by default in this unit.

**Verification.** `node --test app/alpha/scripts/pluginEngineAssets.test.mjs`; `npx playwright test tests/browser/plugin-engine.spec.mjs --project=chromium`; `npm test --prefix app/alpha`; `npm run lint --prefix app/alpha`; inert `NUVIO_LOCAL_PROPERTIES=… npm run build --prefix app/alpha` + `node scripts/check-alpha-build.mjs` (must remain 12 assets, no engine files); docs/governance/preview tests and links/ledger/ancestry/whitespace. Record exact browser version and asset sizes/SHA-256.

**Rollback.** Protected revert deletes the new scripts/spec and docs; no application runtime, preview artifact, storage or user data changes. The existing `quickjs-emscripten` devDependency and prototype files are untouched.

### Unit 6a results — browser engine assets and in-browser fixture (2026-10-19)

Implemented `pluginEngineAssets.mjs`, `buildPluginEngineAssets.mjs`, `pluginEngineBrowserEntry.mjs`, their focused test and `tests/browser/plugin-engine.spec.mjs`. The builder emits the asyncify JS + external WASM with a deterministic manifest (sizes, SHA-256, MIME, MIT/package versions, `defaultEnabled:false`). Built assets: `plugin-engine.js`64,698B / `emscripten-module.wasm`1,027,523B (total1,092,221B).

Executed with pinned Node22.23.1/Playwright1.64/Chromium156.0.8078.4/LinuxARM64:

- `node --test app/alpha/scripts/pluginEngineAssets.test.mjs` —7/7 pass (including symlink output-escape and symlinked/missing `dist` containment, run without a prebuilt `dist`).
- `npx playwright test tests/browser/plugin-engine.spec.mjs --project=chromium` —9/9 pass,0 skipped (4.2s): manifest/hash correspondence, actual browser200 `application/wasm` response, representative fixture one group/one stream with dropped `javascript:`, no ambient host globals, allowed synthetic fetch through the broker, denied host with zero dispatch, timeout, memory, output-size, blocked/recorded unexpected external request, no page errors.
- `npm test --prefix app/alpha` —1237/1237 pass,0 skipped (15.1s).
- `npm run lint --prefix app/alpha` — pass.
- Inert build + `node scripts/check-alpha-build.mjs` — pass, **12 assets**, no engine files in the app dist.
- Full `npx playwright test` —51/51 pass (1.6min).
- Read-only Codex review (`docs/agent-runs/2026-10-19-unit6a-review.md`): 2 P1 + 3 P2, all fixed (symlink output escape, missing cross-origin guard, server-side WASM assertion, stale JS hash, teardown guard); no P0 and no shipped-artifact exposure.

The browser run exposed an in-VM OOM classification gap: allocations failing inside the VM surfaced as `plugin`. The network prototype now applies the same word-bounded OOM rule to rejections; abuse corpus12/12 and network prototype tests remain green, with a plain `"boom"` control still classified `plugin`.

**Limits.** Test-only: no application import, feature flag, stager/preview emission, CSP change or real network. The browser fixture uses a synthetic in-memory transport and Chromium only; WebKit/Firefox and audible/device behavior are not covered. No compatibility, shipping or sandbox-escape claim.

**Next unit (6b).** App default-off lazy seam consuming the contract + broker with an explicit opt-in source, stager emission of the hashed WASM/JS with `application/wasm` and cache rules, CSP/`wasm-unsafe-eval` decision, Firefox/WebKit coverage where available, and the independent security/dependency review package. Owner-gated rollout; no shipping default.

**Rollback.** Protected revert deletes the new scripts/spec/docs and the prototype classifier line; no app runtime, preview, storage or user-data change.

### Unit 6b split and 6b-1 plan — opt-in asset emission (2026-10-19, before code)

Unit 6b is split so the deployable asset plumbing can be reviewed independently from application execution:

- **6b-1 (this unit): opt-in build/stager emission.** No application import, feature flag, runtime execution or preview upload. Produces a versioned engine directory and manifest, validates hashes/MIME through the build artifact check and the stager, and refuses accidental inclusion unless `NUVIO_PLUGIN_ENGINE_ASSETS=1` is explicitly set for both build and stage.
- **6b-2 (later): default-off lazy app seam.** Adds the opt-in flag source, lazy same-origin dynamic import, quota/cancellation wiring, browser app-level fixture, CSP decision and security/dependency review package. It cannot ship before independent review.

**6b-1 targets.** `app/alpha/scripts/pluginEngineAssets.mjs` (installed layout + manifest), `app/alpha/scripts/build.mjs` (opt-in hook), `scripts/check-alpha-build.mjs` (optional-asset validation), `scripts/prepare-static-preview.mjs` (+ tests), `deploy/cloudflare/_headers` (MIME/cache only when the assets exist), and this plan.

**Layout contract.** When enabled, build emits:

- `assets/plugins/<16-hex-content-hash>/plugin-engine.js`
- `assets/plugins/<16-hex-content-hash>/emscripten-module.wasm`
- `assets/plugins/plugin-engine.json` — `{schemaVersion:1,directory:"/assets/plugins/<hash>",defaultEnabled:false,loadPolicy:"explicit-opt-in-lazy",enginePackage,engineVersion,variantPackage,variantVersion,license:"MIT",files:[{name,mime,bytes,sha256}],totalBytes}`.

The directory hash is derived from the JS and WASM SHA-256 values so identical inputs produce the same directory. The manifest is not immutable-cached; the versioned directory is. The normal build remains 12 assets with no `assets/plugins` output. The stager rejects engine assets unless the opt-in environment flag is set, and validates the manifest, directory, file sizes, hashes and MIME mapping before copying.

**Header contract (Cloudflare Pages).** The manifest is `no-store`; the versioned JS is `text/javascript` and the WASM `application/wasm`, both immutable with `X-Content-Type-Options: nosniff`. Rules are scoped under `/assets/plugins/`, so a preview without engine assets is unaffected.

**Threats and controls.** WASM/JS are same-origin and only loaded by a future explicit opt-in; no remote URL or user-supplied path is introduced. Versioned content hashes prevent cache confusion. The stager refuses opt-in mismatch and hash drift. No CSP is added here; a future CSP must scope `wasm-unsafe-eval` to this feature only. No secrets, network, provider fetch or new dependency.

**Non-goals.** No app import, flag exposure, UI, execution, stager upload, preview deployment, CSP change, service-worker caching of engine assets, compatibility claim or security-review waiver. The engine assets are inert files until a separately reviewed seam uses them.

**Verification.** `node --test app/alpha/scripts/pluginEngineAssets.test.mjs` and `scripts/prepare-static-preview.test.mjs` (+ `stage-legal-demo`), inert default build + `node scripts/check-alpha-build.mjs` (12 assets, no engine files), opt-in build with `NUVIO_PLUGIN_ENGINE_ASSETS=1` + artifact check (versioned dir/manifest/hashes/MIME), stager rejection without the flag, `npm test --prefix app/alpha`, lint, docs/governance/preview/links/ledger/ancestry/whitespace. Record exact asset hash/dir in evidence. No upload.

**Rollback.** Protected revert of the opt-in hook, installed-layout helper, header rules and tests; default build/stager behavior and deployed preview remain unchanged.

### Unit 6b-1 results — opt-in engine asset emission (2026-10-19)

Implemented the installed-layout helper (`app/alpha/scripts/pluginEngineAssets.mjs`), shared validator (`pluginEngineManifest.mjs`), opt-in build hook (`NUVIO_PLUGIN_ENGINE_ASSETS=1`), artifact-check/stager enforcement, notice packaging and scoped `_headers` rules. No application import, flag exposure, execution, upload or preview deployment.

Executed with pinned Node22.23.1:

- Default inert build + `node scripts/check-alpha-build.mjs` — **12 baseline assets**, no `assets/plugins`, no engine references in `app.bundle.js`.
- Opt-in build — emits `assets/plugins/ffd052f2ddae417d/{plugin-engine.js,emscripten-module.wasm}` + `assets/plugins/plugin-engine.json`; JS64,698B/WASM1,027,523B/total1,092,221B hashes verified; directory equals `sha256(jsSha:wasmSha)` first16; artifact check passes with the flag and rejects mismatches.
- Opt-in `npm run preview:stage` (no upload) — stages the manifest + versioned dir only, copies the three MIT notices (`third-party/quickjs-emscripten/LICENSE`, `quickjs-emscripten-core`, `@jitl/quickjs-wasmfile-release-asyncify`), lists them in `SOURCE.txt`, and carries the no-store/immutable + `application/wasm` header rules. Default staging contains no engine assets or engine notices.
- `node --test app/alpha/scripts/pluginEngineAssets.test.mjs scripts/prepare-static-preview.test.mjs` —12/12 pass (orphan/sibling rejection, content-bound directory, tampered same-length hash, opt-in mismatch).
- `npm test --prefix app/alpha` —1238/1238 pass; lint pass; docs/ledger/whitespace pass.

**Read-only Codex review:** five P2 findings (root inventory, content-bound directory, header merge, notice attribution, installer symlink/stale-sibling handling); all fixed with regressions. Record: `docs/agent-runs/2026-10-19-engine-assets-review.md`. Limits: Cloudflare `_headers` behavior is documented but not deployed/verified here; `! Cache-Control` relies on Pages unset semantics. No app seam, CSP decision, execution or independent security review yet; unit 6b-2 remains owner/reviewer gated.

### 2026-10-21 continuation — bounded execution lifecycle (before code)

Owner assignment selects **#11 only**. Baseline `79ccee700d54cd9647c2d6542645c9c7df8d1b69`; clean feature branch `m2/issue-11-bounded-runtime`. The supplied `saurabhbansal/nuvioweb` issue command failed repository resolution; assumption: use the configured origin `saurabhhbansal/nuvioweb` (verified issue11 title/plan). Dependencies #1 and #9 are closed; prior evidence is historical, not a fresh pass. Node22.23.1 is installed. Codex CLI is unavailable, so use a separate read-only automated reviewer substitution, not human approval.

**Product decision/assumption for morning review.** Keep arbitrary JS execution out of the shipped application until concrete security review and lawful actual installed-JS-plugin evidence exist. The public actual-provider report records six installed protocol add-ons and **zero JS/custom sources**; these are not interchangeable APIs. Do not fabricate a JS provider or repurpose account credentials as plugin input. Finish test-only lifecycle/quotas, default-off session seam, upstream API/license comparison and exact-layer verification now. Any missing actual-provider acceptance stays unchecked; do not close #11 based on our original synthetic fixture. No deployment, CSP weakening, auth changes or interaction with #7/#120 observers/pinned preview.

**Targets and contract.** `app/alpha/js/core/plugins/pluginBroker.js` + tests: validate finite integer budget ceilings, charge *every redirect dispatch*, aggregate response budget, optional AbortSignal propagated to injected transport and race-delimited cancellation; never headers/credentials. `app/alpha/scripts/pluginSandboxNetworkPrototype.mjs` + lifecycle tests: bounded validated budgets, UTF-8 input/output limits, abort/deadline propagation and listener/timer teardown before QuickJS disposal. New `pluginPrototypeSession.mjs` + tests: explicit `enabled:true`, lazy injected engine loader, trusted approved-host intersection, one active execution, lifetime execution/failure ceilings (session-local, **not** account-persistent quotas), disable aborts active run, no plugin logs returned. Fixture browser entry/spec extend actual browser negative cases, still in-memory transport. `playwright.config.mjs` includes plugin-engine specs in the existing opt-in WebKit/Gecko projects and required multi-engine CI; no new workflow or guard bypass. No real browser fetch/hosted proxy introduced; DNS/IP filtering remains mandatory before any real transport.

**Threats.** Redirect amplification, NaN/Infinity quota bypass, ignored abort/late response, UTF-8 undercount, repeated failures/concurrency, plugin-selected allowlist escalation and accidental credential/log export. Cancellation cannot undo a previously dispatched remote operation; same-thread AbortSignal cannot preempt a synchronous loop, which remains bounded by the QuickJS deadline. Engine startup latency is not plugin CPU time. Test-only transport may ignore abort but late completion must not touch disposed VM.

**Verification commands.** Focused broker/prototype/session tests; `node --test app/alpha/scripts/pluginSandbox*.test.mjs app/alpha/scripts/pluginPrototypeSession.test.mjs`; `npx playwright test tests/browser/plugin-engine.spec.mjs --project=chromium`; `npm ci` and audit at root/app; `npm test --prefix app/alpha`; lint; inert default build + `node scripts/check-alpha-build.mjs`; docs/governance/preview tests and docs/ledger/commit-reference/diff checks. All four protected CI contexts at exact PR head and actual merge. Full browser/other-engine checks provided by required CI; report local/browser/HTTP/real-provider distinctions. No fixture result is actual-provider acceptance.

**Review-triggered lifecycle amendment before corrective code.** Automated review found trusted-host self-authorization and guest-toJSON metadata bypass; require independent approvedHosts and validate plain serialized output on the host before normalization. Share media-input projection in `pluginPrototypeInput.mjs`. A deterministic subprocess assertion regression further isolates the inherited swallowed `JS_FreeRuntime` failure to **sync unbounded recursion**, not the adjacent allocation test. Tagged probes disproved error-handle disposal as the root cause: the host throws RangeError during evaluation before a guest error handle returns. Tightening guest stack from512KiB to64KiB makes QuickJS stop recursion before the host/WASM stack ceiling and removes the assertion. Target shared `pluginSandboxLimits.mjs` with finite budget checks/64KiB hard stack ceiling for both engines, UTF-8 input/output checks in sync too, plus defensive probe-handle cleanup and a child-process regression that actually runs one original recursion case. No assertion suppression or relaxed stack budget.

**Upstream-parity amendment before adapter code.** Pinned review found the old synthetic contract is not GYK's API. Add `app/alpha/scripts/pluginGetStreamsPrototype.mjs` + tests: an explicitly selected, test-only adapter for CommonJS/global positional `getStreams`, flat results, GET-only response-like fetch over the same broker. No dependency/source import, HTML parser, crypto, settings/API keys, credential headers, POST or real transport. Reject unsupported request options and required headers/subtitles/infoHash rather than pretending a stream remains playable. Add browser regression for this narrow adapter; synthetic upstream-shaped code remains regression-only, not installed-provider acceptance.

**Rollback/non-goals.** Protected revert of this bounded test-only unit; normal application imports, account storage, service worker, default bundle, deployed preview and unrelated ledgers stay unchanged. No broad GYK port, HTML parser/crypto emulation, provider installation, real-media playback claim, production or sensitive runtime rollout.

### 2026-10-21 real-installed-provider continuation (before code)

**Scope/decision for morning review:** owner explicitly authorizes personal installed-provider verification without licence/ToS permission questions. Only #11; isolated branch `m2/issue-11-real-plugins` from PR140 merge `0ea7c87`. Prior zero-custom-source observation does not excuse skipping actual source discovery. Prioritize PenguPlay, then AIOMetadata, Xperience, AIOStreams, Telegram, NexoTV. Reuse the ignored #10 observation harness and its `NUVIO_RUN_SUFFIX`/`NUVIO_ONLY_*` controls rather than build a new browser journey. Inspect actual installed manifests/source provenance, not provider names alone. If an installation is an HTTP protocol add-on without a downloadable JS scraper, record that API mismatch with fresh evidence; never substitute a fabricated wrapper or server application for actual plugin code and label it compatible.

**Targets/API:** this plan; new test-only source-verification/receipt helpers and tests under `app/alpha/scripts/` only if necessary; `docs/evidence/issue11-real-plugins-2026-10-21.{md,json}`, compatibility matrix, #11-only ledger/tracker records, automated-review record. Actual unmodified CommonJS/global `getStreams` source must enter `executeGetStreamsPrototype({descriptor,approvedHosts,input,transport,signal,limits,brokerLimits})`; trusted approval independent of guest declarations. Record byte size/hash, bounded load/invocation failure codes, counts and normalized-shape assertions. No credential-bearing settings in guest/review agents. No network-policy widening to make providers pass. Acquired private installation data remains outside git; receipts schema-allowlist booleans/counts/statuses/hashes/public metadata only.

**Threats/non-goals:** protect credentials, URLs, account identifiers, other sessions/observers and #12 working branch. No production/preview deployment, app runtime enablement, new privilege, public fetch listener, paid compute, full server-plugin port, playback campaign or other issue changes. Do not claim HTTP responses or mapped real rows are executed provider JS. For real transport, require streaming byte ceilings, exact destination approval, manual redirects, DNS/private-address filtering/connection pinning and abort; otherwise defer only real transport and finish source execution/replayed-response and synthetic negatives with their layers labelled. Already-issued provider operations cannot be undone.

**Verification:** pinned Node22.23.1; source receipt helper tests if added; focused `node --test app/alpha/scripts/pluginGetStreamsPrototype.test.mjs app/alpha/scripts/pluginSandbox*.test.mjs app/alpha/scripts/pluginPrototypeSession.test.mjs app/alpha/js/core/plugins/pluginBroker.test.mjs`; real-source run(s) with immutable source hashes and explicit real/replayed transport classification; genuine loops/allocation/output/host/redirect/cancellation probes (adversarial mutations labelled separately from unmodified source); existing browser spec if relevant; required app lint/tests/inert build, docs/governance/links/ledger/ancestry/privacy checks. Distinct automated actual-diff review; protected PR with four green required contexts at exact head and actual merge. Report failed attempts honestly. No legal/licence question blocks technical tests; record discovered licence in one line.

**Real-row finding / amendment before corrective code:** fresh PenguPlay HTTP rows include ten required-header `behaviorHints` declarations. Host-only normalizer projection accepts the 23 direct URLs but strips these hints; this is not lossless compatibility. Tighten only the restricted getStreams adapter's unsupported-output gate to reject `behaviorHints` (including post-serialization/toJSON injection), rather than allowing any JS guest to accidentally return a misleading headerless stream. Target `app/alpha/scripts/pluginGetStreamsPrototype.mjs` and its existing tests; retain the pure documented normalizer's projection semantics. This is a fail-closed correction, not an HTTP-to-JS wrapper, new API, network privilege or claim that real installed code executed. Add synthetic nested-hint regressions; record the actual-row projection separately.

**Rollback:** protected revert of this evidence/test-only unit; no account configuration restoration, deployment or policy change to undo. Keep parent open unless all original criteria actually proved; exact missing source/API/transport capabilities stay explicit.

### Continuation results — corrected source `2dbe2da`, PR140

Implemented the planned unshipped lifecycle/quotas and restricted API seam, not a shipped arbitrary-code feature. [Exact-layer evidence](../../evidence/issue11-bounded-lifecycle-2026-10-21.md) records initial failed assertions, local engine launch failures, two automated P2 findings and their corrections, plus the inherited recursion-teardown red/green diagnosis. Guest stack tightened512→64KiB; no acceptance/security guard relaxed. Shared finite/input/output checks cover both prototypes. [Automated review/re-review](../../agent-runs/2026-10-21-issue11-automated-review.md) finds no remaining Standards/Spec blocker in this test-only subunit; not human rollout approval.

Local Node22.23.1 focused65/65/full1481/1481, lint, default inert12-asset build/check, Chromium156 plugin browser16/16, docs/governance15/15 and preview tests7/7 pass. Node policy/WASM, loopback HTTP and actual browser assertions are distinct from synthetic provider transport; no device or live provider pass. Actual exact-final-head and merge CI remain a separate recorded protected gate.

**Acceptance/next step at PR140:** keep all original parent criteria unchecked and issue11 OPEN/in_progress. Obtain an **actually installed JS source**, pinned code/required destinations/APIs and returned-stream evidence; review the narrow API subset against it. Protocol add-ons and original regression fixtures are not replacements. Implement/review real transport streaming/DNS/private-address/credential/cancellation controls and persistent budgets before sensitive application execution rollout. No routine owner question blocks completed test-only work; unavailable actual source evidence and concrete sensitive rollout review are the precise deferred sub-tasks. No other issue created/changed and no deployment.

### Real-installed-provider continuation results — 2026-10-21

[Exact-layer report](../../evidence/issue11-real-plugins-2026-10-21.md) and [sanitized receipt](../../evidence/issue11-real-plugins-2026-10-21.json) now replace assumptions with fresh installation observations: six HTTP manifests200, no delivered JS scraper code/custom sources. Reused source-only actual-app observer returns PenguPlay24/AIOStreams20/Telegram0 movie rows,44 canonical cards/zero pending; correct tv-only NexoTV catalog/stream returns1 row. AIOMetadata/Xperience declare no stream resource. Host-only45→44 URL projection is not JS execution or lossless playback;10 PenguPlay required-header rows expose unsupported behaviorHints.

Restricted adapter now rejects behaviorHints pre/post-serialization after synthetic red8/9; no policy broadening or change to pure normalizer. Real public third-party PenguPlay wrapper13,046B loads unchanged in QuickJS but invocation fails at absent console with0 transport calls. It is not matched to installed source and its embedded third-party constants were never dispatched. Licence fact recorded without blocking tests; no source redistributed or owner credential injected. New synthetic constructor/import/direct-binding/redirect/cancel boundary5/5, full focused71/71, app1487/1487, lint/inert12-asset build and Chromium16/16 pass. Initial assertion and missing-build failures retained. Local verification and privacy/session cleanup are completed and recorded in the report; separate automated review and exact-head/actual-merge protected integration are still pending at this checkpoint, not inferred from local success.

**Morning decision:** keep these six on the existing HTTP pipeline; do not fabricate a wrapper or change their account configuration. Installed-JS source acquisition is the exact deferred sub-task, not licence/ToS/owner permission. Next #11 step is a provider-published/matching installed JS bundle, immutable digest and narrow required APIs/destinations, then unchanged getStreams execution. Quotas verified at guest/injected-broker layer; general escape/live streaming/DNS/persistent-budget and application rollout remain unproved. Parent stays open with original criteria unchecked. No other issue/session/observer/deployment touched.

### 2026-10-21 owner-directed guest-globals continuation (before code)

**Scope/decision:** #11 only, branch `m2/issue-11-guest-globals` from PR143 merge `63e1e4f`. Owner correctly identifies absent console as an actionable guest-surface gap, independently of installation provenance. Continue the same immutable public PenguPlay wrapper (13,046B, SHA25608fc26eaf2d375b86549de848bea0a289cae12c64c689f33c452e005c5dc28b0); do not use missing installed-source provenance to defer this executable compatibility check. User explicitly selected the regression seam: `executeGetStreamsPrototype` with a getStreams listener that uses console and attempts guest/host boundary access. No further seam question is needed.

**Target/API contract:** minimal guest-only console facade in `app/alpha/scripts/pluginGetStreamsPrototype.mjs`, no-op preferred (zero host writes/serialization). Test-first in its existing test file and/or boundary corpus: console exists, ordinary logging does not execute argument getters/toJSON or reach host console/process/files/network; constructor chain stays guest; flood remains deadline/heap bounded and cancellation intact. Extend the existing CommonJS/fetch fixture in `tests/browser/plugin-engine.spec.mjs` with console-listener/guest-constructor assertions (same journey and external-request guard), not a new browser flow. Follow the actual unchanged source error chain before adding timers/URL/TextDecoder/base64 globals; add only demonstrated nonprivileged APIs with targeted regressions. Existing GET-only broker, trusted-host approval, unsupported request/header/output refusal and every budget remain unchanged. No general host-global copying, settings/tokens, native module loading, timer/event-loop bridge, actual network transport or app enablement.

**Real-source diagnostics:** add a reproducible, manual-only `app/alpha/scripts/pluginPenguPlayProbe.mjs` caller over existing executors (not a new runtime/journey), with strict API-enum/count diagnostic validation. Acquire pinned source into process memory, verify size+full digest before execution; never print/dump source, encoded credentials, raw errors, URLs or logs. Use existing bounded runtime and synthetic/replay transport, batching calls with small fixed trial counts. Report exact terminal missing API or policy boundary and normalized row counts/digests; fixture transport rows explicitly synthetic, never relabelled real provider/playback acceptance. Instrumentation outside source may catch an error to produce a strict API-name classification, but immutable descriptor.code must remain identical. Diagnostic code and actual adapter execution are separate layers. Any constants embedded upstream must never leave the guest in transport requests or outputs.

**Evidence/docs:** append this continuation to existing real-plugin evidence/report with a small sanitized receipt if useful; update compatibility matrix and only #11 tracker/ledger. Clearly state all six installations are HTTP-manifest add-ons with zero declared scraper/JS sources: sandbox load-bearing only for scraper-style plugins, not these HTTP paths. Raw-infohash/torrent delivery is outside browser scope and needs an authorized debrid/direct-HTTPS or bounded compute rung; do not silently accept/rewrite it or implement torrent/compute here. Parent remains open for genuinely unproved acceptance, but unchanged public source compatibility is evaluated on its own merits.

**Required verification:** deterministic red/green console regression; focused broker/adapter/sandbox/session tests; digest-pinned actual wrapper before/after outcomes; guest console flood/constructor/cancellation/output/host negatives; local Chromium plugin spec; inert build then full app tests/lint/audits; docs/governance/links/ledger/ancestry/privacy checks. Separate automated Standards/Spec actual-diff review (not human approval), all four exact-head and actual-merge protected contexts. No dependency, production/preview deployment, paid compute, owner/operator-session acquisition or other issue work. Rollback via protected revert of this test-only guest facade/test/evidence unit; already-issued upstream public source download cannot be undone.

**Consolidated owner amendment before additional probe/API code:** continue existing work, do not restart. Owner has added `phisher98/nuvio-providers` (Tapframe) to accountA; pin **6f88d1c6bddabf30d0768d76224d600ac32bab7c** and acquire its public manifest plus unmodified `providers/xprime.js`, `providers/hdhub4u.js`, `providers/vixsrc.js` in a small in-memory batch, recording exact bytes/SHA256. Use the manifest's `scrapers` array schema (id/name/filename/enabled/formats/supportedTypes), distinct from HTTP add-on resources. This owner-supplied installation fact supersedes the previous zero-local-source account snapshot; do not reauthenticate/reconfigure the account to rediscover it. Six original installations remain HTTP add-ons; the added repo is the separate load-bearing JS scraper class.

Use a shared/manual probe caller if needed (`pluginLocalScrapersProbe.mjs` / `pluginSourceProbe.mjs`, superseding the temporary PenguPlay-specific probe name), reusing existing executors and unchanged GET/host/byte/time/heap/stack/cancel gates. Faithful available surface is guest console, brokered fetch, built-in Promise; only add timers or other nonprivileged globals if the actual error chain demonstrates their need and a quota-tight faithful implementation is possible. No fake parser: record exact allowlisted cheerio-style import/global dependency and its absence, not a shimmed compatibility pass. No Node fs/path/crypto/native modules in guests. Record real runtime support facts separately: upstream dynamically loaded Hermes providers use Promise/.then rather than async/await; our actual engine is QuickJS, not Hermes, and a syntax scan is not Hermes certification.

Per source: actual load/invoke attempted flags and specific missing API/import/policy boundary, raw-array count where observable, normalized count, strict sanitized sample-field/header-presence booleans and digest, synthetic/replay versus live transport. Zero rows or refused header rows are not playable acceptance. Record that required playback headers cannot be supplied by an ordinary browser video element; preserve/refuse them, do not strip/rewrite them. These providers need an authorized header-capable proxy/compute/native rung, which is not implemented or authorized here. Add only that evidence/consequence as a comment on #142 (explicitly requested cross-ticket note), without taking over its implementation or changing other ticket state. Raw-infohash/torrent delivery independently remains debrid/direct-HTTPS or bounded-compute scope. Original #11 acceptance remains unchanged/open; public source execution is no longer deferred on installation provenance.
