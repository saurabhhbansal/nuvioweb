# Issue #9: Legal HTTP add-on interoperability fixtures

**Status:** In progress on `m2/issue-9-addon-fixtures`, based on protected main `111f14c` after verified preview preparation PR #35. #6 remains open for Cloudflare reconnection/deployment; #3 identity-contract draft PR #34 remains open for human review. This task has no dependency on live accounts, external providers or a deployment.

**Issue:** https://github.com/saurabhhbansal/nuvioweb/issues/9
**Workstream:** [M2 add-ons and playback](../M2-ADDONS-PLAYBACK.md). Dependency #5 verified. Original Alpha runtime remains the baseline; no duplicate implementation.

## Inspected contracts

`AddonRepository.fetchAddon` requests a manifest through AddonApi with session auth disabled, maps string/object resource definitions and profile-scoped local configuration. `CatalogRepository.getCatalog` accepts AbortSignal and maps catalog DTOs. Meta/Stream/Subtitle API wrappers also disable session auth. Desktop Addon Manager installs/removes/enables sources and surfaces validation errors; guest mutations are saved locally rather than claiming cloud sync. HTTP JSON success is not manifest schema validation; malformed shapes may throw. Live profile sync remains #7.

## Target files and API contract before code changes

- `tests/fixtures/addons/server.mjs` and fixture JSON: loopback-only second origin `http://127.0.0.1:4373`, real HTTP manifest/catalog/meta/stream/subtitles/configuration responses; browser origin is port4371. Supported string/object resources, configured URL, catalog extras, slow/partial/503/malformed and denied-CORS variants. No unrestricted URLs/proxy, internet requests, tokens or plugins. Test-only bounded request observations record paths and whether credentials were present, never their values.
- `tests/fixtures/media/`: project-generated short VP8/Opus WebM plus text subtitles and a license/hash/source manifest; no scraped/provider media or copyrighted sample links. `scripts/generate-legal-media.mjs` records only canvas drawing and oscillator audio using the existing local Chromium dependency. Byte hashes identify each output; regeneration need not be bit-identical. No codec/HDR/4K claim from titles.
- `tests/browser/addons.spec.mjs`: actual bundled UI guest installation, visible success/failure, enable/disable, catalog navigation and reload persistence. Real cross-origin CORS tests must use HTTP headers, never route.fulfill. Actual public API wrapper/repository parsing and AbortSignal timeout tests can use a separate test-only source-module harness; imported source remains unchanged.
- `tests/browser/server.mjs` and Playwright config: start/stop local provider with browser tests and expose source modules only through a constrained loopback fixture path when explicitly enabled. Preserve six existing shell/PWA journeys and nonfixture network blocking. No test controls/source modules are included in deployment.
- Root scripts/browser workflow as needed; `docs/ADDON_INTEROPERABILITY.md`, FEATURE_SUPPORT, TRACKER and ledger: scenario matrix, genuine UI/repository/CORS results, unsupported/untested behavior, commands and precise follow-ups. Update fixture/parser assumptions only based on observed existing APIs.

## Implementation sequence and non-goals

1. Generate original legal media/subtitle fixture and record its exact provenance/hash.
2. Serve explicit fixture routes on loopback, assert shape/status/CORS/range contracts, and test actual imported parser/transport seams including cancellation and partial providers.
3. Drive actual installed application UI in guest mode. Verify install/toggle/persistence, a populated legal catalog/detail and visible manifest/CORS failures; attempt supported fixture playback only with observed assertions and narrow browser evidence.
4. Record omissions/bugs honestly. Do not weaken tests to green or broaden runtime/auth/plugin/fetch behavior silently. A sensitive runtime fix requires its own concrete human review before merge. Cloud profile sync uses future authorized fixtures/live checks under #7; it is not established by local guest persistence.
5. Run only scoped fixture/browser tests and docs/governance/whitespace checks locally. Rebuild inert application for browser tests because the last local build used public preview config. No inherited suite rerun locally unless runtime files change; required remote app CI remains enforced.
6. Open scoped draft PR with exact results, legal fixture/license/source evidence, limitations and rollback; individually check issue acceptance before integration/closure.

## Acceptance and verification

- [ ] Supported HTTP/Stremio resource/configuration behaviors have automated fixtures and actual parser/transport/browser evidence.
- [ ] Error/capability outcomes are observable in fixture matrix/UI or explicit result objects; silent aggregate omissions are recorded as limitations, never success.
- [ ] All media URLs are fixture-origin paths with original generated content, recorded hash/license and no account/private media.
- [ ] Parsing, real browser allowed/denied CORS, delays/abort, partial provider and guest lifecycle cases pass or have precise blockers.

Commands planned: `node scripts/generate-legal-media.mjs`; fixture-contract tests if needed; configured inert Alpha build; `npm run test:browser` (or focused new project during development), `node scripts/check-docs.mjs`, `node --test scripts/check-docs.test.mjs scripts/governance.test.mjs`, `node scripts/check-progress.mjs`, `git diff --check` and new-ancestry closing-reference preflight.

## Threats, cost, rollback

Treat all manifest/catalog/subtitle fields as untrusted. Include HTML-looking strings as inert text, malformed JSON/shapes, actual CORS failure and no Nuvio bearer/API-key forwarding to providers. Keep all servers bound to127.0.0.1, only fixed known fixture paths, capped files/responses and cleanup on exit. Do not implement SSRF proxying or bypass browser CORS; localhost HTTP fixtures do not prove mixed-content behavior on a public HTTPS site.

No live credentials, external login/sync, real providers, paid service, deployment or backend is introduced. Generated media is tiny and local. Preserve source/history/licenses. Roll back this scoped test/docs change through protected revert; no production data or schema migration. Guest/browser fixtures cannot close account-sync, universal codec or sandbox-security tickets.

## Preserved fixture checkpoint before deployment resumption

Generated original 640x360-requested VP8/Opus fixture from canvas/oscillator only: 41,129 bytes, SHA256ddc53c6aaf0e76e6852cecf7ffa33ccd449a71245e58963b0fbf87d3f4f097de, Chromium156.0.8078.4, CC0 test media with generator/source/provenance recorded. `npm run test:addon-fixtures` on pinned Node22 passed3/3, zero skips: resource chain/configured/object manifests, original hash/Range behavior, explicit CORS/malformed/503/empty/abort scenarios. No browser add-on integration or playback claim yet.

Work was preserved while owner restored workspace Cloudflare access; issue6 is now deployed and its completion PR36 merged at18655a7. Inert configured application rebuild passed for the forthcoming browser integration tests. Resume this branch against protected main, preserve deployed evidence and the three verified fixture contracts, then implement the browser matrix. No Alpha runtime changes yet.
