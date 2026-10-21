# Issue #11 — bounded lifecycle continuation

2026-10-21 UTC. **Issue remains OPEN / in_progress. No real JS-plugin compatibility, device, media playback, live-transport or release pass.** [Plan](../plans/issues/issue-11.md), [compatibility matrix](../PLUGIN_COMPATIBILITY.md), [pinned upstream/API/license review](../agent-runs/2026-10-21-issue11-upstream-review.md).

## Decisions and assumptions for morning review

- Work only on #11, baseline `79ccee700d54cd9647c2d6542645c9c7df8d1b69`; source branch `m2/issue-11-bounded-runtime`. The supplied `saurabhbansal/nuvioweb` command failed (exit1, repository unresolved); use configured origin `saurabhhbansal/nuvioweb`, matching issue title/plan. #1/#9 report closed; historical dependency evidence is not a fresh execution pass.
- Default-off **test-only** session seam, not arbitrary plugin execution in the production application. No changes to application imports, user settings, auth, account storage, service worker, other issue acceptance, elapsed observers or deployment. Concrete future shipped sandbox integration remains sensitive review-gated, not awaiting routine permission.
- Actual available public provider evidence records six ordinary protocol add-ons and **zero custom JS/template sources**. This session did not access credentials/private account state, install a JS source, download media or fabricate a real provider. A lawful, authorized installed JS plugin plus plugin-specific provenance/license/destinations and lawful returned stream evidence is still missing. Original regression code and `media.example` URLs do not satisfy that acceptance.
- Pinned GYK uses CommonJS/global `getStreams` with positional arguments, flat streams and response-like global fetch; our original `resolve(api,input)`/grouped-result/api.fetch contract is internal. This continuation adds a narrow original getStreams/flat-result/GET-response-like adapter but not full GYK APIs or unmodified installed-plugin certification. Do not brand it Nuvio API-v1 support. No GYK source copied or unsafe header/proxy policy ported.
- Keep Asyncify for this existing binding, not as a universal requirement: GYK sync QuickJS with deferred guest promises supports asynchronous host I/O. A bridge/engine swap needs measured cancellation/concurrency tests, not an unsupported performance claim.

## Changes and verified seam

Broker finite integer ceilings; every authorized redirect dispatch consumes request budget; redirect bodies count against aggregate UTF-8 byte budget; optional cancellation signal reaches the injected transport; ignored abort and late completion cannot resume the VM. Network prototype validates budgets, caps serialized UTF-8 input/output, propagates abort/deadline and cleans timers/listeners/VM. Error-code allowlist prevents guest-forged network exceptions exporting arbitrary reason strings.

New session seam loads only after literal opt-in, descriptor validation, trusted-host approval and session quota gates. One active execution, execution/failure lifetime ceilings, terminal disable/cancel; strips non-media input and raw plugin logs. Counters are session-local, not account-persistent/global abuse controls. Browser regression covers opt-in, quotas, cancellation, ignored abort, UTF-8 size, absent host globals and recovery with real QuickJS/WASM; plugin transport remains synthetic.

## Executed verification

Toolchain: installed Node22.23.1 / npm10.9.8 (`PATH=/home/saurabh/.local/share/mise/installs/node/22.23.1/bin:$PATH`, `HUSKY=0`). Durable local logs are `/tmp/nuvioweb-issue11-*.log`; these contain synthetic test data, not provider/session secrets.

| Command | Observed result | Layer and limits |
| --- | --- | --- |
| `node --test app/alpha/js/core/plugins/pluginBroker.test.mjs` | 15/15, exit0 | Node policy tests; injected transport, no HTTP/DNS |
| `node --test app/alpha/scripts/pluginSandbox*.test.mjs app/alpha/scripts/pluginPrototypeSession.test.mjs` (first run) | 38/40, exit1 | Retained failure: old exact transport assertion omitted newly required signal; timeout path lost elapsedMs. Updated exact assertion checks method+signal only, no headers; restored elapsedMs. No guard weakened. |
| `node --test app/alpha/js/core/plugins/pluginBroker.test.mjs app/alpha/scripts/pluginSandbox*.test.mjs app/alpha/scripts/pluginPrototypeSession.test.mjs` (corrected run) | 55/55, exit0 | Real QuickJS/WASM in Node, synthetic source/transport; subsequent forged-error regression requires final rerun |
| `npx playwright test tests/browser/plugin-engine.spec.mjs --project=chromium` | 13/13, exit0 (6.0s) | Real browser JS/WASM from loopback HTTP with observed WASM MIME; synthetic plugin transport, not app/provider/device acceptance |
| `npm ci`; `npm ci --prefix app/alpha` | Both exit0 | Locked installs, no dependency/lockfile changes |
| `npm audit --audit-level=low`; `npm audit --prefix app/alpha --audit-level=low` | Both exit0 | Locked dependency audit; not engine escape/security proof |
| `npm test --prefix app/alpha` | 1471/1471, exit0 | Full app unit suite at pre-forged-error-test tree; final exact-head CI still required |
| `npm run lint --prefix app/alpha` | exit0 | Static lint |
| `NUVIO_LOCAL_PROPERTIES="$PWD/tests/fixtures/build.properties" npm run build --prefix app/alpha`; `node scripts/check-alpha-build.mjs` | Both exit0; 12 baseline assets, inert config, no privileged fields | Local inert default build only, no upload |

Additional observed runs:

- Final focused command adds `app/alpha/scripts/pluginGetStreamsPrototype.test.mjs` to the corrected focused command above: **62/62 pass,0 skip, exit0**. Covers CommonJS/global positional API, GET response text/json, zero-dispatch POST/header/credential/signal rejection, absent modules/host globals, unsupported playback metadata refusal, unsafe URL drops, cancellation/time quota and forged-error redaction. Synthetic regression only.
- `NUVIO_PLAYWRIGHT_WEBKIT=1 NUVIO_PLAYWRIGHT_FIREFOX=1 npx playwright test tests/browser/plugin-engine.spec.mjs --project=chromium --project=webkit --project=firefox` (before adapter browser additions): **exit1,24 launch failures,15 reported passes**. Of those passes only13 are actual Chromium tests;2 are Node manifest-only cases in other projects. WebKit launch lacks system libraries; Gecko executable missing at default path. Neither engine executed a guest test. No bypass, dependency-validation suppression or fake engine pass. Existing required CI installs its own engines/dependencies; multi-engine pass requires those actual checks.

## Corrective review and final local results

Separate [automated actual-diff review](../agent-runs/2026-10-21-issue11-automated-review.md) at `ca325a7` found2P2 defects: descriptor self-authorization and guest serializer metadata bypass; both corrected at source head `2dbe2da3db5afc931ea9bf0f5d507875a96b72a5`. Adapter now requires independently trusted approvedHosts and validates plain parsed output before normalization. Shared media-input projection removes the P3 duplication heuristic.

The review also surfaced an inherited swallowed `JS_FreeRuntime` assertion in an otherwise passing suite. Ordered/subset probes identified **sync unbounded recursion**, not the adjacent allocation test. A real child-process regression (with inherited NODE_TEST_CONTEXT removed and exactly1 executed case asserted) went red. Error-handle cleanup alone stayed red; guest stack512KiB permitted a host RangeError before a guest error handle returned. Tightening stack to64KiB and enforcing it as a shared hard ceiling made the exact regression green. No log/assertion suppression or relaxed stack guard; temporary debug tags removed. Both prototypes now use finite limits and UTF-8 input/output checks. Earlier standalone child invocations inherited runner context and were not valid reproduction evidence; the final regression asserts actual executed count.

At corrected source `2dbe2da` with pinned Node22.23.1:

- Focused command (broker + sandbox wildcard + session + adapter): **65/65 pass,0 skip, exit0**.
- `npm test --prefix app/alpha`: **1481/1481 pass,0 skip, exit0**; searched output has **no Aborted/Assertion diagnostic**. This is tested teardown evidence, not a universal engine-security proof.
- `npm run lint --prefix app/alpha`: exit0.
- Inert default build and `node scripts/check-alpha-build.mjs`: exit0, **12 baseline assets**, inert config/no privileged fields.
- `npx playwright test tests/browser/plugin-engine.spec.mjs --project=chromium`: **16/16 pass,0 skipped, exit0 (6.3s)**. Includes actual-browser serializer refusal; loopback JS/WASM HTTP only, provider transport synthetic.
- `node --test scripts/check-docs.test.mjs scripts/governance.test.mjs`:15/15 exit0; `npm run test:preview`:7/7 exit0; docs links, structural ledger, whitespace, commit-reference ancestry pass. All non-#11 ledger entries identical to baseline; unchanged CURRENT prefix preserved except appended scoped pointer.

PR [#140](https://github.com/saurabhhbansal/nuvioweb/pull/140) opened as a draft. Exact final-head and actual-merge protected contexts/review resolution must be verified before integration; pending checks are not a pass. Final protected outcome will be recorded in this issue's PR/issue thread without claiming a deployment or acceptance closure.

## Security, privacy, licensing, costs and rollback

No new credential recipient, real fetch, server endpoint, DNS resolution, provider call, unrestricted proxy, media relay or new paid operation. Engine remains a pinned devDependency. Installed MIT notices include wrapper and embedded QuickJS authors; no upstream code imported. Already-dispatched remote operations could not be undone by a future abort. Broker byte caps occur **after materialization** and do not bound host transport allocations/streaming egress; no DNS/IP/rebinding protection is established by hostname syntax. No hosted-fetch/worker-escape guarantee follows from a negative test corpus. QuickJS memory bounds guest heap, not every host/WASM/parser allocation. Same-thread cancellation cannot interrupt synchronous JS until the host event loop runs; QuickJS deadline interrupts loops. WASM construction is outside execution time; cancellation is checked before guest execution, not a startup-time SLA.

Rollback: protected revert of this test-only unit. No account, deployment, observer or production state to restore. CI and review must be green at exact head; required up-to-date contexts, resolved conversations, no bypass/force push. Automated review is not independent human approval. #11 acceptance stays unchecked until actual supported plugin, real-transport quotas and concrete sensitive integration review are established.
