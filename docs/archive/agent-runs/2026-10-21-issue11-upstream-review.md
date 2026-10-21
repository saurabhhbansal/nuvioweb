# Issue #11 — pinned upstream API and licensing review

2026-10-21 UTC. **Research only; not a compatibility, security or release pass.** Read [agent rules](../../AGENTS.md), the [#11 plan](../plans/issues/issue-11.md), [security policy](../SECURITY_PRIVACY.md) and [license audit](../UPSTREAM_LICENSE_AUDIT.md). No source, dependency, settings or other issue state changed. No private identity/runtime files, account/session, provider/media endpoints, running application or observers were accessed.

## Evidence and acquisition

Independently inspected GYK at **`ff5eb4565d723afac2b5493f286b6a33c8abb5f0`**, not a moving branch tip. GitHub's public [recursive tree API](https://api.github.com/repos/GYK-Studio/NuvioWeb/git/trees/ff5eb4565d723afac2b5493f286b6a33c8abb5f0?recursive=1) returned `truncated:false`. Python `urllib.request` fetched eight selected files through `/repos/GYK-Studio/NuvioWeb/contents/<path>?ref=<pin>`, decoded base64 into temporary review files, and exited **0**. No clone, package install, plugin execution, browser journey, build or application test ran. Local source/notices were read with file tools.

Primary pinned sources (line references below refer to this revision):

| ID | Source | Verified blob |
| --- | --- | --- |
| U1 | [Runtime](https://github.com/GYK-Studio/NuvioWeb/blob/ff5eb4565d723afac2b5493f286b6a33c8abb5f0/js/core/player/pluginRuntime.js) | `b53897488716fd01d00e55f14af345cd6ee57d1d` |
| U2 | [Worker](https://github.com/GYK-Studio/NuvioWeb/blob/ff5eb4565d723afac2b5493f286b6a33c8abb5f0/js/core/player/pluginWorker.js) | `ac9245a61567f596f3c9cfa5e5cf48c6f365884e` |
| U3 | [Browser network client](https://github.com/GYK-Studio/NuvioWeb/blob/ff5eb4565d723afac2b5493f286b6a33c8abb5f0/js/platform/pluginServiceClient.js) | `8289c3f5aad470185cfe334189d245406fe7d216` |
| U4 | [Request validation](https://github.com/GYK-Studio/NuvioWeb/blob/ff5eb4565d723afac2b5493f286b6a33c8abb5f0/js/core/player/pluginSecurity.js) | `885b56fad119fe830e9115cc436277bbf5d8984a` |
| U5 | [Quota policy](https://github.com/GYK-Studio/NuvioWeb/blob/ff5eb4565d723afac2b5493f286b6a33c8abb5f0/js/core/player/pluginPolicy.js) | `bea53475f3310f5a0a7cf1a9ee920190fb7e1874` |
| U6 | [Manifest models](https://github.com/GYK-Studio/NuvioWeb/blob/ff5eb4565d723afac2b5493f286b6a33c8abb5f0/js/core/player/pluginModels.js) | `c5ceea1c7e1fe49ea45288ba7946e2f98609eef3` |
| U7 | [Manager/result mapping](https://github.com/GYK-Studio/NuvioWeb/blob/ff5eb4565d723afac2b5493f286b6a33c8abb5f0/js/core/player/pluginManager.js) | `79fd52bb124a98243595c3d751342322712f0d2c` |

The native HTTP helper was also fetched, but is **not** treated as proof of the browser client's or optional server proxy's security. No complete server/proxy audit was performed.

## Actual upstream contract versus baseline prototype

The table compares baseline `79ccee7`, before the separate narrow getStreams adapter. The continuation adds original upstream-shaped regression tests only; it does not establish unmodified installed-plugin support or broaden the request/module/credential policy.

| Surface | Pinned GYK API | Current prototype / consequence |
| --- | --- | --- |
| Manifest | Repository `{name,version,scrapers:[...]}`; scraper requires `{id,name,version,filename}`, defaults `supportedTypes` to `['movie','tv']`, resolves code relative to manifest URL. No required `allowedHosts`. U6:326–411. | Our [descriptor](../../app/alpha/js/core/plugins/pluginContract.js#L139-L178) `{id,name,version,apiVersion:1,code,allowedHosts}` is **our policy envelope**, not upstream's manifest/API version. |
| Entry point | CommonJS-style `module`/`exports`; `module.exports.getStreams`, fallback global `getStreams`, called with positional `(tmdbId:string,mediaType:string,season:number|null,episode:number|null)`. Missing function/non-array result becomes `[]`; invocation exceptions become logged empty results, unlike bootstrap/module errors. U1:33–39; U2:750–835. | Our [prototype](../../app/alpha/scripts/pluginSandboxNetworkPrototype.mjs#L114-L122) calls `resolve(api,input).then(...)`. Unmodified upstream plugins are **not supported** by that entry point. |
| Results | Flat scraper-result array. Manager accepts `url` string or `{url:string}` and maps title/name, quality, size/language, infoHash, string headers and subtitles; headers become playback `behaviorHints.proxyHeaders.request`. U7:297–434,1195–1201. | Our [normalizer](../../app/alpha/js/core/plugins/pluginContract.js#L60-L137) expects grouped `[{sourceId,sourceName,streams:[...]}]`, string HTTP(S) URLs without userinfo, and only name/title/description/quality/url. Flat output disappears; headers/subtitles/infoHash are lost. |
| Network | Global `fetch(url,{method,headers,body,signal})` resolves `{ok,status,statusText,url,headers.get,text(),json()}`. Empty/invalid JSON resolves `null`; transport failures use status `0` in Android-response mode. U2:298–340; U3:177–202. | Our [binding](../../app/alpha/scripts/pluginSandboxNetworkPrototype.mjs#L85-L107) is `api.fetch(url)` returning broker `{ok,status,body,url,hops}` or throwing `plugin-network:<code>`. No fetch options, Response methods or equivalent status-0 contract. |
| Modules/globals | Allowlisted `require`: `cheerio`, `cheerio-without-node-native`, `react-native-cheerio`, `crypto-js`. Guest has cheerio/CryptoJS, SCRAPER_ID, SCRAPER_SETTINGS, TMDB_API_KEY, console, AbortController/Signal, URL/URLSearchParams, atob/btoa, global/window/self aliases; guest eval/Function remain. U2:236–487,725–742. | Our prototype supplies api.log, JSON input and the broker, not these APIs. Do not copy key/settings injection or expose browser/Node globals wholesale. Upstream Cheerio is partial: wrapper `parent()` is empty, `children()` uses descendant find (U2:398–436), not full DOM/library parity. |
| Async host bridge | **Regular synchronous QuickJS plus deferred guest promises**, worker fetch/fetchResult messages, resolve/reject and pending-job pumping. U2:490–543,625–650,703–719. | We use newAsyncContext/newAsyncifiedFunction. **Asyncify is not required by upstream fetch.** Our [sync-cannot-await statement](../PLUGIN_COMPATIBILITY.md#L106-L108) is too broad: it describes our current binding, not every viable bridge. Revisit separately; no engine/build change here. |

## Security constraints and exact limits

**Do not copy upstream network policy as our approval baseline.** U4 accepts HTTP(S), coerces methods to GET/POST/PUT/DELETE, forwards headers except Accept-Encoding, supplies User-Agent/default POST/PUT content types and bounds request body length. It has no destination allowlist, userinfo/IP/private-address denial or per-hop redirect authorization. U3 uses ordinary browser fetch (CORS/forbidden-header restrictions still apply), or POSTs to `/api/providers/fetch` under its explicit proxy flag; it does not specify credential omission/manual redirects. Direct responses check Content-Length then fully read text before checking bytes again; the proxy-return branch lacks that same local body check (U3:73–129). This does **not** establish that the unreviewed proxy is unrestricted or safe.

Upstream lifecycle includes deadline, AbortSignal, cancellation and Worker termination (U1:165–207,238–277). U5 declares concurrency 10, code/manifest 5 MiB, fetch 1 MiB, 150 results, 60 s/provider, 120 s/global, 8 documents, 10,000 DOM handles and 64 MiB guest memory. Worker memory/interrupt limits and result slicing are visible; its fetch counter generates IDs, **not a request-count quota**. Static inspection does not certify every declared cap, host/parser memory, log volume or escape resistance.

Keep our [broker's](../../app/alpha/js/core/plugins/pluginBroker.js) narrower HTTPS/exact-authorized-host/default-port/GET-only policy, no supplied headers/body/credentials, bounded requests/bytes/redirects and no automatic hosted proxy fallback. A plugin declaring a hostname is not sufficient trusted authorization. POST/auth/header/private-network/media-relay requirements remain unsupported, not reasons to weaken policy. [Security policy](../SECURITY_PRIVACY.md#L13-L27) additionally requires:

- **Actual transport controls:** forced credential omission, no unchecked automatic redirects, streaming decoded-body/aggregate-egress limits, abort propagation, late-callback suppression and concurrency/repeated-failure bounds. Browser CORS/opaque redirects may leave an authorized provider unsupported.
- **Any server/user-owned transport:** DNS resolution/re-resolution, private/link-local/metadata-address filtering and connection pinning, authenticated account/job ownership, expiry and per-user/global quotas. Hostname syntax alone does not stop private resolution/rebinding. No open proxy or new credential recipient.
- **Isolation:** Worker provides lifecycle/termination, not the sole untrusted-code boundary. QuickJS/WASM and marshalled bindings remain separate from browser/Worker APIs; guest memory does not bound host strings, JSON copies or a future HTML parser.

**Baseline observation, before the separate continuation fixes:** at `79ccee7`, request counting incremented once per logical request, not per redirect-hop dispatch: four logical calls could each dispatch three hops. Response bytes were checked after injected transport materialized the body. The deadline race stopped waiting without propagating AbortSignal. The [continuation evidence](../evidence/issue11-bounded-lifecycle-2026-10-21.md) separately records corrections/tests for dispatch counting and cancellation; this research pass did not execute them. Post-materialization limits, live egress/streaming-body, DNS, hosted-cost and host-escape guarantees remain unestablished.

## Licensing: directly read installed notices

The [existing audit](../UPSTREAM_LICENSE_AUDIT.md#L67-L81) records GYK's root GPL v3 text without establishing a project-wide `-or-later` grant; see pinned [LICENSE](https://github.com/GYK-Studio/NuvioWeb/blob/ff5eb4565d723afac2b5493f286b6a33c8abb5f0/LICENSE). Selective reuse needs compatible terms, notices/history/credits and matching-source obligations. **No source imported here.** Engine licensing grants no rights to arbitrary plugins, backend capacity, trademarks or media.

Installed wrapper/core/release-asyncify manifests identify **0.32.0, MIT**. Directly read all seven installed QuickJS LICENSE files:

```text
app/alpha/node_modules/quickjs-emscripten/LICENSE
app/alpha/node_modules/quickjs-emscripten-core/LICENSE
app/alpha/node_modules/@jitl/quickjs-ffi-types/LICENSE
app/alpha/node_modules/@jitl/quickjs-wasmfile-release-asyncify/LICENSE
app/alpha/node_modules/@jitl/quickjs-wasmfile-release-sync/LICENSE
app/alpha/node_modules/@jitl/quickjs-wasmfile-debug-asyncify/LICENSE
app/alpha/node_modules/@jitl/quickjs-wasmfile-debug-sync/LICENSE
```

Wrapper/core/FFI notices name **Jake Teton-Landis, 2019–2024**. Each WASM variant also includes **QuickJS: Fabrice Bellard and Charlie Gordon, 2017–2021**, with full MIT terms/disclaimer. Redistributed JS/WASM must retain both wrapper and embedded-engine notices, not just `license:'MIT'`. Durable package references: [wrapper metadata](https://registry.npmjs.org/quickjs-emscripten/0.32.0), [core metadata](https://registry.npmjs.org/quickjs-emscripten-core/0.32.0), [release-asyncify metadata](https://registry.npmjs.org/@jitl/quickjs-wasmfile-release-asyncify/0.32.0). This session did not revalidate registry integrity, binary/source correspondence, generated artifact notice completeness, future Cheerio/CryptoJS transitive notices or vulnerabilities. Engineering evidence, not legal clearance.

## Real fixture availability and bounded product decisions

**No lawful real installed JS-plugin fixture is established by available authorized evidence.** The public [provider report:7–13](../evidence/issue10-real-provider-2026-10-20.md#L7-L13) records six configured providers and **zero custom template/plugin sources**. Normal add-on/provider responses are not a pinned, licensed CommonJS scraper or JS runtime proof. This is an evidence gap, not a fresh private-account/filesystem inventory. No private cache/state was read and no community plugin/media was downloaded to manufacture a fixture.

Our [representative fixture](../../tests/fixtures/plugins/representative-plugin.js#L1-L29) is explicitly original self-contained `resolve(api,input)` test code: useful synthetic regression, **not** installed third-party/upstream parity evidence. GYK's tiny self-test (`module.exports.getStreams = function(){return [];}`; U1:85–101) likewise tests only bootstrap.

Bounded disposition for the issue owner:

1. Keep execution unshipped/default-off and acceptance unclaimed. Name resolve/api.fetch an **internal synthetic prototype**, not Nuvio API-v1 compatibility.
2. Specify a narrow getStreams/flat-results/global-response-like-fetch adapter over our broker before implementation. Unsupported headers, POST/auth, subtitles and mapped URL forms must be explicit; never silently manufacture apparently playable streams.
3. Compare sync deferred promises with current Asyncify using teardown/cancellation/parallel-request tests and new measurements. Static evidence authorizes neither a dependency swap nor a bundle-saving claim.
4. Original upstream-shaped fixtures could test the contract, but real acceptance still needs authorized source availability, pinned digest/provenance, plugin-specific license/redistribution rights, declared destinations/settings and lawful media-fixture permission. None is supplied by the installed-provider evidence.
5. No real-plugin compatibility, live transport quotas, browser/device interoperability, security clearance or issue closure follows. Historical tests were **not rerun** or relabelled. No runtime/deployment/observer interaction occurred.

Rollback: remove this research note through the protected documentation workflow; no runtime/data change exists to undo.
