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
