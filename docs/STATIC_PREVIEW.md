# Static preview preparation — issue #6

The owner authorized a public preview on 2026-10-18 and supplied the [official Nuvio API docs](https://nuvio.tv/docs). **No preview is deployed yet.** Existing Cloudflare OAuth access is expired and cannot refresh noninteractively; `wrangler whoami` exited 1. Reconnect with `npx wrangler login` locally; never paste account credentials or API tokens into issues/chat.

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

[Host headers](../deploy/cloudflare/_headers) revalidate unversioned assets and mark runtime config/worker no-store; no-referrer, nosniff, frame denial and noindex are explicit. A [custom 404](../deploy/cloudflare/404.html) and [navigation aliases](../deploy/cloudflare/_redirects) prevent unknown API/JS requests becoming successful SPA HTML. These follow Cloudflare's [headers](https://developers.cloudflare.com/pages/configuration/headers/) and [serving](https://developers.cloudflare.com/pages/configuration/serving-pages/) contracts; provider behavior is still unverified until uploaded.

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

## Capabilities and release limits

The static host provides browser assets only. It provides no video relay, CORS proxy, native sidecar, FFmpeg, push-notification service, Trakt secret bridge or hosted compute/payment. Existing guest mode offers the locally verified shell; add-on catalogs, playback, subtitles/audio, real upstream login/refresh/profile sync, service CORS and cross-browser codec behavior are still unverified. An error or unavailable endpoint must not be described as a working backend.

The original source, GPL notices and pin/history are retained. Staging supplies the previously missing core-js/JSZip and DASH bundled notice files along with their included components' notices. Complete nested native/WASM component provenance, trademark/logo rights and distribution obligations remain release-review work; no blanket licensing clearance is asserted. Source/notice links in `SOURCE.txt` must be reachable from the public artifact. Do not distribute sidecar executables under this static-preview task.

Rollback is the previous preview artifact/provider rollback or a protected PR revert, with no history rewriting or deletion of an unrelated site. No public URL, live account/media result or provider cost is claimed by local checks.
