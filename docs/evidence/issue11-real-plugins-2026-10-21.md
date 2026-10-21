# Issue #11 — bounded provider-boundary follow-up

**PARTIAL; #11 remains OPEN. User-visible app capability changed: none.** Application execution remains disabled. Real engine/broker changes below improve extraction, not actual browser playback. [Plan before code](../plans/issues/issue-11.md#provider-boundary-follow-up--plan-before-code-after-pr145) · [compact receipt](issue11-guest-globals-2026-10-21.json).

## Scope and retained history

Only #11, base c4713a3, branch `m2/issue-11-provider-boundaries`. No deployment, account/operator-session changes, live provider/media reads, charges, parser shim, larger quotas or reviewer agents. This is the ONE current evidence document, <=200 total lines, plus the amended existing compact JSON receipt. Prior detailed observations remain in [PR145's version](https://github.com/saurabhhbansal/nuvioweb/blob/c4713a3b942a9d66055ba234e3551a439913d7d9/docs/evidence/issue11-real-plugins-2026-10-21.md), not copied into new evidence files.

PR145 merged c4713a3 after protected exact-head gates; actual-merge four workflows also pass. Its retained failures include the demonstrated second-fetch Asyncify native crash (fixed bounded Promise bridge), sparse/noncanonical IPv4 and explicit/null redirect gaps (fixed red/green), cold xprime timeout, and WebKit DASH0x0 failure followed by identical green retry. No threshold changes. Earlier configured six HTTP add-ons/45 real HTTP rows are a distinct historical layer, not JS scraper execution or playback. The pure normalizer's44 projected rows were not lossless required-header support. Current acquisition/analysis is memory-only and exports bounded metadata, not raw source/values or embedded third-party constants; no owner credentials are injected.

## Bounded headers / per-hop replay slice — plan before implementation

The formal follow-up plan was recorded before this slice's source changes. User-directed public seams: broker request -> actual QuickJS getStreams adapter -> four unchanged digest-pinned sources; trusted provider registration is outside the guest. Negative tests cover credentials, Connection nominations, malformed/duplicate/oversized discarded fields, declaration identity/SSRF/redirects, quotas and cancellation. Rollback: protected revert; app stays disabled. Issued public GitHub source acquisitions cannot be undone.

### 1. vixsrc: normalize transport metadata, do not reject the request

Well-formed Connection, Keep-Alive, Transfer-Encoding, Upgrade, TE, Trailer and Proxy-* are discarded. Connection-nominated fields are also discarded. **Cookie, Authorization and Proxy-Authorization remain refused even when nominated**; no credential laundering. All original fields still count toward16 headers,1KiB/value,8KiB framed total and12KiB bridge JSON, and are checked for token syntax, duplicates/controls before removal. Remaining end-to-end names still need the trusted host-specific policy. The resolver is mandatory even when every supplied field was discarded. The actual guest bridge/redirect tracer checks only Accept reaches each transport hop.

The first normalization tracer genuinely failed because the old broker rejected Connection; green after normalization. A second tracer exposed the normalized-hop-only request falling back to legacy no-resolver transport; fixed to return `dns-policy`. Malformed/control/credential negatives dispatch0.

An explicit original synthetic player-page fixture now reaches unchanged vixsrc's real extraction branch: **1 raw returned row, with required playback headers**. No playlist/media download. Optional subtitle lookup to `sub.wyzie.ru` remains `host`-refused under existing vixsrc policy; this does not suppress its main row. Adapter accepts0/`playback-headers`, preserving rather than stripping delivery requirements.

### 2. xprime: approve declared destinations once at trusted registration

`createProviderDestinationApproval` snapshots reviewed provider-owned destination declarations, binds them to provider id and a freshly computed source SHA256, and produces exact approved hosts without a per-run owner prompt. The caller cannot assert a fake source hash. Changed source/provider, duplicate/sparse/oversized declarations, HTTP/userinfo/query/fragment/nondefault ports/wildcards/IP/local destinations fail closed. Mutating the input record or returned array cannot widen later approvals. This is not guest self-approval or discovery from arbitrary URL attempts/redirects.

The fixed xprime source itself declares TMDB (line6), fallback `xprime.tv` (278), the same-owner `phisher98/TVVVV` domain-catalog fetch on `raw.githubusercontent.com` (328), and `enc-dec.app` endpoints (379/408). Its reviewed source declarations—not a fabricated scraper-manifest entry—are the authority recorded by the registration policy. Approved hosts: `api.themoviedb.org`, `xprime.tv`, `raw.githubusercontent.com`, `enc-dec.app`. The pinned scraper manifest does not declare xprime; no contrary claim is made. Each URL/header/public-address check still executes on every hop; hosts grant neither credentials nor verbs/body support. Dynamic catalog responses cannot approve additional hosts.

Separate fixed-origin public declaration inspection: `phisher98/TVVVV` revision a1443831034b96485fa1141b13c7ce93a158f3c8, domains.json1762B/SHA256 `08d1ff67e2a244e8e54e1c9313fa407892bc056341462d2649e1caa5bcf33c7b` has **no xprime field**. The replay deliberately exercises source fallback with an explicit empty catalog. Neither current-main catalog contents nor new domains become runtime authority.

Replayed xprime now passes the former host gate and reaches metadata, catalog and declared service GETs. The service reply contains a **synthetic placeholder, not a real challenge token**; no live challenge/service request or circumvention is performed. It returns0 rows, catching a missing guest **URLSearchParams** error. A bounded enum-only diagnostic now recognizes fixed missing-API suffixes in private prefixed logs (red/green canary test); no raw log/message is exported. No speculative URLSearchParams/timer/POST/module shim is added. With the retained metadata302 fixture it uses all4 dispatches; removing the API gap alone is not proof its later paths fit this budget.

### 3. hdhub4u: explicitly unsupported dependency, no silent shim

Exact pinned source imports **`require("cheerio-without-node-native")` at line4**, not generic cheerio. Trusted in-memory AST inspection and the throw-only guest import observer agree. Used parser operations include load, selector invocation, find, attr, each, map, next and text. Actual adapter bootstrap returns `runtime`; diagnostic names the unsupported import before getStreams; raw rows **not produced (receipt count0)** and adapter accepted0.

**Decision: record unsupported; do not provide a parser in this slice.** The guest has neither a sanctioned CommonJS module resolver nor a reviewed guest-only bundle implementing this selector/traversal surface. Installing a host package would not make it available inside QuickJS and copying host DOM/require objects would cross the isolation boundary. A tiny regex/empty-object shim would misrepresent parsing semantics. Genuine future support needs an exact licensed pure-JS bundle/dependency graph, explicit guest module binding, heap/stack/output/deadline and malformed-HTML/selector/constructor negatives under existing ceilings. This is a precise missing implementation, not a routine owner permission/license deferral. No dependency installed or source redistributed.

### 4. PenguPlay: design only — same-origin header-capable delivery

**Current refusal unchanged:**2 raw synthetic rows, both requiring playback headers; adapter0/`playback-headers`. The owner decision whether to build this delivery rung is separate. **No proxy, route, service, listener, CSP relaxation or deployment is built here.**

A same-origin server endpoint could add sanctioned metadata headers upstream, then stream exact original bytes to the browser. It requires a server/runtime behind the static origin; a browser service worker cannot override forbidden upstream request headers. Synthetic rows do not establish real media host approval, codec support or playback.

- **API/authorization:** opaque short-lived media capability, bound to user/session/profile/provider/source digest and approved stored stream; never `/proxy?url=...` or client-supplied arbitrary destination/header maps. Server-side signed URL storage, expiry/revocation and profile isolation; same-origin caller checks/CSRF defense. Keep application cookies/tokens on the app side, never upstream. Response `Cache-Control: private, no-store`, no shared CDN caching of personalized media or capability responses.
- **Destination safety:** exact registered provider/media/CDN HTTPS host allowlist, no wildcard/row-self-approval; reject userinfo/nondefault ports/IP literals/local/special addresses. Re-resolve all addresses and pin the actual connection on each hop; prevent rebinding/alternate address syntax and ambient proxy env bypass. Manual redirects, <=5 ceiling, reauthorize every URL/header, no cross-host header forwarding unless its policy permits. Provider-declared host approval does not by itself authorize every CDN in an untrusted playlist.
- **Headers:** server applies only validated noncredential per-provider/per-host metadata values; no Authorization, Cookie, Proxy-Authorization, owner/Nuvio tokens, Host override or client hop-by-hop fields. Strip response Set-Cookie, credential challenges and hop-by-hop metadata. Validate Origin/Referer against intended provider policy; never relay secrets via a query or diagnostic. Preserve necessary Content-Type/Content-Encoding coherently; disable implicit decompression/transcoding so byte ranges match the original representation.
- **Byte/range semantics:** GET/HEAD only; validate one bounded Range and If-Range, pass206/416, Content-Range, Content-Length, Accept-Ranges and scoped validators correctly. No whole-file buffering or multipart amplification. Backpressure, client-disconnect abort and independent hard request/concurrency/redirect/elapsed/idle/streamed-byte/account budgets; count every body/hop/segment and enforce actual bytes even without Content-Length. Playback needs explicit larger media-specific caps, **not a relaxation of scraper metadata limits**.
- **Adaptive media:** HLS/DASH manifests, segments, keys, audio/subtitles and redirects need the same session-bound capabilities and destination checks; relative URL rewriting is a separate bounded parser task, not unrestricted nesting. No DRM/access-control bypass. Same-origin headers alone do not solve codecs/MKV/container support or make a source playable.
- **Privacy/cost:** never log signed upstream URLs, queries, fragments, required-header values, capability tokens or raw exceptions in app, reverse-proxy, CDN, tracing or analytics layers; disable sensitive access logging before testing. Only fixed codes/counts/opaque redacted ids; short retention/in-memory URL expiry. Same-origin media relay has bandwidth/egress/concurrency costs: prefer authorized user-owned compute; hosted build/launch requires the owner decision, explicit price/budget/hard caps and a kill switch. No operator relay implied by this note.
- **Acceptance before enablement:** legal owned-media byte/range hash equality, real206/416/HEAD/seek/cancel; denied/mixed/rebinding/redirect targets0 connects, credential/cross-profile/expiry negatives; signed-URL/log-canary scans; browser frames/seek/quality on actual target engines/devices. Not inferred from header injection or synthetic metadata rows.

## Same four immutable artifacts and measured outcome

All source is acquired from fixed public GitHub origin with256KiB/20s acquisition bounds, UTF-8/byte/SHA validation, two downloads at most in parallel; guest VMs sequential. **0 live provider reads** because no DNS/socket-pinned streamed-limit live transport exists. All route bodies are original synthetic fixtures, not recorded live responses. No raw source/header values/query URLs exported, no owner credentials injected. Digests and full pins are in the executable replay and compact receipt.

| Scraper / immutable source | Bytes / SHA256 | Raw rows / header-bearing | Adapter accepted | Exact remaining refusal |
| --- | --- | --- | --- | --- |
| vixsrc @ Tapframe6f88d1c6 |12214 / f3a4107c2a43d3e239b571a0068ba053c457872fef7b76cff3f94affa4005a6c |1 /1 |0 | `playback-headers`; optional subtitle host also refused |
| xprime @ same pin |36936 /279882bcb321cde7e57722251ae2b96fda8e9549b0cb17e78cc8d44866e1e150 |0 /0 |0 | Guest URLSearchParams missing/caught; adapter resolves empty, no host refusal |
| hdhub4u @ same pin |59747 /eb859d79ac773aabe62c720c6890cd32e17669995675ff34c16ae0db7cf70256 |not produced /0 |0 | Unsupported cheerio-without-node-native before invocation (`runtime`) |
| PenguPlay @58c3708a |13046 /08fc26eaf2d375b86549de848bea0a289cae12c64c689f33c452e005c5dc28b0 |2 /2 |0 | `playback-headers`, intentionally unchanged |

Raw counts are from a **separate diagnostic VM**, never relabelled adapter acceptance. vixsrc page has one master URL; PenguPlay stream-list has two explicit provider-tagged fixtures. All unmatched routes fail; accepted-row0 assertions prevent synthetic success from hiding unsupported semantics. Dispatches per adapter/diagnostic: vixsrc3/3, xprime4/4, hdhub4u0/0, PenguPlay3/3. Each nonzero pair includes one metadata302 per VM and repeated per-hop public fixture-address checks; these are not live DNS observations. No playlist/media bytes played.

Unchanged guest limits:250ms after startup,16MiB heap,64KiB stack/output,256KiB source, retained logs0. Broker4 total dispatches,256KiB/body,1MiB aggregate,2 redirects by default, hard hop ceiling5; cancellation/late-result handling unchanged. Metadata header count/value/framed-total and request JSON limits unchanged. Guest URLSearchParams, timers, Node globals and parser modules remain unavailable.

## Exact verification commands and current results

Node22.23.1/npm10.9.8, Linux ARM64; ordinary engine flags. Red normalization0/1, hop-only resolver0/1 and prefixed-error0/1 results retained above. Focused broker/declaration/adapter/probe **50/50** pass after corrections; four-source replay exact counts/refusals asserts exit0. Full focused nine-file suite **82/82**; full app **1514/1514**,0 failures/skips; lint exit0; inert build/check12 assets with no engine enablement; both audits0 vulnerabilities. Local actual bundled Chromium fixture **16/16** (6.5s), synthetic transport only. Docs/governance **15/15**, links/progress/schema/whitespace checks exit0; issue7 schema validation still has A8 unmet, not closure. Evidence91/200 lines before this completion update. Protected integration checks remain pending PR, not inferred from local/preceding-PR passes.

```sh
node --test app/alpha/js/core/plugins/pluginBroker.test.mjs app/alpha/scripts/pluginProviderDestinations.test.mjs app/alpha/scripts/pluginGetStreamsPrototype.test.mjs app/alpha/scripts/pluginSourceProbe.test.mjs
node app/alpha/scripts/pluginHeaderReplayProbe.mjs
NUVIO_LOCAL_PROPERTIES="$PWD/tests/fixtures/build.properties" npm run build --prefix app/alpha
node scripts/check-alpha-build.mjs
npm test --prefix app/alpha
npm run lint --prefix app/alpha
npm audit --prefix app/alpha --audit-level=low
npm audit --audit-level=low
PLAYWRIGHT_BROWSERS_PATH=/home/saurabh/.cache/ms-playwright npx playwright test tests/browser/plugin-engine.spec.mjs --project=chromium
node --test scripts/check-docs.test.mjs scripts/governance.test.mjs
node scripts/check-docs.mjs
node scripts/check-progress.mjs
node scripts/check-issue7-acceptance.mjs docs/evidence/issue7-acceptance.json --validate
node scripts/check-commit-references.mjs c4713a3 HEAD
```

## Inline actual-diff review and integration

Distinct inline automated **Standards** pass over the actual diff against c4713a3: no remaining actionable code defect; corrected prose to say nondefault ports (default443 canonicalizes empty). Dense compact test fixtures are a maintenance judgement, not a blocker. All changed/new code and declaration tests inspected, no reviewer agent/file and not independent human approval. **Spec** pass: hop fields normalize without credential/budget bypass; source-bound reviewed declarations approve without prompts but cannot authorize runtime redirects/catalog mutations; hdhub4u unsupported dependency is explicit; PenguPlay refusal intact and delivery design only. Missing URLSearchParams and optional subtitle destination are newly exposed limits, not falsely reported fixed; no parser/media/codec success claim. **Security/privacy/cost/regression:** credential/Connection canaries, changed-source spoofing, wildcard/IP/local/userinfo/delayed/redirect/private-address and existing quota/cancellation negatives pass; no new guest API, credential recipient, dependency, raw source/query/value/log export, charge, service or deploy. Static registry grants only the requested exact source-declared hosts; it is not automatic trust of arbitrary manifests or redirects. Parent acceptance remains unchecked; no real-provider lookup/browser playback, actual Hermes, live streamed/DNS/socket safety, global quotas or general engine-escape proof. Required exact-head and actual-merge four-context CI must pass before reporting protected integration complete; no bypass/force/admin merge. Rollback: protected revert, app stays disabled.
