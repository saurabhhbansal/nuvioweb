# Issue #11 — actual installed-provider verification, 2026-10-21 UTC

**Disposition: PARTIAL / not feature-complete; [#11](https://github.com/saurabhhbansal/nuvioweb/issues/11) remains OPEN / in_progress.** [Structured sanitized receipt](issue11-real-plugins-2026-10-21.json) · [plan written before changes](../plans/issues/issue-11.md). Only #11 implementation was worked; the consolidated owner brief additionally requested the linked #142 header-evidence comment. No other ticket implementation/status change, deployment, operator session/observer interaction, pinned-preview update, CI requirement or branch-protection change.

## Product-first decision and assumption for morning review

The owner authorizes this personal installation's own providers; no licence/ToS question or routine permission request was used as a blocker. **Use these six installations as the HTTP add-ons they actually expose, rather than manufacture a JS wrapper and call it installed-plugin execution.** The initial authorized account snapshot had six configured HTTP add-ons and **zero custom/plugin sources**. The owner subsequently added a Local Scrapers repository; the pinned-artifact continuation below supersedes that earlier zero-local-source account assumption without a new login. All six configured manifests returned200 and none declares a scraper array, JS filename or inline code under the supported descriptor schemas. This establishes what the installation delivers, **not** absence of private server-side source anywhere.

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

The source includes embedded third-party credential constants. **Privacy limitation:** the initial raw-file inspection emitted encoded upstream constants in the session's tool transcript before they were recognized; therefore a claim of zero credential material in every session log would be false. No owner credentials were involved. The constants are not repeated in these public repository artifacts, the source was removed during cleanup, and no embedded credentials were dispatched or rotated. **No owner credentials were injected, no raw source/exceptions are included in the evidence commits, and no console/header/host-policy widening was made to force green.** Public search also found unrelated provisioning/server code; that is not a Nuvio scraper or installed plugin and was not relabelled as one. The other five installations likewise provide HTTP manifests, not executable source artifacts. Their private backend implementations were not acquired or ported. No legal question or missing routine owner decision caused this deferral.

## Owner-directed console/global continuation — 05:47Z

**The absent-console gap is fixed independently of installation provenance.** The historical PR143 table above records the pre-fix outcome, not the current one. The [restricted adapter](../../app/alpha/scripts/pluginGetStreamsPrototype.mjs) now supplies guest-defined, frozen `console.log/info/warn/error/debug` no-ops. No host console/object/function is copied; arguments are not stringified or serialized, nothing is buffered, no host write occurs and adapter log retention stays zero. No speculative timers/TextDecoder/URL/base64 polyfills were added: none surfaced as a missing global before the actual next boundary.

The [reproducible manual probe](../../app/alpha/scripts/pluginPenguPlayProbe.mjs) downloads the pinned public source into memory under a256KiB acquisition cap/20s timeout, verifies13,046B/full SHA256 and UTF-8 round-trip equality, then passes the identical code string to the existing executor. No candidate source or raw error/URL/log is dumped. [New strict receipt](issue11-guest-globals-2026-10-21.json).

| Layer | Actual observed result |
| --- | --- |
| Unchanged real wrapper through actual adapter, movie453405 | **Executes and resolves to `[]`**, adapter `ok:true`,0 normalized streams,0 broker transport dispatches |
| Normalized row serialization | `[]`; SHA256 **4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945** |
| Separate actual-VM diagnostic caller, unchanged source plus observation outside it |2 guest fetch attempts, both rejected as **`unsupported-request`**; observed option names **`headers` and `redirect`**; zero transport dispatches; wrapper catches/reduces the failures to an empty array |
| Missing-global classification | No additional missing global surfaced before the request-option boundary; this does not establish that later unvisited paths need none |
| Transport | Synthetic empty-JSON stub, **unused**. No replayed/live provider response reached the wrapper;0 live provider requests and no credential forwarding |

The specific remaining surface gaps are **`fetch(options.headers)` and `fetch(options.redirect)`**, not absent console or installation provenance. The fetch shim still accepts only absent options or `method:"GET"`; it rejects these options before calling the broker. Header values/URLs were neither recorded nor forwarded. A successful function return with zero rows is **not a successful stream lookup**, proof of empty real provider inventory, or end-to-end compatibility. No request-option, destination, verb or quota gate was relaxed to force rows. No new credential recipient or hosted transport was introduced.

The actual source SHA256 remains **08fc26eaf2d375b86549de848bea0a289cae12c64c689f33c452e005c5dc28b0**. Defaults remain250ms guest deadline,16MiB guest memory,64KiB stack,64KiB output,256KiB source; broker4 dispatches,256KiB/body,1MiB total and2 redirects. Source-acquisition timeout/cap are a distinct trusted manual-tool layer, not guest budgets or a live broker transport guarantee.

### Regression and verification layers

The requested console-listener regression ran **red0/1**, then **green1/1**. It logs an argument with throwing `toString`/`toJSON`, invokes a listener, probes the console function constructor for host process/require/sentinel access, and asserts no log export. Console flooding hits the unchanged50ms test deadline; a fresh execution succeeds. The constructor-chain boundary corpus now includes `console.log.constructor`. The existing browser CommonJS/fetch journey also uses a console listener and checks guest-only construction/no log export; no additional journey.

One extra assertion attempt was **15/16**, not a runtime failure: the flood timed out correctly, but its fresh-empty-result control expected `dropped:0`; the existing normalizer counts a discarded empty group as1. The control now returns a valid known row to test recovery without coupling to unrelated empty-group accounting; no normalizer or bound changed.

```sh
node --test --test-name-pattern='console-using getStreams listener' app/alpha/scripts/pluginGetStreamsPrototype.test.mjs
node app/alpha/scripts/pluginPenguPlayProbe.mjs
node --test app/alpha/js/core/plugins/pluginBroker.test.mjs app/alpha/scripts/pluginSandbox*.test.mjs app/alpha/scripts/pluginPrototypeSession.test.mjs app/alpha/scripts/pluginGetStreamsPrototype.test.mjs
NUVIO_LOCAL_PROPERTIES="$PWD/tests/fixtures/build.properties" npm run build --prefix app/alpha
node scripts/check-alpha-build.mjs
npm test --prefix app/alpha
npm run lint --prefix app/alpha
npm audit --audit-level=low
npm audit --prefix app/alpha --audit-level=low
PLAYWRIGHT_BROWSERS_PATH=/home/saurabh/.cache/ms-playwright npx playwright test tests/browser/plugin-engine.spec.mjs --project=chromium
```

Node22.23.1: focused **73/73**, full app **1489/1489**, local Chromium **16/16** (6.7s),0 failures/skips. Inert12-asset build/check and lint pass; both audits0 vulnerabilities. Focused tests use actual QuickJS with synthetic transport; browser assertions use actual bundled WASM with synthetic transport; the pinned-source observation is actual third-party code but returns no stream rows. A successful observation command is not provider acceptance. Separate review/final-head/actual-merge integration for this continuation is still pending at this checkpoint; local success does not stand in for those gates.

### HTTP add-ons, scraper sandbox and torrent rung

All six observed installations are **HTTP-manifest add-ons with zero declared scraper/JS source**. Their HTTP resource calls remain on the existing add-on pipeline. The sandbox is load-bearing **only for scraper-style JS plugins**, not required to reinterpret these HTTP installations or to execute their private server backends. Public-wrapper host-surface testing is still useful and proceeds independently of whether it matches one installation.

**Raw-infohash/torrent-class results are outside the browser playback scope.** Do not turn an infohash/magnet into a supposedly playable browser URL or drop its required semantics. An owner-authorized debrid service yielding direct HTTPS, or a separately bounded user-owned/authorized compute rung, is needed; neither debrid integration, torrent transport nor compute is implemented here. The existing adapter's `infoHash`/required metadata refusals stay intact. No owner permission question or licence blocker is used to avoid this technical distinction.

## Owner-added Tapframe Local Scrapers — consolidated continuation

Owner reports adding **phisher98/nuvio-providers** to accountA through **Settings → Local Scrapers**. This is a real JS scraper-repository class, not a seventh HTTP add-on. No account reauthentication/reconfiguration was performed here. The [manual batch caller](../../app/alpha/scripts/pluginLocalScrapersProbe.mjs) and [shared strict probe](../../app/alpha/scripts/pluginSourceProbe.mjs) acquire source in memory with two concurrent public downloads, verify immutable source digests/byte identity, then run VMs sequentially under the unchanged limits. No Node built-in/parser is provided to the guest; the trusted diagnostic caller's own file/hash operations are outside it.

Pinned revision **6f88d1c6bddabf30d0768d76224d600ac32bab7c**. The actual manifest is **12,847B**, SHA256 **88cfd5c484e5f3c641863e28ad88a72bf5a49331e2953a0e1187fb66fb13984f**, with **25** scraper entries, not the28 reported in the brief. Only the exact vixsrc filename among these three is declared there. All three requested files nevertheless exist at this exact pin (independent Git-tree blob/size readback); all were executed as requested, without moving to HEAD or treating the metadata discrepancy as a blocker. Initial all-three-declared assertion failed before executing source and was corrected to report declaration independently of file existence. Repository metadata declares GPL-3.0; provider source was executed only in memory, not redistributed/imported into this repository, and existing notices/history are untouched.

| Exact pinned real artifact | Bytes / SHA256 | Actual execution / next boundary | Raw rows / normalized / samples |
| --- | --- | --- | --- |
| [xprime](https://github.com/phisher98/nuvio-providers/blob/6f88d1c6bddabf30d0768d76224d600ac32bab7c/providers/xprime.js) |36,936 / `279882bcb321cde7e57722251ae2b96fda8e9549b0cb17e78cc8d44866e1e150` | Loads and invokes;1 GET attempt carrying `headers`, rejected as `unsupported-request` before transport; source catches it and resolves empty |0 /0 /none; no returned header map observed |
| [hdhub4u](https://github.com/phisher98/nuvio-providers/blob/6f88d1c6bddabf30d0768d76224d600ac32bab7c/providers/hdhub4u.js) |59,747 / `eb859d79ac773aabe62c720c6890cd32e17669995675ff34c16ae0db7cf70256` | Actual evaluation attempted, fails load with adapter `runtime`; getStreams not reached. A separate **throw-only**, guest diagnostic import observer identifies **cheerio-without-node-native**; no parser/module is loaded or shimmed |Not produced /0 /none; no returned headers observed |
| [vixsrc](https://github.com/phisher98/nuvio-providers/blob/6f88d1c6bddabf30d0768d76224d600ac32bab7c/providers/vixsrc.js) |12,214 / `f3a4107c2a43d3e239b571a0068ba053c457872fef7b76cff3f94affa4005a6c` | Loads and invokes;1 GET attempt carrying `headers`, rejected before transport; source catches it and resolves empty |0 /0 /none; no returned header map observed |

**Every transport was synthetic**, an empty-JSON stub, unused because all paths stopped before dispatch.0 live provider/media requests; no captured live replay responses or actual playback. Each normalized output serializes to `[]` with SHA256 **4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945**. All source files mention a headers field statically; that does **not** mean any required-header output row was observed. The fixture regression independently proves diagnostic raw-header-row presence/count can be reported without exporting values. Source `async`/`await` word scans are labelled lexical mentions, not executable-syntax or Hermes certification; hdhub4u mentions `async` but not `await`.

Upstream contract supplied by the owner: a scraper manifest has `scrapers:[{id,name,filename,enabled,formats,supportedTypes}]`; `getStreams(tmdbId,mediaType,seasonNum,episodeNum)` returns a Promise of rows with `{name,title,url,quality,size,headers,provider,format}`. Dynamically loaded Hermes code is Promise/.then-oriented (no async/await), with fetch/console/timers and no Node fs/path/crypto. **This test engine is QuickJS/WASM, not Hermes.** Guest Promise and console are present; fetch remains the documented brokered subset; timers remain unavailable, and no actual timer access surfaced before the measured header/import boundaries. No fake timer/parser or speculative host-object copies were added and full upstream host-surface parity is not claimed.

**Required playback headers are a delivery-rung consequence, not a claim of adapter completeness.** The ordinary browser video element cannot apply an arbitrary required Referer/Origin/User-Agent map; browser JS also cannot freely override forbidden headers. Preserving/refusing such unsupported rows is correct for the direct-video rung. Dropping headers and declaring the URL playable would be wrong. A provider needing them must be labelled as requiring an authorized header-capable proxy/compute/native rung rather than blamed as broken. No such rung, silent relay or charge is implemented here. [Explicitly requested #142 evidence handoff](https://github.com/saurabhhbansal/nuvioweb/issues/142#issuecomment-6309232028); no #142 implementation, status or acceptance change.

Latest source/helper regressions: **77/77** focused and **1493/1493** app tests,0 failures/skips, lint pass; the earlier73/1489 counts precede the four new strict-probe tests. Local Chromium remains16/16 because no browser/adapter change followed that run. Four diagnostic tests cover parser import distinction, raw header-presence projection without values, exact missing-global naming, and rejection of injected diagnostic secret fields. Commands additionally executed:

```sh
node app/alpha/scripts/pluginLocalScrapersProbe.mjs
node app/alpha/scripts/pluginPenguPlayProbe.mjs
node --test app/alpha/scripts/pluginSourceProbe.test.mjs
node --test app/alpha/js/core/plugins/pluginBroker.test.mjs app/alpha/scripts/pluginSandbox*.test.mjs app/alpha/scripts/pluginPrototypeSession.test.mjs app/alpha/scripts/pluginGetStreamsPrototype.test.mjs app/alpha/scripts/pluginSourceProbe.test.mjs
npm test --prefix app/alpha
npm run lint --prefix app/alpha
```

This console-only checkpoint is historical; the [compact receipt](issue11-guest-globals-2026-10-21.json) is now amended by the bounded-header replay below. Earlier [automated review](../agent-runs/2026-10-21-issue11-guest-globals-review.md) and [PR144](https://github.com/saurabhhbansal/nuvioweb/pull/144) remain prior provenance, not the review/CI proof for this slice. Parent #11 remains open; no routine permission/ToS/provenance question defers the current authorized work.

## Bounded headers / per-hop replay slice — plan before implementation

Owner-directed continuation from6baaaa6 on `m2/issue-11-header-replay`; no reviewer agents and no deployment. This section is the one amended evidence document (<=200 changed lines); compact receipt separate. Review will be an inline actual-diff pass, automated/not independent human approval. Historical observations above are not rerun facts.

**Contract/seams:** existing broker -> actual QuickJS getStreams adapter -> four unchanged digest-pinned sources. Trusted caller supplies per-provider/per-host header-name policy; guest cannot self-authorize. Global ceiling permits only noncredential User-Agent, Referer, Origin, Accept/Accept-Language/Accept-Encoding, Sec-Fetch-* metadata; cookie/authorization/proxy/host/connection/credential options always refused. Case-normalize, reject duplicate/control/oversized values, bound16 headers/8KiB, no host settings or secret injection. Pass validated options across a bounded JSON bridge, enforce policy again on the host; direct binding bypass must not evade it. Default policy remains empty.

**Redirect/address contract:** accept only follow/error/manual modes; trusted hop ceiling<=5, existing default2 and4-total-dispatch budget unchanged, so request budget may stop a chain earlier. Every redirect URL reuses exact approved HTTPS host, userinfo/port/IP/local-name checks; optional trusted resolver validates every address on every hop, including repeated hostname, and provides vetted addresses to the transport for pinning. Header-enabled calls require that resolver; no ambient DNS/fetch/new host binding. Automatic transport redirects and credentials forbidden. Replay resolver addresses are fixtures, not observed live DNS or proven socket pinning. Real streaming/connection-safe transport must exist before any live read; choose0 live reads if absent. No relaxation of250ms/16MiB/64KiB stack/output,256KiB source/body,1MiB cumulative response or cancellation.

**Replay/results:** fixed synthetic/recorded response transcript keyed to expected requests; unmatched path/method/header fails closed, no generic success stub. Public source acquisition remains fixed-origin, size/hash verified, source memory-only, never logs embedded constants or executes a live provider request. Report raw unchanged-code rows separately from adapter-normalized/required-playback-header-refused rows; sanitize fixed field names/booleans/counts and fixture-origin labels, never raw source/header values/URL queries/errors/log arguments. No parser/module/timer shim; hdhub4u may still fail before getStreams. Required playback headers remain a separate delivery-rung limitation, not stripped to manufacture playable rows. Native UI/application enablement is not inferred from test-only execution; state single actual user-visible change, or none.

**Vertical tests/verification:** header success red/green at existing broker and adapter seams; credential/unknown/CRLF/case duplicates/size/host-policy/direct-binding negatives; per-hop hostile IP/local/private-resolved/mixed address, redirect limit/loop/error/manual, aggregate bytes/request exhaustion/concurrency, timeout/cancel/late-result tests; original constructor/output/memory guards; pinned four-source replay plus strict receipt validation. Run focused suites then required app/lint/build/browser/docs checks only. Rollback protected revert; no account/operator session/other issue changes, dependency, hosted compute or charge. Issued public-source downloads cannot be undone.

**Demonstrated-chain amendment before bridge fix:** first real replay and a minimal original synthetic two-sequential-fetch test reproduce WASM `memory access out of bounds`: the second fetch suspends Asyncify from synchronous `executePendingJobs`, unlike the initial async evaluation. Add a genuine deferred-guest-Promise path over the **same broker**, used by the async fetch facade; bound/settle its handles on abort/teardown. Keep legacy synchronous API for existing fixtures, but synchronously refuse suspension from the job pump (`async-fetch-required`) rather than corrupt WASM. No new transport/host power or larger stack/time budget; add sequential/parallel/late-cancel regressions before counting real rows.

### Current measured result and inline review

**User-visible capability changed: none.** Application execution remains disabled. The real code change is the bounded engine/broker request capability plus precise `playback-headers` diagnostic; this is not app playback or provider acceptance. No separate reviewer agent or new review document; this is an automated second Standards/Spec pass over the actual staged diff against6baaaa6, not independent human approval.

Same four source bytes/digests above and in the amended [compact receipt](issue11-guest-globals-2026-10-21.json); source stays memory-only. Explicit metadata JSON, same-host302 and provider-tagged1080p/2160p stream-list fixtures; **not recorded live-provider responses**. A generic stream fixture initially produced0 because the unchanged PenguPlay filter requires its provider tag; the final fixture satisfies that real predicate, not a patched source/filter. All unmatched routes throw. Raw counts below are from a **separate diagnostic VM**, never relabeled adapter acceptance.

| Artifact | Raw diagnostic rows / header-bearing | Adapter accepted | Actual / diagnostic dispatches | Exact remaining boundary |
| --- | --- | --- | --- | --- |
| xprime |0 /0 |0 |2 /2 | Final actual adapter resolves empty; diagnostic invokes/resolves0 with `host` refusal. Earlier actual replay hit `timeout`; retain it, no stability claim. |
| hdhub4u |0 /0 |0 |0 /0 | Actual bootstrap `runtime`; diagnostic import `cheerio-without-node-native` before getStreams invocation. No fake parser. |
| vixsrc |0 /0 |0 |0 /0 | Invokes/resolves empty; `header-policy` for hop-by-hop `Connection`, deliberately not allowed/removed silently. |
| PenguPlay |2 /2 |0 |3 /3 | Unchanged source extracts rows; actual adapter returns **`playback-headers`**, not generic `plugin`, and never strips the requirement. |

**Used request names/hosts:** xprime forwards User-Agent/Accept/Accept-Language/Accept-Encoding only to `api.themoviedb.org`; PenguPlay forwards User-Agent/Accept to `api.themoviedb.org` and `pengu.uk`. Vixsrc's Connection is observed but **never forwarded**. hdhub4u sends nothing. Header values, raw source/errors, URL paths/queries and owner credentials absent from evidence. **Fired replay hop checks:** each xprime/PenguPlay adapter and diagnostic VM follows one synthetic same-host302; URL/header authorization and all-address validation repeat, totaling4 and6 fixture-address checks respectively across both VMs. Unit negatives separately exercise loopback/link-local/private/mixed/sparse answers, hostname rebinding, host/header-policy crossing and literal-IP/local-name redirects; no assertion that those were live DNS observations.

**Inline Standards findings:** two actionable policy gaps found and fixed red/green: sparse DNS answers skipped by `Array.some`, and newly explicit redirect modes accepted without a resolver/null treated as follow. Re-review now requires every returned slot to validate; newly enabled explicit modes require the resolver; null is `redirect-mode`. Header framing counts toward8KiB. Formal issue-plan pointer was amended after the plan itself had already been written here before code. No remaining actionable standards defect in this diff; duplicated tiny sync/async guest envelope code is a nonblocking maintenance risk (both cross the same host validator), not justification for wider refactoring.

**Inline Spec findings/limits:** the demonstrated second-fetch Asyncify job-pump crash required the least-power Promise bridge; reproducer first fails with native memory-access error, then passes with normal Node flags and unchanged limits. Diagnostic-only `--liftoff-only` isolated a cold WASM tiering/timer stall; no engine flag, threshold or quota relaxation adopted. Bounded ready-microtask drain avoids unnecessary timer hops, but cold timeout observations remain. New replies are capped by existing request budget, settled outside suspended frames, and abort/drain/dispose before context teardown. Direct-binding JSON/credential bypass and parallel/late-result regressions pass. No guest FS/Node module/unbrokered fetch, credential recipient, dependency, parser, account session or unrelated issue change. No copied third-party source; only hashes/URLs and original synthetic fixtures. No charges/deployment. **0 live provider reads** because no real DNS/connection-pinned, streamed-byte-capped transport exists; passing vetted fixture addresses to an injected transport is not that guarantee. Legacy headerless injected fixtures retain their explicitly unproved DNS layer. Browser Origin/Sec-Fetch restrictions and required output playback headers still need the separate authorized delivery rung; no unrestricted proxy or silent semantics loss.

```sh
# Node22.23.1/npm10.9.8 on Linux ARM64; source runner acquires fixed public GitHub bytes only
node app/alpha/scripts/pluginHeaderReplayProbe.mjs
node --test app/alpha/js/core/plugins/pluginBroker.test.mjs
npm test --prefix app/alpha
npm run lint --prefix app/alpha
NUVIO_LOCAL_PROPERTIES="$PWD/tests/fixtures/build.properties" npm run build --prefix app/alpha
node scripts/check-alpha-build.mjs
npm audit --prefix app/alpha --audit-level=low
npm audit --audit-level=low
PLAYWRIGHT_BROWSERS_PATH=/home/saurabh/.cache/ms-playwright npx playwright test tests/browser/plugin-engine.spec.mjs --project=chromium
```

Results at the reviewed implementation: asserted four-source replay exit0; broker **24/24**; app **1508/1508**,0 failures/skips; lint/build/check exit0; inert12 assets; both audits0 vulnerabilities; Chromium **16/16** (6.5s), no claimed live/browser provider acceptance. Initial header tracer, guest bridge, second-call crash, generic-output diagnostic and sparse-address tracer all genuinely red before their fixes; final controls green. All temporary `[DEBUG-ISSUE11]` instrumentation removed. Focused eight-file broker/contract/session/adapter/boundary/lifecycle/probe run **76/76**. `node --test scripts/check-docs.test.mjs scripts/governance.test.mjs` **15/15**; docs/progress checks and issue7 receipt `--validate` exit0 (schema only, A8 remains unmet). Initial combined run49/50 exposed an **unchanged worktree-layout assumption** in the issue7 unit test: `.git/config` is absent because this worktree has a `.git` file, so it reports missing artifact rather than the asserted untracked-artifact code. Exact unchanged validator/tests/receipt diff against6baaaa6 is empty; isolated normal checkout of6baaaa6 runs `node --test scripts/check-issue7-acceptance.test.mjs` **35/35**. No unrelated fix or hidden pass claim. Protected exact-head/actual-merge CI remains pending until the integration update here; no parent closure.

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
| Representative supported JS plugin fixtures return normalized streams | Real third-party source now loads and invokes after console correction, but catches unsupported fetch options and returns0 rows;45 real HTTP rows and44 host projections remain separate | **Not met for actual streams from this JS wrapper or installed JS.** Public source host-surface testing is independent of installation provenance; the current blocker is fetch options, not console. Keep unchecked |
| Execution time, memory/network/output quotas enforced | **Verified for the bounded test-only guest/injected-broker seam:** focused71 and actual browser regression evidence, including real infinite loops/allocation/serialization and cancellation | Not a claim of live-download/DNS/host-allocation or persistent account/global quotas. Full product criterion remains unchecked rather than transfer test-layer success to unsupported real transport |
| No open hosted fetch proxy or worker host escape | No proxy/app deployment added; tested constructor/import/prototype escape attempts blocked; direct/redirect denied targets never reach transport | **Partial**, not universal engine-escape or live SSRF proof. Future transport streaming/DNS pinning/private-address filtering and concrete rollout review remain; keep unchecked |

**Exact next implementation step:** keep the six HTTP installations on their existing pipeline. For this independently useful pinned JS wrapper, assess the narrow `fetch(options.headers)`/`fetch(options.redirect)` compatibility contract against credential filtering and the existing broker's mandatory per-hop validation; do not ignore required headers, forward embedded credentials, auto-follow unchecked redirects or widen policy just to manufacture rows. Rerun the same digest with explicitly synthetic/replay transport after any separately reviewed safe addition. Matching an installed scraper artifact remains necessary only for an installed-JS claim, not a reason to defer nonprivileged public-wrapper host-surface fixes. Live sandbox transport separately needs bounded streamed responses, manual per-hop redirects, approved public DNS/connection pinning and abort; no hosted launch is authorized here.

## Completion / protected integration record

At **05:03:41Z**, final private-literal scanning of the changed public artifacts passed; deliberate in-memory access-token injection was rejected. The scanner initially classified a public provider name as secret because display-name maps are keyed by credential-bearing URLs; diagnosis published only digest/length/line. Excluding only the six authoritative public provider names/fixed public origins resolved this false positive, not a credential exception. Public SOURCE returned200 and still matched the unchanged pinned runtime. Exact fresh-owned-session identity checks passed; **local-only logout HTTP204**, never account-global revocation. Six exact resolved/type-checked private files were removed (fresh browser state, raw manifests/streams and public candidate source containing embedded third-party constants); credential file unchanged. No existing operator/observer session was attached or stopped. No broad account restore was attempted.

Distinct [automated Standards/Spec review](../agent-runs/2026-10-21-issue11-real-plugin-review.md) completed on f354734: each identified the same P2 pending-gate wording contradiction in the plan, corrected and independently re-read; no remaining source blocker. Reviewer Node24 targeted adapter/boundary14/14 and syntax/whitespace pass are separate from author Node22 results. Automated review is **not independent human approval**; required independent approvals are zero in this sole-maintainer repository. [PR143](https://github.com/saurabhhbansal/nuvioweb/pull/143) remains subject to all four exact-head plus actual-merge protected checks; no completed integration is claimed before they pass.

Rollback: protected revert of this narrowly scoped adapter-refusal/test/evidence unit. Pure normalizer, ordinary HTTP pipeline, deployed app and account configuration stay unchanged; already-issued remote reads cannot be undone.
