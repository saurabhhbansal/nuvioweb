# Issue #6: Free static Cloudflare preview and PWA verification

**Status:** Preparing on `m1/issue-6-static-preview` from protected main `07d0286`. Public preview explicitly authorized by the owner on 2026-10-18. Cloudflare access check failed: expired OAuth token cannot refresh noninteractively; account reconnection is pending. No deployment has occurred.

**Issue:** https://github.com/saurabhhbansal/nuvioweb/issues/6
**Workstream:** [M1 baseline](../M1-BASELINE.md). Dependency #5 verified; #29 dependency remediation merged. Existing identity-contract draft PR #34 remains a separate human review checkpoint; no auth implementation change here.

## Target files and contracts before implementation

- `deploy/cloudflare/build.properties`: browser-public primary Nuvio URL and the official documented publishable key, empty alternate credential destination and optional integrations; never include service-role/password/refresh/signing keys. Test CI continues to use the inert fixture, never live login.
- `deploy/cloudflare/404.html` and `_redirects`: explicit root-level navigation aliases plus a custom 404; missing JS/API requests must not receive the SPA HTML fallback. The local test server models these checked-in rules, with actual Cloudflare behavior still a deployment check.
- `deploy/cloudflare/_headers`: no-cache/revalidation for unversioned application assets, no-store runtime config and service worker, no-referrer/nosniff/noindex/frame protection. No media proxy, Pages Functions, control API or paid resources.
- `scripts/prepare-static-preview.mjs`: stage only built static output into ignored `dist/preview`, attach deployment headers, GPL/provenance and third-party notices with matching-source links. Reject missing/privileged config and server executables. No credentials or automatic deploy.
- `tests/browser/pwa.spec.mjs`, `tests/browser/server.mjs`, `playwright.config.mjs`: opt-in real worker browser test using loopback server; explicit registration is necessary because upstream intentionally skips auto-registration on localhost. Install old built worker/cache, serve revised built worker/app bytes, call update and prove new shell bytes plus old-cache cleanup. Observe actual Chromium worker/cache APIs, no mocked service-worker behavior. Preserve the four prior shell journeys and external-network blocking. Test route fallback, hard reload and stale unversioned JS/config behavior; characterize differences from deployed behavior.
- Root package scripts and browser workflow: include reproducible staging/PWA checks. `docs/STATIC_PREVIEW.md`, feature matrix, ledger and TRACKER: exact commands, no fake preview URL, missing sidecars, source/notice limitations and access blocker.

No application auth/session/fetch/sidecar code changes. Any demonstrated missing fallback or security behavior requiring runtime changes is a separate reviewed checkpoint; do not implement it silently here.

## Sequence and non-goals

1. Inspect actual build output, config, routing and service-worker semantics. Preserve upstream history/licenses; inspect shipped notice completeness and exclude native sidecars.
2. Implement bounded static staging/cache policy and real worker tests against inert local build. Public-client config is a separate explicit build option, never a CI account test.
3. Run only relevant required commands: root `npm run test:browser` against existing inert build; new focused staging tests if needed for meaningful rejection/notice cases; `node scripts/check-docs.mjs`, docs tests, ledger and `git diff --check`. Rebuild application only when needed for deployment/public configuration; no runtime lint/unit rerun locally for host-only edits. All existing mandatory remote CI still applies.
4. Open scoped draft PR with executed results, limitations and rollback. Cloudflare CLI version observed 4.129.0; use existing CLI rather than introducing another deploy dependency. After authenticated access returns, list projects before choosing a dedicated preview target; do not alter another production site, domain or billing plan.
5. Upload only owner-authorized static preview to free Pages, no paid bindings/functions/compute, and record actual URL/headers/render/navigation/update observations. No public deployment claim before successful provider response and browser observation.

## Acceptance and blockers

- [ ] Preview URL renders app with no private keys; provenance/notices and source access included.
- [ ] Unavailable sidecars/third-party capabilities and local fallback are documented accurately; no proxy or second account system introduced.
- [ ] Real Chromium stale-worker/update, route fallback, cache/reload behavior verified; deployed URL checked when access is available.

Authorization is already given. Current external blocker is expired Cloudflare access; owner asked to reconnect. Complete independently reviewable configuration/test work while waiting, then move to another unblocked roadmap ticket if necessary. Any unresolved shipped font/logo/component rights remain a release gate rather than an invented clearance.

## Threats, cost and rollback

Avoid cached stale configuration/credentials, accidental sensitive artifact upload, insecure alternate credential recipient, native-server redistribution, unsupported CORS/codec claims and indexing a test environment. Public publishable key is not user authentication. No account/password/token is used in fixtures, logs, issues or compute agents. Public API availability does not establish login/sync success.

No new financial commitments: static-only free preview, no billing changes, Functions or paid compute. Roll back via previous preview artifact/provider rollback or protected PR revert; retain original history and previously verified app build. Do not delete existing production resources or force-push.

## Local execution checkpoint

`npm run test:preview` on pinned Node22: 1/1 rejection test passed. `npm run test:browser`: 6/6 passed, zero skips, 38.4 seconds including unchanged four smoke journeys. After explicit navigation aliases/custom 404 adjustment, focused `npm run test:browser -- --project=chromium-pwa`: 2/2 passed, zero skips, 19.0 seconds. Full commands, simulated-build boundaries and remaining deployed acceptance are in [static preview report](../../STATIC_PREVIEW.md). Public configured build and actual staging are the next checks; no provider upload has run.

Public configured build passed; initial staged revision 3a1bebc contains 124 hash-verified files (largest 2,581,897 bytes), original GPL bytes and all eleven component notices. Automated Standards review identified that ignored dist could be stale despite a clean Git tree; staging now enforces pinned Node and rebuilds from clean current source before attaching its revision. Spec review found no actionable gaps; both reviews are automated, not human approval. Final staging after this correction is still pending.
