# Static-host sidecar capabilities — issue #8

As of 2026-10-19. Source: Alpha web `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff`, with original history and notices retained. [Execution plan](plans/issues/issue-8.md). This change isolates existing clients; it does not implement or deploy a backend. The public development preview continues serving reviewed `8edec42` until a separately verified refresh.

## Inventory and current behavior

Routes below are the complete three HTTP bridge dispatchers in `app/alpha/services/{trakt-auth-bridge,debrid-api-bridge,external-return-bridge}/bridge.mjs`, plus the retained native service mounted by `app/alpha/scripts/serve.mjs`. All three deployment flags default to the exact string `false`.

| Dependency / upstream routes | Browser callers | Capability / public flag | Static-host behavior | Proposed deployment, subject to separate review |
| --- | --- | --- | --- | --- |
| Trakt: GET `/api/trakt/health`; POST `/api/trakt/device/code`, `/device/token`, `/refresh` under that prefix | `TraktAuthService`, Settings and Tracking | `traktAuth` / `NUVIO_ENABLE_TRAKT_BRIDGE` | No health/code/poll/refresh call or saved-token use while disabled; persistent site-unavailable guidance; saved-connection disconnect remains available | Narrow fixed-destination auth service; client secret stays server-side; no generic URL input |
| TorBox and Premiumize: GET `/api/debrid/health`, `/api/debrid/{torbox,premiumize}/account`; POST `/api/debrid/{torbox,premiumize}/device/start`, `/device/redeem` | `DebridApi`, device auth service, provider settings | `debrid` / `NUVIO_ENABLE_DEBRID_BRIDGE` | Stable `SIDECAR_UNAVAILABLE` result before network/credential transmission; no sign-in polling dialog for an unconnected provider; saved connections can be removed | Narrow fixed-provider auth/account operations; no arbitrary path/host forwarding |
| TorBox playback: POST `/api/debrid/torbox/cache/check`, `/torrent/create`, `/torrent/lookup`, `/link/resolve` | `DebridApi`, existing debrid resolver | Same `debrid` capability | Bridge-dependent resolution fails with actionable guidance; direct compatible add-on sources remain an alternative | Fixed TorBox API operations only, subject to authorization, bounded requests, provider policies and explicit user action; no media bytes relayed |
| External player return: GET `/api/external-return/health`, `/report/<32hex>`, `/collect/<32hex>`; GET `/push/public-key`; POST `/push/bind` under that prefix | External launch/handoff collector, push-return client, Settings, Quick Setup | `externalReturn` / `NUVIO_ENABLE_EXTERNAL_RETURN_BRIDGE` | Launch retains original media URL; no relay callback, collection, push request or notification prompt; progress falls back to manual entry. Old automatic handoffs become manual when disabled | Bounded durable TTL state and single-use collection, with separately reviewed push subscription/delivery controls; do not port Node global Maps as persistent Worker state |
| Native webOS media: fixed local `/settings`, `/tracks/*` mount, loopback ports2710–2714; retained `services/webos/runtime/media-http.cjs` | No browser call site found in pinned JS; native runtime/development server only | `nativeMedia:false` (not configurable in browser) | Unsupported; no browser endpoint or processing claim added | Reviewed user-owned native agent under #12/#15; native FFmpeg/process code cannot run as an ordinary static asset or plain Worker |

The Premiumize dispatcher explicitly rejects TorBox-only playback actions. The browser does not call the debrid/external health routes today; they remain inventoried service dependencies. Existing direct RealDebrid and TorBox/Premiumize cloud requests, Simkl requests, HTTP add-ons, browser-native/HLS/DASH playback and the static YouTube iframe helper are separate paths. This gate neither changes those destinations nor proves their live authentication/CORS/playback. Nuvio identity is unchanged; Trakt is an optional integration, not a replacement Nuvio login.

## Configuration contract and migration

`getSidecarCapabilities()` exposes immutable booleans. Only an own property with the exact string `true` enables an attempt at an existing fixed route. Missing, boolean, malformed and other string values disable it. A loaded runtime configuration wins; baked build values are a fallback. Flags contain no endpoint URL, secret or account state and provide no authorization or service-health guarantee.

The build allowlist, example properties and Docker runtime script accept only these three new public values. Existing self-hosted installations must explicitly opt in after configuring and reviewing the corresponding service. For example, a reviewed Trakt deployment can set `NUVIO_ENABLE_TRAKT_BRIDGE=true` in its existing properties/runtime environment; this alone does not configure its server secret or make it safe. Native browser processing stays false.

Public Pages configuration explicitly sets all three flags false. `scripts/prepare-static-preview.mjs` refuses enabled, missing or malformed flags, alternate identity recipients and privileged configuration before staging. It does not upload anything. No redirect, Worker, proxy, database, push key or compute resource is provisioned by this PR.

Disabled clients preserve stored preferences/credentials so owners can disconnect them; they do not silently erase account data. An enabled but absent debrid route returning404/HTML or even a200 HTML app shell is unavailable, not a pending authorization. Genuine JSON401 rejection remains401. Return state requires a32-hex token, the current HTTPS origin without userinfo/path/query/hash, matching profile and expiry within the six-hour handoff window. Invalid state cannot initiate collection. A public capability flag is never a security boundary for a future server.

## Requirements before any service deployment

These are design constraints, not implemented server safeguards or permission to deploy. Each service needs a scoped plan, threat model, bounded cost estimate and human review.

- Expose only listed operation/method pairs, authenticated where required. Validate exact provider hosts/paths, credentials and response shapes; deny redirects and arbitrary URL/CORS forwarding. Revalidate network destinations if any future input permits URLs. Restrict headers, request/response sizes, timeouts, concurrency, rate and retention; no generic HTTP proxy or video relay.
- Keep Nuvio access/refresh tokens and provider secrets out of logs, client build configuration, plugins and processors. Separate Trakt server credentials from Nuvio identity; use minimal storage and redacted failures. Validate authorization rather than trusting a deployment flag or localStorage.
- External-return token issuance, binding and collection need owner/profile authorization, expiry, replay controls and bounded durable storage. The retained Node implementation's global Maps are not production durability. Push endpoints introduce outbound delivery/SSRF concerns and need allowlists, subscription verification, quotas and separate review before activation.
- Native media recovery belongs to the compute roadmap with pairing, grants, revocation, isolation and explicit user/cost consent. No hosted processing or paid service is enabled here.

No unrestricted proxy is published: the changes contain client guards/configuration and static UI only. Original service source remains for provenance and future review; retained source is not evidence that it is suitable for public deployment.

## Verification and limits

Reproduction uses pinned Node22.23.1/npm10.9.8, Playwright1.64.0 and local Chromium156.0.8078.4 on Linux ARM64. Build the inert fixture before testing:

```sh
export PATH=/home/saurabh/.local/share/mise/installs/node/22.23.1/bin:$PATH
NUVIO_LOCAL_PROPERTIES="$PWD/tests/fixtures/build.properties" npm run build --prefix app/alpha
node scripts/check-alpha-build.mjs
npm test --prefix app/alpha
npm run lint --prefix app/alpha
npx playwright test
node --test scripts/prepare-static-preview.test.mjs
```

The browser tests block third-party traffic, click through the bundled guest Settings and assert visible guidance at1280px and390px without overflowing its text box. They exercise actual imported API/launch/push boundaries with synthetic state and zero disabled-sidecar requests. This is Chromium viewport evidence, not a physical iPhone/Safari or external-player interoperability test. No live account, provider token, notification delivery, public sidecar deployment or browser-MVP claim follows. Exact executed results, initial failures and corrections are in the linked plan.

The inherited Settings action handler only redrew on the index route. Its minimal route check now also redraws `settingsSection`; real browser clicks verify the expanded guidance and progress options. Existing configured-deployment tests explicitly enable the relevant flag and retain their original assertions.

Rollback through a protected revert of the scoped client/configuration/docs PR. Preserve upstream ancestry/notices and stored account data; keep the prior reviewed preview until a verified refresh. No service, migration, charge or infrastructure must be undone.
