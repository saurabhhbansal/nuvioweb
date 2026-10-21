# Nuvio JavaScript plugin compatibility — contract and status

Status: **internal synthetic contract plus a test-only engine prototype; execution is not shipped and no actual Nuvio JS plugin is supported yet.** Last updated 2026-10-21.

This document defines our experimental policy envelope, **not an upstream Nuvio API-v1 contract**. Trusted per-provider/per-host guest-header names and explicit redirect modes now cross a bounded Promise/broker bridge. Credential/hop-by-hop headers remain forbidden; each header-enabled or explicit-redirect call requires trusted per-hop address validation. Limits/defaults are unchanged. Four unchanged pinned-source synthetic replays now extract **2 PenguPlay rows in a separate diagnostic VM**, both with required playback headers: adapter acceptance remains0 with typed `playback-headers` refusal. xprime reaches an unapproved host (one actual run also timed out); vixsrc is refused for `Connection`; hdhub4u fails before invocation on its unavailable parser. No live provider read, socket-pinning/streamed-I/O proof, browser forbidden-header parity or application playback claim. See the [single evidence section](evidence/issue11-real-plugins-2026-10-21.md#bounded-headers--per-hop-replay-slice--plan-before-implementation). The inherited `pluginRuntime.js` remains unchanged. [Pinned upstream/API/license comparison](agent-runs/2026-10-21-issue11-upstream-review.md).

## Distinct provider classes and native contract

- **HTTP-manifest add-ons:** the original six expose HTTP resources and no `scrapers` array. Keep their existing pipeline; the JS sandbox is not load-bearing for their server backend.
- **Local JS Scrapers:** Settings → Local Scrapers adds a repository manifest with `scrapers:[{id,name,filename,enabled,formats,supportedTypes}]`. Owner reports adding Tapframe to accountA; the earlier zero-local-repo snapshot is historical. The sandbox is load-bearing for this separate class. At pinned6f88d1c6 the manifest measures25 entries (not reported28); all three selected source files exist even though only vixsrc's exact filename is listed.
- **Loaded native provider contract:** Promise-returning `getStreams(tmdbId,mediaType,seasonNum,episodeNum)` with `{name,title,url,quality,size,headers,provider,format}`; owner-verified Hermes dynamic code uses Promise/.then, not async/await. No Node built-ins. Our engine is QuickJS, not tested Hermes emulation. Console is guest-only no-op; Promise is native; fetch is a restricted brokered subset. Timers/parser modules remain unavailable, not silently simulated; none of the tested sources reached a timer before the measured header/import boundary.
- **Required custom playback headers:** an ordinary browser video element cannot supply an arbitrary required Referer/Origin/User-Agent map. Refusing unsupported header-bearing rows is correct for direct-video delivery, but is not scraper completeness. Preserve/classify the requirement and show the authorized header-capable proxy/compute/native rung. No such rung or unrestricted proxy is implemented. [#142 handoff](https://github.com/saurabhhbansal/nuvioweb/issues/142#issuecomment-6309232028).
- **Raw-infohash/torrent class:** outside browser direct playback; requires an authorized debrid-to-direct-HTTPS or separately bounded compute rung. Do not drop torrent semantics or label a magnet as a playable URL.

[Exact-source/API/row/header evidence](evidence/issue11-real-plugins-2026-10-21.md) · [compact four-artifact receipt](evidence/issue11-guest-globals-2026-10-21.json). No source patch, parser shim, host privilege or bound expansion. App1508/local Chromium16 pass at their stated layers; two synthetic raw rows are not playable-provider acceptance. User-visible app capability changed: **none**.

## Why execution is not shipped yet

- [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md) states that a browser Worker alone is insufficient for arbitrary trusted isolation. A Worker can still reach worker-global `fetch`, and same-origin storage or message channels create escape paths that static code review cannot reliably close.
- The credible options are an engine-level sandbox (QuickJS compiled to WASM with only injected bindings) or a cross-origin isolated container. Both need a dependency/licensing review, a bundle-size decision, a network broker design and a cancellation model before any untrusted code runs.
- QuickJS0.32.0 is pinned as a devDependency and its installed MIT notices were inspected; no GYK source was imported. The test-only prototype and separately opt-in asset builder are not a reviewed shipped integration. Actual GYK uses CommonJS/global `getStreams(...)`, flat results and response-like global fetch, unlike this internal resolve/api.fetch contract.

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

`app/alpha/js/core/plugins/pluginBroker.js` remains test-only. `createPluginNetworkBroker({allowedHosts, transport, headerPolicy, resolveHost, maxRequests, maxResponseBytes, maxRedirects})` enforces the following current policy (updated2026-10-21):

- HTTPS only, exact allowlisted hostnames (no subdomain widening), default port only, no embedded credentials, no IP literals, bounded URL length.
- Only `GET`, `redirect:manual`, `credentials:omit`. Default header policy empty. Trusted per-provider/per-host policy can allow bounded guest metadata names only (16/1KiB each/8KiB total); Cookie/Authorization/Connection and unknown options always refused. Origin/Referer must also satisfy approved HTTPS host policy with no userinfo/query/fragment.
- Redirect options follow/error/manual are bounded by independent request and hop quotas (default2 hops, ceiling5, adapter4 total dispatches). Every hop repeats URL/header checks; header-enabled or explicit-redirect calls require a trusted resolver, all returned addresses public, including repeated-host lookups. Vetted addresses are handed to the trusted transport, **not proof of real socket pinning**; legacy headerless injected fixtures have no DNS guarantee. All transports here are replay-only; no live streamed-I/O safety claim.
- Authorized dispatches are counted against `maxRequests`; oversized or non-text/binary responses beyond `maxResponseBytes` fail closed.
- Failures are bounded codes (`url`, `scheme`, `credentials`, `ip`, `port`, `host`, `method`, `requests`, `redirect-limit`, `redirect-url`, `response-size`, `response-body`, `transport`) with no raw exception text.

Focused tests (`node --test app/alpha/js/core/plugins/pluginBroker.test.mjs`, 10/10) cover allowlisted success, every denial class, method/request caps, same-host redirects, cross-host redirect rejection, redirect loops, oversized bodies, transport failure leakage and defensive allowlist normalization. No real network is used.

## Broker-bound sandbox prototype (test-only, 2026-10-19)

`app/alpha/scripts/pluginSandboxNetworkPrototype.mjs` binds the same broker to QuickJS. Legacy `api.fetch` remains synchronous/Asyncify and refuses calls from the synchronous Promise-job pump with `async-fetch-required` rather than corrupting WASM. `api.fetchAsync` uses bounded genuine guest-Promise replies; the getStreams facade awaits it. No guest host fetch, secrets or self-authorized hosts: request JSON<=12KiB is validated on the host. Completion handles settle outside suspended frames, all in-flight work is aborted/settled before teardown, and the existing deadline/heap/stack/output/request limits remain. This is engine plumbing, not application or native-Hermes enablement.

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

The asyncified QuickJS variant — used by our current asyncified binding, **not inherently required for asynchronous plugin I/O** (GYK instead uses sync QuickJS plus deferred guest promises) — historically measures **1,083,888 B raw / ≈377,955 B gzip** as JavaScript plus its `emscripten-module.wasm` asset; inlining the WASM as base64 would cost ≈464,960 B gzip. The sync variant is smaller (554,608 B raw) but cannot await host requests. Decision: async variant, external WASM asset, lazy-loaded only when the default-off plugin feature is explicitly enabled, never in the initial bundle. Full numbers, method and shipping requirements: [engine evaluation](PLUGIN_ENGINE_EVALUATION.md).

## Guarantees and limits

- The contract module is pure: no I/O, timers, storage, DOM, network or evaluation.
- Passing contract tests does **not** mean a plugin is compatible, safe or supported. No compatibility claim is made.
- The inherited URL-template `pluginRuntime` remains as-is and is not part of this contract.

## Rollback

Revert the contract module, tests, fixture and this document through a protected PR. No user data, schema, persistence or deployment state is involved.

## Browser engine execution (unit 6a, test-only)

The opt-in asset builder and `tests/browser/plugin-engine.spec.mjs` execute the real broker-bound QuickJS prototype from bundled JS + external WASM in Chromium156.0.8078.4 on Linux ARM64. 9/9 browser scenarios pass: the representative fixture normalizes one group/one stream and drops its `javascript:` URL; host globals are absent; an allowed synthetic fetch works through the broker; a denied host dispatches nothing; timeout, memory and output-size budgets fail closed; an unexpected external request is blocked and recorded; no page errors. The builder rejects output paths that escape through a symlink, and the representative test asserts the browser's actual `application/wasm` response. Asset hashes, MIME types and sizes are recorded in [the engine evaluation](PLUGIN_ENGINE_EVALUATION.md).

This remains test-only: the engine is not imported by the application or part of the preview. Later unit6b-1 permits **explicit opt-in** build/stager emission of inert, hash-validated assets; the normal build emits none. No plugin is shipped, compatible or supported.

## Bounded lifecycle continuation — 2026-10-21

The broker now validates finite integer ceiling-bounded budgets, charges each redirect-hop dispatch, accounts aggregate UTF-8 response bytes (including redirects), and propagates AbortSignal to the injected transport. Abort races also settle an uncooperative transport; late completion cannot re-enter the disposed VM. These caps are **after transport materialization**, not streamed-download/host-allocation/DNS-rebinding guarantees. No real transport is supplied.

The network prototype validates execution budgets, bounds serialized input/output in UTF-8 bytes, aborts transport at deadline/cancellation, and removes timers/listeners on teardown. A catchable guest denial cannot turn cancellation into success. Deadline applies after WASM startup; same-thread AbortSignal cannot preempt synchronous guest work until the event loop runs, so QuickJS's deadline remains the synchronous-loop bound. Already-dispatched remote work cannot be undone by abort.

`pluginPrototypeSession.mjs` is an **unshipped, test-only** lifecycle seam: only literal `enabled:true` opts in, lazy load follows descriptor/host/quota gates, descriptor hosts must be approved by trusted host policy, one active run, session-lifetime execution/failure ceilings, terminal disable, no raw logs returned, and only allowlisted media-identity input fields. It has no account/session credentials, app setting, persistent per-account/global budget, real fetch, or UI. Recreating a session resets its counters; this is not a persistent abuse boundary.

`pluginGetStreamsPrototype.mjs` adds a **test-only restricted adapter** for CommonJS `module.exports.getStreams` / global fallback, positional media identity, flat stream arrays and GET response-like `ok/status/url/text()/json()`. It still uses the same broker. No headers/statusText API, request headers/body/POST/credentials/guest signals, require/HTML/crypto/settings/TMDB key injection, subtitles/infoHash or object-valued URLs. Requests with unsupported options and results requiring unsupported metadata fail rather than silently dropping needed playback controls. This is original upstream-shaped regression code, not a real installed plugin or a general compatibility claim. Required `behaviorHints` are also unsupported and now rejected before and after serialization, rather than silently dropping nested playback headers discovered in real PenguPlay HTTP rows.

The [continuation evidence](evidence/issue11-bounded-lifecycle-2026-10-21.md) records exact commands, failures/corrections and layers. Synthetic normalized URLs are not real playable/provider acceptance. Actual installed-JS-plugin availability, getStreams/flat-result/global-fetch compatibility, reviewed real transport and application rollout remain unverified; #11 must remain open.

## Real configured provider matrix — 2026-10-21

[Actual observations and decisions](evidence/issue11-real-plugins-2026-10-21.md) · [sanitized receipt](evidence/issue11-real-plugins-2026-10-21.json). All six fresh configured manifests returned200 and declare HTTP add-on resources, not JS scraper code; custom/plugin sources remain zero. These providers stay on the existing HTTP pipeline, not a fabricated sandbox wrapper.

| Provider | Real HTTP result | Sandbox compatibility |
| --- | --- | --- |
| PenguPlay (priority) |24 movie rows;23 normalize to direct URLs,1 informational row dropped;10 rows require headers that pure projection loses | HTTP installation declares no JS artifact. Public13,046B wrapper now invokes with guest console but resolves0 after refused headers/redirect options, zero dispatch; no stream compatibility pass |
| AIOMetadata | Metadata/catalog/subtitles only; no stream resource | No installed JS artifact; no invented stream response |
| Xperience | Metadata/catalog only; no stream resource | No installed JS artifact |
| AIOStreams |20 movie rows;20 host-normalized URL rows | No installed JS artifact; HTTP rows are not server-source execution |
| Telegram | HTTP200,0 movie rows | Empty HTTP result; no installed JS artifact |
| NexoTV | tv-only; real catalog then stream returns1 row,1 host-normalized URL row | No installed JS artifact; not tested with a wrong movie ID |

Normalized URL shape is accepted by the existing repository mapper but is **not lossless playback compatibility**, sandbox execution or playback. The adapter now refuses unsupported behaviorHints entirely, including serializer injection. Actual QuickJS negative constructor/import/direct-binding/redirect/cancellation probes pass; they are synthetic hostile guests, not real installed plugins or general host-escape/live-DNS proof. Fresh focused71/71, full1487/1487 and local Chromium16/16 pass after documented clean-worktree build-order corrections. No app execution enablement, network privilege, proxy, dependency, deployment or other issue change.
