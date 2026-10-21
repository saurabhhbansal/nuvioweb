# Issue #11 — actual installed-provider verification, 2026-10-21 UTC

**Disposition: PARTIAL / not feature-complete; [#11](https://github.com/saurabhhbansal/nuvioweb/issues/11) remains OPEN / in_progress.** [Structured sanitized receipt](issue11-real-plugins-2026-10-21.json) · [plan written before changes](../plans/issues/issue-11.md). Only #11 was worked. No deployment or changes to other issues, sessions, elapsed observers, pinned preview, CI requirements or branch protection.

## Product-first decision and assumption for morning review

The owner authorizes this personal installation's own providers; no licence/ToS question or routine permission request was used as a blocker. **Use these six installations as the HTTP add-ons they actually expose, rather than manufacture a JS wrapper and call it installed-plugin execution.** Fresh authorized account state has six configured HTTP add-ons and **zero custom/plugin sources**. All six configured manifests returned200 and none declares a scraper array, JS filename or inline code under the supported descriptor schemas. This establishes what the installation delivers, **not** absence of private server-side source anywhere.

Assumption: ordinary bounded provider reads and fresh normal-UI login/onboarding are authorized; provider cache/request side effects may occur and cannot be undone. No provider setting, installation, entitlement or playback configuration was rewritten. The old #10 media-transfer allowance was not reused for another playback campaign; this run selected **no media**. No paid operation, new compute service or new credential recipient was introduced. A missing installed JS artifact defers that sub-task only; HTTP observations, real-row normalization, actual public-code failure diagnosis, adversarial sandbox tests, correction, review and protected integration continue.

## Fresh actual installation / HTTP observations — not sandbox execution

Reused the existing ignored #10 discovery/source observer, not a second browser journey. A fresh Chromium156.0.8078.4 owned context signed in through normal UI and selected an existing profile. The source-only adaptation adds `NUVIO_ONLY_SOURCES=1` to the existing `NUVIO_RUN_SUFFIX`/`NUVIO_ONLY_*` controls, skips selection/playback, and keeps raw source rows private in memory/restricted local files for normalization. Existing operator/observer contexts were not attached or navigated. The deployed app remains the old #10 runtime; current branch is **not** claimed as browser-served. Its public SOURCE readback and owned-session cleanup are recorded separately below.

| Actual configured provider | Fresh manifest / real request | Real HTTP outcome | Actual installed JS / getStreams outcome |
| --- | --- | --- | --- |
| **PenguPlay — priority** |200,4,861B; stream/meta/catalog/subtitles; movie/series/tv | **24 movie rows**,23 direct URLs and1 informational external-URL row | No installed JS source declared/obtained; no installed-code sandbox execution or normalized getStreams pass |
| AIOMetadata |200,236,389B; catalog/meta/subtitles, no stream resource | Not a stream provider in this manifest; no invented empty stream response | Same missing JS artifact; metadata-only manifest is not JS code |
| Xperience |200,104,543B; catalog/meta, no stream resource | Not a stream provider in this manifest; no invented empty stream response | Same missing JS artifact |
| AIOStreams |200,961B; stream/catalog/subtitles | **20 movie rows**, all direct URLs | Same missing JS artifact; server implementation is not a delivered Nuvio getStreams scraper |
| Telegram |200,2,089B; stream/catalog/meta/subtitles | **HTTP200 / zero rows** for the same movie; moved on | Same missing JS artifact; empty HTTP response is not a sandbox failure/pass |
| NexoTV |200,49,479B; tv-only catalog/stream/meta | Movie requests would be wrong. One real configured TV catalog returned100 items; first TV stream request **HTTP200 /1 row**.37,280 aggregate response bytes in those two bounded reads | Same missing JS artifact; real TV row, not JS source |

The existing app's settled **Gemini Man** lists reconcile exactly:44 returned rows =44 canonical source cards, zero pending provider requests. NexoTV's separate TV read makes **45 real returned rows** in total. No UI playback was attempted and no returned media URL was fetched. Manifests and TV requests are bounded metadata HTTP observations, **outside** the sandbox/broker: they do not certify sandbox DNS, redirects or network quotas. Receipts publish counts/statuses/digests only, not configured paths, tokens, media URLs or raw rows.

Initial discovery incorrectly requested stored *base* URLs directly and received six404s. Inspection of the existing [manifest URL builder](../../app/alpha/js/data/repository/addonRepository.js#L41-L48) established the `/manifest.json` suffix/query convention. The corrected six requests all returned200; the first attempt is an instrumentation failure, **not six provider outages**.

## What real returned rows normalize to — host-only projection

Actual private returned rows were passed through the existing [pure normalizer](../../app/alpha/js/core/plugins/pluginContract.js#L93-L107), then [streamRepository.mapStream](../../app/alpha/js/data/repository/streamRepository.js#L257-L285), with host fetch replaced by a throwing guard. **Zero network dispatches.**

- PenguPlay:24→**23 normalized URL rows**,1 informational external-URL row dropped.
- AIOStreams:20→**20**; NexoTV:1→**1**; Telegram:0→**0**.
- All44 normalized rows have the exact `{name,title,description,quality,url}` shape; the existing repository mapper accepts every row and preserves each URL in memory.
- **Not lossless/playable compatibility:** ten original PenguPlay rows declare required playback headers under `behaviorHints`. The pure normalizer intentionally projects that field away. A shape/count pass is not a claim these rows remain usable, that source-descriptor metadata is preserved, or that any plugin's getStreams executed.

### Scoped fail-closed correction driven by the real rows

The restricted [getStreams adapter](../../app/alpha/scripts/pluginGetStreamsPrototype.mjs) rejected top-level required headers but previously accepted then stripped nested `behaviorHints`. The new synthetic [regression](../../app/alpha/scripts/pluginGetStreamsPrototype.test.mjs#L96-L108) first reproduced that false success: **8/9 pass,1 fail, exit1**. The adapter now rejects **any declared behaviorHints**, both before normalization and after serialization (including getters/toJSON injection). This is conservative refusal, not support for those hints. Guest networking, quotas and host approval are unchanged; the documented pure normalizer is unchanged. No HTTP-response-to-JS wrapper was added to manufacture acceptance.

## Actual third-party JavaScript executed — provenance does not match installed code

Public source discovery found a real self-contained Nuvio JS scraper, [G2nOOn/Nuvio-Plugin / providers/2peckle.js](https://github.com/G2nOOn/Nuvio-Plugin/blob/58c3708a491914f5c1439f6f3ddb3269b8b0ca8e/providers/2peckle.js), describing itself as a PenguPlay/2Peckle wrapper. Pinned revision **58c3708a491914f5c1439f6f3ddb3269b8b0ca8e**, actual UTF-8 **13,046B**, SHA-256 **08fc26eaf2d375b86549de848bea0a289cae12c64c689f33c452e005c5dc28b0**. It was acquired privately and executed **without modifying its source bytes**; it was not imported into the repository or presented as the owner's installed JS.

**Licence fact:** candidate repository metadata declares no licence; QuickJS/wrapper0.32.0 is MIT; no candidate source is redistributed. This did not block technical testing.

| Layer / operation | Observed result | Limit |
| --- | --- | --- |
| Actual Asyncify QuickJS bootstrap with unchanged public source inside a CommonJS scope | **Loads**, module exports a function; source size below unchanged256KiB ceiling | Not a source match to the owner's installed HTTP endpoint |
| Actual restricted `executeGetStreamsPrototype`, unchanged source and movie identity | **Fails `plugin`**, zero returned rows and **zero transport dispatches** | No real-provider network or playback acceptance |
| Separate actual-VM diagnostic caller, unchanged source | `console` absent; first invocation raises **ReferenceError referring to console** (published booleans only) | Diagnostic caller is separate instrumentation, not an adapted successful source |
| Static follow-on requirements | Wrapper also requests fetch headers, which remain unsupported | Not reached by the failed unmodified invocation; no invented second runtime failure |

The source includes embedded third-party credential constants. **No owner credentials were injected, no embedded credentials were dispatched, no source literals/raw exceptions were published, and no console/header/host-policy widening was made to force green.** Public search also found unrelated provisioning/server code; that is not a Nuvio scraper or installed plugin and was not relabelled as one. The other five installations likewise provide HTTP manifests, not executable source artifacts. Their private backend implementations were not acquired or ported. No legal question or missing routine owner decision caused this deferral.

## Security proof at its actual layer

[New boundary corpus](../../app/alpha/scripts/pluginSandboxBoundary.test.mjs) executes **genuine adversarial guests in actual QuickJS/WASM**, not source-regex simulations. Network transport is deliberately synthetic: denied destinations must never reach even that function, so these tests issue no external network requests.

| Probe | Fresh result / observation | What is not established |
| --- | --- | --- |
| Infinite guest loop; slow suspended host call | Existing focused suite interrupts at deadline; a later execution succeeds | Not slow real-provider timing; startup excluded from guest deadline |
| Guest allocation bomb; unbounded recursion | Guest memory/stack limits fail closed; clean subprocess teardown regression passes | Guest heap does not cap all host/WASM allocation |
| Huge source/input/output, UTF-8/NaN/Infinity limits | Existing focused suite rejects oversize/nonfinite budgets; output-size checked before normalization | Not streaming/preallocation control of host transport strings |
| Direct binding bypass, unapproved hostname, loopbackIPv4/IPv6, metadataIP, HTTP scheme | New corpus: **zero denied-target dispatches**, even using visible `__hostFetch` directly | No live DNS-resolution/rebinding/private-range connection proof |
| Redirects to unapproved host /127.0.0.1 /169.254.169.254 /IPv6 loopback | Only the initial approved synthetic destination dispatched; denied redirect target **never dispatched** | A future real transport must disable automatic redirects and pin approved DNS results |
| Function/Object/fetch/log/host-binding constructor chains | All remain guest-realm; host-only sentinel absent, host Object.prototype unchanged | Targeted escape probes, not a proof against every engine vulnerability |
| Dynamic `node:fs` / `node:child_process` imports | **Zero successful imports** | No broad formal host-escape guarantee |
| Mid-call cancellation, transport ignores abort, late rows | Abort observed, returns `cancelled`, late rows discarded, subsequent run succeeds | Already-issued remote operations cannot be undone |
| Browser bundled JS/WASM and external-request guard | See executed browser result below; actual Chromium, synthetic provider transport | Not installed-source/browser/playback certification |

The first constructor-chain probe was **4/5 pass,1 fail** because it compared AsyncFunction's returned *Promise* to a string. A safe synthetic diagnostic showed four strings plus one Promise; awaiting every constructor result fixed the assertion without changing the sandbox. The original red result is retained as an instrumentation failure, not an escape finding silently erased.

**No open hosted proxy was introduced:** there is no application integration, hosted listener, proxy route, CSP relaxation or deployment in this unit. The normal build remains12 baseline assets with no engine enabled. Broker negative dispatch assertions and boundary checks are concrete tested claims; neither absence of a new route nor these probes proves a future live transport safe.

## Executed commands and results

Pinned **Node22.23.1**, npm10.9.8, QuickJS wrapper0.32.0, Linux ARM64. Private helper files are intentionally ignored; commands name observation tools, not redistributable plugin fixtures. No raw private log is an evidence attachment.

```sh
# Existing #10 observer reused with new source-only switch; no stream selection
PLAYWRIGHT_BROWSERS_PATH=/home/saurabh/.cache/ms-playwright node .tmp/issue10-real/issue11-discover.mjs
PLAYWRIGHT_BROWSERS_PATH=/home/saurabh/.cache/ms-playwright NUVIO_ONLY_SOURCES=1 NUVIO_RUN_SUFFIX=issue11-sources node .tmp/issue10-real/issue11-run-engine.mjs chromium 'Gemini Man'
node .tmp/issue11-real/inspect-installed.mjs
node .tmp/issue11-real/nexo-stream.mjs
# Isolated #11 worktree; private data read, allowlisted projection exported
node .tmp/issue11-public/normalize-real.mjs
node .tmp/issue11-public/run-public-candidate.mjs
node .tmp/issue11-public/diagnose-candidate.mjs
```

All completed exit0 after the manifest-path correction; candidate command exit0 means **observation completed**, not getStreams passed. Normalizer import warned that no cloud configuration was present; it only called the pure mapper, and the network guard recorded zero dispatches.

```sh
node --test app/alpha/js/core/plugins/pluginBroker.test.mjs app/alpha/scripts/pluginSandbox*.test.mjs app/alpha/scripts/pluginPrototypeSession.test.mjs app/alpha/scripts/pluginGetStreamsPrototype.test.mjs
NUVIO_LOCAL_PROPERTIES="$PWD/tests/fixtures/build.properties" npm run build --prefix app/alpha
node scripts/check-alpha-build.mjs
npm test --prefix app/alpha
npm run lint --prefix app/alpha
npm audit --audit-level=low
npm audit --prefix app/alpha --audit-level=low
PLAYWRIGHT_BROWSERS_PATH=/home/saurabh/.cache/ms-playwright npx playwright test tests/browser/plugin-engine.spec.mjs --project=chromium
```

- Locked `npm ci --ignore-scripts` at root/app: exit0, no lockfile changes; both explicit audits:0 vulnerabilities/exit0.
- Focused **71/71**,0 failures/skips, exit0. New boundary subset **5/5**. Adapter nested-metadata red case retained; corrected case passes.
- Inert build/artifact check: **12 nonempty baseline assets**, no privileged fields/engine enablement, exit0. Full app **1487/1487**,0 failures/skips, exit0; lint exit0.
- Initial full app before build: **1485 pass/2 fail** (missing built bundle in clean worktree). Initial browser command timed out waiting for its built-app webServer. Corrected execution order matches CI: build first, then tests; neither first attempt is claimed as a pass.
- Corrected local Chromium browser command: **16/16 pass**,0 failures/skips,7.3s, exit0; actual bundled WASM/browser assertions with synthetic transport. No local WebKit/Gecko claim added; required CI runs those engines separately.
- `node --test scripts/check-docs.test.mjs scripts/governance.test.mjs`: **15/15 pass**,0 failure/skip; `node scripts/check-docs.mjs`, `node scripts/check-progress.mjs`, `git diff --check`: exit0. Structural documentation/ledger checks are not feature completion.

## Acceptance mapping and exact next step

| Original criterion | Proven now | Still deferred / parent disposition |
| --- | --- | --- |
| Representative supported JS plugin fixtures return normalized streams | Real third-party source loads; its invocation fails honestly.45 real HTTP rows and44 normalized projections measured separately | **Not met for actual installed JS.** Six installations expose no JS scraper artifact; public wrapper is not matched to installation and returns no rows in the restricted VM. Keep unchecked |
| Execution time, memory/network/output quotas enforced | **Verified for the bounded test-only guest/injected-broker seam:** focused71 and actual browser regression evidence, including real infinite loops/allocation/serialization and cancellation | Not a claim of live-download/DNS/host-allocation or persistent account/global quotas. Full product criterion remains unchecked rather than transfer test-layer success to unsupported real transport |
| No open hosted fetch proxy or worker host escape | No proxy/app deployment added; tested constructor/import/prototype escape attempts blocked; direct/redirect denied targets never reach transport | **Partial**, not universal engine-escape or live SSRF proof. Future transport streaming/DNS pinning/private-address filtering and concrete rollout review remain; keep unchecked |

**Exact next implementation step:** keep the six working installations on the existing HTTP provider pipeline. For #11, acquire a *matching actual JS scraper bundle/manifest* from provider publication or a future installed-plugin export, pin its digest and required APIs/destinations, then rerun unchanged bytes through the restricted adapter before considering any safe guest-only API additions. Until that artifact exists, do not write a substitute wrapper, run a server application as a scraper, export account settings/credentials to guests, weaken quotas or claim real-plugin acceptance. A real sandbox transport separately needs bounded streamed responses, manual per-hop redirects, approved public DNS/connection pinning and abort; no hosted launch is authorized here.

## Completion / protected integration record

At **05:03:41Z**, final private-literal scanning of the changed public artifacts passed; deliberate in-memory access-token injection was rejected. The scanner initially classified a public provider name as secret because display-name maps are keyed by credential-bearing URLs; diagnosis published only digest/length/line. Excluding only the six authoritative public provider names/fixed public origins resolved this false positive, not a credential exception. Public SOURCE returned200 and still matched the unchanged pinned runtime. Exact fresh-owned-session identity checks passed; **local-only logout HTTP204**, never account-global revocation. Six exact resolved/type-checked private files were removed (fresh browser state, raw manifests/streams and public candidate source containing embedded third-party constants); credential file unchanged. No existing operator/observer session was attached or stopped. No broad account restore was attempted.

Distinct automated actual-diff review and all four exact-head plus actual-merge protected checks remain pending. This pending line must not be read as completed integration. Automated review is **not independent human approval**; required independent approvals are zero in this sole-maintainer repository.

Rollback: protected revert of this narrowly scoped adapter-refusal/test/evidence unit. Pure normalizer, ordinary HTTP pipeline, deployed app and account configuration stay unchanged; already-issued remote reads cannot be undone.
