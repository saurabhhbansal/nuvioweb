# Legal add-on interoperability — issue #9

[Issue plan](plans/issues/issue-9.md). Pinned Alpha source remains `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff`; original history/GPL notices retained. Tests use the actual imported repositories and bundled UI, not a replacement client. The only runtime correction keeps unsuccessful source names/status visible until refresh or navigation.

## Reproduction and fixture rights

Use Node22.23.1/npm10.9.8 and the locked root/application dependencies, with Playwright1.64.0 Chromium156.0.8078.4 installed:

```sh
cd app/alpha
NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build
cd ../..
npm run test:addon-fixtures
npm run test:browser
node scripts/check-alpha-build.mjs
node --test scripts/check-docs.test.mjs scripts/governance.test.mjs
node scripts/check-docs.mjs
node scripts/check-progress.mjs
```

Browser automation starts a loopback application server on127.0.0.1:4371 and a separate HTTP provider on127.0.0.1:4373, then stops them. The provider uses real CORS headers; route interception allows those two origins and aborts everything else. No route.fulfill substitutes a successful CORS response. Test-only source/harness routes require `NUVIO_ADDON_TEST=1`, serve only constrained application JS paths, and are never part of staged deployment. PWA tests retain their own real-worker project.

[Original media provenance](../tests/fixtures/media/provenance.json) identifies the 41,129-byte generated canvas/oscillator WebM: SHA256 `ddc53c6aaf0e76e6852cecf7ffa33ccd449a71245e58963b0fbf87d3f4f097de`. [Generator](../scripts/generate-legal-media.mjs) uses no downloaded assets/network. Media/VTT are CC0 test content; source follows the project license. A recorded request for VP8/Opus at640x360 is separated from actual playback observations below. Regeneration is not byte-deterministic; its hash is updated with the output. Provider/poster/media/subtitle URLs are loopback paths, never unauthorized external media links.

## Observed matrix

| Journey or contract | Actual evidence | Boundary |
| --- | --- | --- |
| HTTP resource chain | Manifest, catalog, meta, stream and subtitle fixtures parsed by actual Alpha repositories/API wrappers in Chromium | Source-module harness tests parsing/transport; bundled UI tested separately |
| Resource declarations/configuration | String resources, object resources/types/idPrefixes and configured `/sample` manifest URL parse successfully | No claim of an arbitrary provider configuration wizard |
| Guest add-on lifecycle | Actual settings form installs, reports Saved locally, disables/enables, reloads through profile selection/onboarding and retains installed/enabled state | Guest persistence, not cloud sync |
| Catalog and detail | Actual Home displays Original Legal Fixture card; selecting it opens metadata detail | One legal fixture catalog; live provider data untested |
| Playback initiation | Detail Play → source card → real video element reports640x360, no media error, currentTime greater than0.1 | Chromium156 on this host and this short generated file; no 4K/HDR/HLS/DASH/audio-audibility claim |
| Browser CORS | Allowed second-origin provider loads; denied-origin variant yields explicit error | Local HTTP origins, not public HTTPS mixed-content/PNA or a proxy workaround |
| Invalid inputs | Malformed JSON, invalid manifest shape,503 and CORS rejection visibly fail in settings; no installed card; submit re-enables | Existing low-level messages remain; broader friendly diagnostics belong to #10 |
| Injection-shaped failure text | HTML-looking provider error is escaped as text, creates no img element and executes no injected marker | Bounded fixture case, not a complete XSS/security audit |
| Slow/abort/empty | Delayed manifest succeeds; real catalog AbortSignal cancellation returns explicit error; empty catalog remains empty | Does not establish a universal manifest/stream timeout policy |
| Credentials | Provider request observations contain neither Authorization nor apikey even with synthetic session strings present | No real Nuvio token/password/account used; not all possible plugin paths |
| Profiles and sync boundary | Actual profile-scoped add-on snapshot serialization/isolation survives switching synthetic local profiles | No authenticated wire/cloud profile-sync claim; #7 retains that verification |
| Partial sources and recovery | Healthy stream stays available, failing provider stays named in an accessible status after virtual3seconds, actual Refresh sources recovers it | No network/auth/retry policy changed; empty and failed results both use truthful no-playable-result wording |
| Range and provenance | Original media hash verified, byte range206/invalid range416, known-path restrictions | Fixture transport only, not all external host Range behavior |
| Narrow layout | Actual status fits at1280x800 and390x844 without horizontal text overflow; font16px; both screenshots inspected | Chromium viewport check, not iOS/Safari/device certification |

## Regression-driven presentation correction

The new partial-provider test first failed while a healthy source was visible: there was no persistent named failure status. Upstream desktop source filters omitted result labels and removed unsuccessful source entries after1600ms. The bounded fix removes that timer, keeps entries until refresh/navigation, and renders escaped localized status text with the existing refresh action. A second regression reproduced custom-name collisions: a healthy provider overwrote the failing provider status when both labels matched. Outcomes now use the repository’s existing per-load provider index; display labels remain escaped presentation/filter text. Both distinct-name and duplicate-custom-name cases retain failure status and recover through refresh. It preserves source ordering and playable results. Names are not raw URLs; no headers/tokens/provider secrets are rendered.

The wording says no playable result, because existing aggregation does not distinguish an empty successful endpoint from a failed endpoint in its chip state. It does not diagnose a codec problem or provider-wide outage. Individual repository error results remain inspectable; the aggregate stream response still contains successful groups rather than a new structured diagnostics API. Source descriptors and richer error causes remain #10.

Application patch paths: `app/alpha/js/ui/screens/stream/streamScreen.js`, `app/alpha/css/components.css`, `app/alpha/css/desktop.css`, `app/alpha/res/values/strings.xml`. No auth/session/remote transport/plugin sandbox/payment/compute request implementation, package specification, original test assertion or license file changes. See [local patch inventory](../UPSTREAM_SOURCES.md).

## Executed checks and limits — 2026-10-18

- Generated original media; fixture contracts passed3/3 with no skips (resource chain/configured/object manifests, original hash/Range, CORS/malformed/503/empty/abort).
- Initial six new add-on browser journeys passed6/6 in31.6seconds. UI driver assumptions were corrected to use the visible checkbox label and observed profile/onboarding flow; no application behavior was changed to satisfy those assumptions.
- Partial-provider regression was red (healthy stream present, no named status); after the presentation fix it passed. The extended retention/viewport/retry/recovery test passed1/1 in10.7seconds including both viewport screenshots.
- Inert configured build passed; 12 distribution/config checks passed. Full application `npm test`: **1,079 pass,0fail,0skip**,47.9seconds. `npm run lint` passed unchanged rules.
- Impeccable mechanical scan exited2 on inherited easing/layout-transition/drag-accent warnings outside modified hunks; the narrow status change introduces none of those patterns. No unrelated style refactor was made.
- Final `npm run test:browser`: **14/14 passed**,0fail/0skip, reported1.3minutes: eight add-on journeys plus four retained shell and two real PWA journeys. `npm run test:addon-fixtures`:3/3 passed,0skip. `node --test scripts/check-docs.test.mjs scripts/governance.test.mjs`:15/15 passed,0skip. Docs links/ledger/whitespace pass; final protected PR checks remain the integration gate.

No live credentials, backend sync, external providers/media, other-browser codec/HDR, subtitle/audio selection, full offline lifecycle or paid compute tests were performed here. Subtitles are parsed as fixture URLs; selection/rendering remains unverified. Google Fonts are blocked in screenshots, exposing inherited icon-font fallback text; that is a known visual limit rather than a new status regression. The publicly deployed #6 preview remains its recorded revision until an explicitly recorded later upload.

Rollback: protected revert of this scoped fixture/presentation PR; no schema, account, payment or production-data migration. Static staging excludes test servers/source harness/media fixtures. No new financial commitment or backend is introduced.
