# Static preview preparation — issue #6

The owner authorized a public preview on 2026-10-18 and supplied the [official Nuvio API docs](https://nuvio.tv/docs). **Public development preview is now verified at https://nuvioweb-preview.pages.dev; see the final deployment evidence below.** The following preparation checkpoints are historical. Existing Cloudflare OAuth access is expired and cannot refresh noninteractively; `wrangler whoami` exited 1. Reconnect with `npx wrangler login` locally; never paste account credentials or API tokens into issues/chat.

## Configuration and deployment contract

[Build properties](../deploy/cloudflare/build.properties) contain only the documented primary API URL and publishable key, not a service-role key or user session. The alternate auth host is empty. This changes deployment configuration, not Alpha's login/session implementation. [Identity-contract draft PR #34](https://github.com/saurabhhbansal/nuvioweb/pull/34) retains a human security checkpoint and technical uncertainties for unlisted endpoints. Documented public-client development needs no further blanket permission letter.

Build from a clean committed branch with Node 22.23.1/npm 10.9.8:

```sh
cd app/alpha
HUSKY=0 npm ci
NUVIO_LOCAL_PROPERTIES=../../deploy/cloudflare/build.properties npm run build
cd ../..
npm run preview:stage
```

The staging command requires the pinned Node version and rebuilds from the clean current source with checked-in public config before copying; an ignored stale dist cannot inherit a newer source revision. It refuses uncommitted source, undocumented primary/key configuration, alternate credential destination, unexpected config fields, symlinks and selected server/private artifacts. It creates a fresh ignored `dist/preview/<commit>` without overlaying old files. It copies only browser dist plus checked-in host rules, GPL/provenance/source access, eleven component notice files and a SHA-256 file inventory. Publish that exact commit before uploading. This is a bounded artifact check, not an arbitrary secret scanner or full bundled-source legal clearance.

After account access returns, use existing Wrangler 4.129.0 to inspect available accounts/projects first. Select a dedicated free static preview, not another production site. Upload the staged directory using `wrangler pages deploy <staged-directory> --project-name <verified-preview-project> --branch preview`. No Functions, Workers compute, paid bindings, custom domain or billing-plan changes are included. Record the actual provider response, URL, source revision and deployed browser/header observations before marking #6 complete.

## Cache, routing and worker verification

[Host headers](../deploy/cloudflare/_headers) revalidate unversioned assets and mark runtime config/worker no-store; no-referrer, nosniff, frame denial and noindex are explicit. A [custom 404](../deploy/cloudflare/404.html) and [navigation aliases](../deploy/cloudflare/_redirects) prevent unknown API/JS requests becoming successful SPA HTML. These follow Cloudflare's [headers](https://developers.cloudflare.com/pages/configuration/headers/) and [serving](https://developers.cloudflare.com/pages/configuration/serving-pages/) contracts; deployed behavior was subsequently verified in the final evidence below.

Local fixture reproduction uses the inert build, not public-account traffic:

```sh
cd app/alpha
NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build
cd ../..
npm run test:preview
npm run test:browser
```

Observed on Chromium headless 156.0.8078.4 / Playwright 1.64.0:

- Existing four shell/validation/error/guest-navigation journeys passed unchanged.
- Two new PWA/host journeys passed: real worker registration/activation, initial shell in CacheStorage, old shell retained before update, network-first updated runtime config, real worker update/activation, old-cache deletion, new bundle bytes on reload; host header policy, known-route reload and missing asset/API failures.
- Initial combined run: 6/6 passed, no skips, 38.4 seconds. After explicit 404/navigation-alias policy was added, focused PWA rerun: 2/2 passed, no skips, 19.0 seconds.
- Public-config rejection test passed: missing config, nonpublishable key, unexpected primary host, alternate credential destination and private config field are rejected before staging.

The loopback test server models checked-in host rules. Its guarded build-revision endpoint changes worker/cache ID and app/config markers to simulate two builds without editing application source. No worker/cache API is mocked. Upstream deliberately skips automatic worker registration on localhost, so the test registers it explicitly. This proves its cache/update handler behavior, not public auto-registration, offline completeness, native installation prompts, HTTP-cache revalidation/ETag correctness or Safari/mobile compatibility. Context routing blocks non-loopback page and worker fetches; real worker update scripts come from the real loopback server. Browser routing disables normal HTTP cache, so header assertions and worker CacheStorage checks are reported separately.

## Public build and staging evidence

The public-config application build passed on Node22 without account/API requests. Initial staging at `3a1bebc7fab4590c366394dc0ba378a5161789a9` produced 124 inventoried files; every SHA-256 was independently recomputed and matched. GPL bytes matched the imported LICENSE, all six host/source/provenance files were present, and the largest file was 2,581,897 bytes. Eleven notice files were copied (ten uppercase LICENSE names plus lie/license.md). No alternate host appears in generated runtime config. Automated Standards review identified a stale-dist provenance risk; staging now rebuilds its own clean committed source rather than relying on a manual fresh-build precondition.

Local provider-emulator verification also passed: Wrangler 4.129.0 `pages dev dist/preview/3a1bebc7fab4590c366394dc0ba378a5161789a9 --ip 127.0.0.1 --port 4372 --persist-to /tmp/nuvioweb-preview-state` parsed all four redirects and three header blocks, with no Functions. Its observed default compatibility date was 2026-09-03; use that explicit date for reproduction. Actual emulator responses were no-cache for app/source/license, no-cache plus no-store for worker/config, nosniff, and 404 for missing JS/API. A Chromium run against that emulator passed signed-out rendering, alias reload and guest Home with zero page errors and external requests blocked. This is a local emulator result, not an uploaded preview.

Corrected self-rebuilding staging then passed at `7a316136e8116c0c8920dfafd1d30dd3de5c7a8d`: fresh public build, 124 independently verified hashes and exact staged app/worker/config equality with that new build. Browser CI now executes this staging command without uploading anything. [Preparation PR #35](https://github.com/saurabhhbansal/nuvioweb/pull/35) retains the deployment checkpoint.

## Capabilities and release limits

The static host provides browser assets only. It provides no video relay, CORS proxy, native sidecar, FFmpeg, push-notification service, Trakt secret bridge or hosted compute/payment. Existing guest mode offers the locally verified shell; add-on catalogs, playback, subtitles/audio, real upstream login/refresh/profile sync, service CORS and cross-browser codec behavior are still unverified. An error or unavailable endpoint must not be described as a working backend.

The original source, GPL notices and pin/history are retained. Staging supplies the previously missing core-js/JSZip and DASH bundled notice files along with their included components' notices. Complete nested native/WASM component provenance, trademark/logo rights and distribution obligations remain release-review work; no blanket licensing clearance is asserted. Source/notice links in `SOURCE.txt` must be reachable from the public artifact. Do not distribute sidecar executables under this static-preview task.

Rollback is the previous preview artifact/provider rollback or a protected PR revert, with no history rewriting or deletion of an unrelated site. No public URL, live account/media result or provider cost is claimed by local checks.

## Verified public development preview — 2026-10-18

Live URL: https://nuvioweb-preview.pages.dev. Branch alias: https://preview.nuvioweb-preview.pages.dev. Both now respond over normally verified HTTPS. This section supersedes the earlier pre-deployment/access-blocked checkpoints above.

Owner-approved workspace device login restored account/user read and Pages write only. After listing projects, created dedicated `nuvioweb-preview` with main as its production branch. Uploaded the reviewed immutable staging directory for public source revision `7a316136e8116c0c8920dfafd1d30dd3de5c7a8d`, independently rechecking all 124 inventory hashes before upload. No Functions, backend bindings, custom domain, paid resources or billing changes.

Initial preview-branch deployment `2a45a860` succeeded but nested preview/hash hostnames failed normal TLS probes. The bare project hostname had valid TLS and no main deployment. Uploading the identical artifact on main (`fd767932`) activated that dedicated preview address. The earlier preview alias subsequently returned HTTPS200 too; provisioning timing/cause is not established. TLS verification was never bypassed. Cloudflare's production environment label applies to this development-preview project, not a stable product release.

Executed with cached Wrangler4.129.0 under pinned Node22.23.1 (the `wrangler` shorthand below refers to that executable):

```sh
wrangler pages project list
wrangler pages project create nuvioweb-preview --production-branch main
wrangler pages deploy <reviewed-stage> --project-name nuvioweb-preview --branch preview --commit-hash 7a316136e8116c0c8920dfafd1d30dd3de5c7a8d --commit-message 'Verified static development preview; source and notices included' --commit-dirty=false
wrangler pages deploy <reviewed-stage> --project-name nuvioweb-preview --branch main --commit-hash 7a316136e8116c0c8920dfafd1d30dd3de5c7a8d --commit-message 'Owner-authorized public development preview; verified static artifact' --commit-dirty=false
NUVIO_PREVIEW_REPORT=/tmp/nuvioweb-live-preview-verification.json node scripts/verify-live-preview.mjs <reviewed-stage>
```

`<reviewed-stage>` is `/home/saurabh/workspace/personal/projects/nuvioweb/dist/preview/7a316136e8116c0c8920dfafd1d30dd3de5c7a8d`. Upload ran from an isolated worktree with uncommitted plan documentation, hence Wrangler's working-tree warning. The explicit source hash and false dirty flag describe the separately committed/hash-verified artifact; those plan edits were not built or uploaded. Provider upload counted 123 asset files plus parsed header/redirect rules; local inventory includes these rules before its own generated manifest.

[Read-only verification script](../scripts/verify-live-preview.mjs) passed on actual Chromium156.0.8078.4: ten remote index/app/worker/config/source/GPL/provenance/notice hashes match the local inventory; cache/no-store/nosniff, missing API/JS404 and matching-source GitHub URL200 pass. Actual browser assertions pass for signed-out form, automatic worker control/cache, guest Home/Search/Library/Settings, guest/profile choices after reload and a navigation alias. Zero uncaught page errors. [Sanitized result](evidence/preview-2026-10-18.json) contains no tokens or account identifiers.

All third-party browser requests were blocked, including Nuvio API, Cinemeta, OpenSubtitles and Google Fonts. No credentials entered. This is deployed shell/PWA evidence; live login/sync, populated catalogs, playback/audio/subtitles, complete offline behavior and other devices/browsers remain unverified. The initial TLS probe failed and is recorded separately. Local two-build worker replacement tests remain the update-behavior evidence.

## Reviewed playback/source-order refresh — 2026-10-19

The existing owner-authorized dedicated development preview now serves reviewed main `8edec4248405d59f5b8639085a1e779e6878911b`, containing PR39's owner-approved player fixes and PR40's opt-in native-prediction display ordering. [PR39 approval receipt](https://github.com/saurabhhbansal/nuvioweb/pull/39#issuecomment-6258963843); both PRs and all four main workflows passed. This supersedes the earlier #6 source-revision checkpoint, not its historical evidence or release limits.

Used clean detached `/tmp/nuvioweb-preview` at that exact pushed source, pinned Node22.23.1/npm10.9.8 and cached Wrangler4.129.0. `HUSKY=0 npm ci`, `HUSKY=0 npm ci --prefix app/alpha` and `npm run preview:stage` passed; both installs reported zero vulnerabilities. Recomputed all124 inventoried hashes independently, verified original GPL hash3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986, and checked absence of tests/fixtures/harnesses/Functions/services/worker backends. Largest asset2,587,752bytes. Public config validation excludes privileged fields and alternate credential destinations. Source links identify the exact reviewed merge, not a feature branch.

Cached authorization successfully listed the existing `nuvioweb-preview` project; no new login, account scope, project, domain, billing setting, backend or compute resource was created. Checked current [Cloudflare Direct Upload documentation](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/) and installed CLI help before upload. Initial unprivileged CLI help encountered a read-only default log path; subsequent authorized execution used a task log under `/tmp`. No token/configuration file contents were printed or committed.

Executed from the clean isolated checkout (the `wrangler` shorthand is the cached executable above):

```sh
wrangler pages project list --json
wrangler pages deploy dist/preview/8edec4248405d59f5b8639085a1e779e6878911b --project-name nuvioweb-preview --branch main --commit-hash 8edec4248405d59f5b8639085a1e779e6878911b --commit-message 'Reviewed development preview refresh after verified playback fixes and source ordering' --commit-dirty=false
NUVIO_PREVIEW_REPORT=/tmp/nuvioweb-preview-2026-10-19.json node scripts/verify-live-preview.mjs /tmp/nuvioweb-preview/dist/preview/8edec4248405d59f5b8639085a1e779e6878911b
```

Deployment96f977f4 completed, uploading9 changed files with114 already cached, plus headers/redirects. Live URL remains https://nuvioweb-preview.pages.dev. Cloudflare's main/production label belongs to this dedicated DEVELOPMENT-preview project; no stable production release or hosted processing is launched. Previous deploymentfd767932 and the7a31613 artifact are retained for rollback; no history or deployment was deleted.

[Actual sanitized HTTPS/browser receipt](evidence/preview-2026-10-19.json): ten downloaded asset/config/source/license/notice hashes match the staged inventory; no-cache/no-store/nosniff rules, missing JS/API404 and matching-source GitHub200 pass. Real Chromium156 automatically activates worker/cache `nuvio-app-shell-0.1.5-ccfb8c041a48`; signed-out form, guest Home/Search/Library/Settings, profile choice after reload and navigation alias pass with no page errors. All third-party browser traffic was blocked, including Nuvio API, Cinemeta, OpenSubtitles and external fonts. No login credentials, live provider media, account sync or production capacity was tested. PR39/40's separate loopback playback/quality/source-order evidence remains that feature seam's evidence; public artifact presence does not establish live playback compatibility.


## MVP preparation checkpoint — 2026-10-19 (no upload)

Current deployed revision remains8edec4248405d59f5b8639085a1e779e6878911b/deployment96f977f4. A fresh [HTTPS/browser baseline receipt](evidence/mvp-hosted-baseline-2026-10-19.json) again verifies ten hashes/headers/source, automatic worker, guest navigation and reload in Chromium156/Linux ARM64; third-party traffic blocked and no account/media claim. Main25ce335 contains owner-reviewed sidecar/auth/sync fixes absent from that public artifact, and all four main workflows pass.

Prepared exact clean25ce335 in the existing isolated `/tmp/nuvioweb-preview` checkout using pinned Node and `npm run preview:stage`: buildc2754da8bb89/workerac3d649e6c3c,124 inventory hashes independently matched, original GPL hash matched, largest asset2595061bytes, no tests/harness/backend/private artifacts. [Local preflight](evidence/mvp-preview-preflight-2026-10-19.json) passes actual signed-out/guest rendering, navigation/reload/alias without uncaught errors, all third parties blocked. It does not test automatic worker, account/service or media. This candidate is **superseded for upload** by the confirmed navigation correction and optional legal demo in the current MVP unit; it was never uploaded.

Read-only cached Wrangler4.129.0 access confirms the existing dedicated project; initial parser incorrectly expected raw `name` fields from the CLI display-table JSON and returned PROJECT_NOT_FOUND before any write, then corrected inspection confirmed it. Current [Cloudflare Direct Upload documentation](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/) and installed `pages deploy --help` were checked. No resource/account/billing/domain or deployment change was performed.

The next candidate includes an **optional** same-host static legal demo at `https://nuvioweb-preview.pages.dev/demo/manifest.json`: manifest/catalog/meta/stream/subtitle JSON, original41KB CC0 WebM/VTT, poster/provenance/notice. No server, proxy, auto-install or third-party media. Users explicitly install this URL through Settings; guest state stays local. Its fixed public URLs target the bare dedicated preview hostname; other deployments/aliases are not certified demo origins. Existing private test harnesses/control endpoints are not published. Runtime build and source/GPL history remain otherwise governed by the same staging checks.

After the scoped MVP PR merges with protected CI, prepare its exact main revision and independent hash/config/license inventory. The owner's standing development-preview delegation in [AGENTS.md](../AGENTS.md) authorizes controlled refreshes of this existing dedicated project after revalidation, without another per-upload approval request; recheck every pre-upload condition and the recorded rollback first. Preserve96f977f4/8edec42 for rollback. Then invoke normal Pages upload with exact source hash, existing public config and no backend/binding changes; run `scripts/verify-live-preview.mjs <stage>` for actual HTTPS/worker/guest and `NUVIO_MVP_REPORT=<private-output> node scripts/verify-mvp-preview.mjs <source-sha>` for actual guest legal-demo install/catalog/play/pause/seek/subtitle/return/save/reload. The latter driver is prepared and syntax-checked, **not yet executed against a hosted demo**. All third parties and service workers are blocked in that guest media context; automatic-worker evidence is separate. No live-account isolation or named Chrome/Edge/device claim follows. Public source/deployment entries change only after actual upload and verification.

## MVP candidate revalidation at current main — 2026-10-19 (upload blocked)

Candidate source: `80f739cf18eef5dca6d9e0fa54899357032f88bd`, the protected merge of governance/continuity PR #50. Application runtime source is byte-equivalent to `a1629fe`; only documentation changed. All four required main workflows pass at that revision.

Prepared in a clean detached worktree with pinned Node22.23.1/npm10.9.8 and `npm run preview:stage` (public configuration, no upload). Build asset `53a3ebbd44cc`, worker `nuvio-app-shell-0.1.5-134fd4f07f67`. All134 staged inventory hashes were independently recomputed with0 mismatches; the staged GPL license matches the imported source; the10 optional static legal-demo files are present; no test, fixture, harness, function, service, backend, key or executable path is included; largest asset2,595,361bytes. Manifest SHA256 `ec1fcf11b566a9329e496a85f26bb393011a9f8a307a4ebda76a5da2ca36ef4f`.

A loopback static server modelling the checked-in `_headers`/`_redirects` served that exact artifact: ten remote asset/source/notice hashes matched, cache/no-store/nosniff rules matched, missing asset/API paths returned404, the demo manifest/media/VTT loaded, and actual Chromium156/Linux ARM64 guest sign-in rendering, guest navigation, reload and a navigation alias passed with zero page errors while every third-party origin (Nuvio API, Cinemeta, OpenSubtitles, fonts) was blocked. [Sanitized receipt](evidence/preview-candidate-2026-10-19.json). This is a local staged-artifact preflight, not hosted evidence; upstream also skips automatic service-worker registration on localhost, so no automatic-worker claim is made here.

**Build reproducibility limit:** the inherited bundle embeds a build timestamp in a diagnostic string, so `app.bundle.js`, the asset build id and the worker cache id change on every rebuild of identical source. Do not treat differing ids between rebuilds as a source difference, and verify an upload against its own staged inventory rather than a previous build's ids.

**Upload blocker:** cached Wrangler4.129.0 reports the Cloudflare OAuth token expired at `2026-10-19T10:05:01Z` and cannot refresh non-interactively; `pages project list --json` failed with "In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable". No upload, project/domain/billing change or deployment occurred. The owner must run `wrangler login` interactively on this host or provide a Pages-scoped `CLOUDFLARE_API_TOKEN`, then the authorized refresh can proceed against this exact candidate. Rollback remains deployment96f977f4 / revision8edec42, which are untouched.

## Hosted guest MVP refresh at current main — 2026-10-19

Cloudflare authorization was restored by the owner and the standing development-preview delegation was exercised. Deployed the exact reviewed current main `1f67867ebab7f426672886121d852a643a436414` to the existing dedicated project only.

Preparation: clean detached worktree, pinned Node22.23.1/npm10.9.8, locked installs, focused preview/add-on tests3/3 and6/6, `npm run preview:stage` (asset `888e32602070`, worker `nuvio-app-shell-0.1.5-f40b9237c1a8`),134/134 inventory hashes independently recomputed with0 mismatches, GPL/notices matched,10 optional CC0 demo files, no test/backend/private artifacts, largest asset2,596,393B. Loopback preflight passed hashes/headers/404s/demo resources/guest shell/reload/alias with0 page errors.

Deployment `b48de821-9034-49cc-8e1f-ab5c50e7fa3a` (branch main, 19 uploaded/114 cached). Rollback retained: deployment `96f977f4` / revision `8edec42`.

Hosted verification on actual HTTPS, Chromium156.0.8078.4/Linux ARM64:

- `scripts/verify-live-preview.mjs`: ten asset/source/notice hashes match, cache/no-store/nosniff rules, missing asset/API404, matching-source200, automatic worker `nuvio-app-shell-0.1.5-f40b9237c1a8`, guest navigation/reload/alias,0 page errors.
- `scripts/verify-mvp-preview.mjs`: **all guest journeys PASS** — entry, same-host legal add-on install/catalog, VP8/Opus640×360 playback, pause/seek/resume, active subtitle cue, Back to browsing, save and reload persistence.0 uncaught errors; third parties blocked.

[Sanitized receipt](evidence/preview-refresh-2026-10-19.json). This is guest-only hosted evidence: no real account login, sync, account switching, Library isolation, external-provider CORS, named Chrome/Edge/Safari/mobile, audible/multitrack audio, 4K60/HDR or complete-offline claim. `#7` and `#10` remain open; rollback is the previous deployment above.
