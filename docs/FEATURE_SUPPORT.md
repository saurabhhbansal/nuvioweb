# Feature support and verification evidence

Last updated 2026-10-19. This matrix records observed evidence; imported implementation is not a device-support claim. Source: Alpha `web` at `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff`, imported into `app/alpha` by [issue #4](https://github.com/saurabhhbansal/nuvioweb/issues/4). See [provenance](../UPSTREAM_SOURCES.md) and [license gates](UPSTREAM_LICENSE_AUDIT.md).

| Capability or gate | Current evidence | Remaining verification |
| --- | --- | --- |
| Source provenance and notices | Pristine #4 import matched605 files/tree/license; original ancestry retained; [local patch inventory](../UPSTREAM_SOURCES.md) documented | Preserve mapping and notices with later patches and releases |
| Documentation CI | Root documentation checker/tests pass | Keep each PR green |
| Locked dependency install | #5 baseline and #29 reviewed patch clean-install on Node 22.23.1/npm 10.9.8; full/runtime/root audits report zero advisories | Keep protected audit CI green; no general security clearance |
| Browser distribution build | #5 and #29 upstream build passed; 12 assets and inert public-config checks passed | Broader release notice/rights review; dedicated development preview verified under #6 |
| Application tests and lint | #29:1,079 tests passed; merged PR39:1,089; merged PR40:1,094 passed with zero skips; lint passed | Keep CI green; these tests do not establish real browser/device compatibility |
| Chromium startup and guest shell | #31/#29: 4 real-browser smoke tests pass: signed-out rendering, validation/network errors, guest Home/Search/Library/Settings and choices after reload | Chromium 156.0.8078.4 only; no live provider, codec or PWA claim |
| Nuvio login, refresh, profiles and sync | Owner-reviewed [identity contract](NUVIO_IDENTITY_CONTRACT.md) in PR #34 maps pinned source and documented API; browser form/error behavior tested | Unlisted owner/QR/fallback scope and #7 authorized session/isolation evidence |
| Stable subject for pairing / entitlements | Owner-reviewed authoritative current-user lookup design, separate subject/owner and consent boundaries; no verifier implemented | Verified deployed issuer/session semantics and #14/#20 security tests; cached owner or decoded JWT cannot authorize |
| Permission-unavailable fallback | Existing guest entry and shell navigation tested; contract specifies local use without duplicate accounts | Hosted background traffic suppression and offline/provider behavior remain unverified |
| HTTP/Stremio add-ons | #9 local Chromium: actual manifest/catalog/meta/stream/subtitle parsing, UI install/toggle/reload, real allowed/denied CORS, explicit errors and profile snapshots; [matrix](ADDON_INTEROPERABILITY.md) | Live providers/cloud sync, general timeout policy and broader compatibility unverified |
| Source format/capability reporting | #10 in progress: explicit declarations survive mapping/flattening; browser cards distinguish provider labels, unknown metadata and native predictions; [contract](SOURCE_CAPABILITIES.md) | Predictions are not playback evidence; optional native-prediction ordering PR40 merged, focused19 unit/6 HTTP and full29 browser cases passing; broader browser/device/sustained-quality/header cases remain open |
| Native video, HLS and DASH | #9 original640x360 verified; #10 second unit locally observes original1080p/4K MP4 and4K HLS/DASH with advancing time/no error/seek; [matrix](PLAYBACK_QUALITY_MATRIX.md) | PR39 owner-approved/merged at0cf8876:27/27 local browser journeys pass after corrections, including failure/return and synthetic subtitle-error isolation; single video-only rendition/low-frame-rate fixtures, no HDR/4K60/audio/subtitle/device certification |
| JavaScript plugin compatibility | Original upstream implementation retained | #11 sandbox/API/license/security verification; no broad compatibility claim |
| Browser-local recovery | No new implementation | #12 prototype and device evidence |
| Static preview and PWA lifecycle | #6: [public development preview](https://nuvioweb-preview.pages.dev), actual Chromium shell/guest/automatic-worker checks and deployed headers/source hashes; local two-build update tests pass | Refreshed to reviewed8edec42; actual HTTPS/guest/worker receipt passes. Live auth/providers/playback, complete offline and other devices/browsers unverified; [evidence](STATIC_PREVIEW.md) |
| Sidecar-backed features | #8 feature branch: [complete route inventory and restricted deployment proposals](SIDECAR_CAPABILITIES.md), disabled-by-default flags, actionable UI and manual external fallback; original source retained | Local 1,103 application / 31 browser tests pass, including actual Settings/API boundaries; protected CI and owner auth/remote-fetch review required before merge. No backend, push delivery, live integration or public-proxy claim |
| Own-host or hosted compute and payments | Planning only; no deployed service | #13–#22 protocol, security, cost, consent and release gates |

See [baseline evidence](BASELINE_VERIFICATION.md) for commands, the initial configuration-test failure and its fixture resolution. No live account, external-media playback, browser/device, production deployment or paid-service testing was performed as part of the source import or build baseline. Historical audits remain dated evidence; current status is recorded here and in issue-specific plans.

Browser smoke reproduction and limits: [recovery audit](RECOVERY_AUDIT.md). Playwright 1.64.0, Chromium headless 156.0.8078.4, 4 passed / 0 failed / 0 skipped locally in 17.4 seconds. External requests and service workers are blocked. Guest shell navigation is not proof of populated catalogs, successful sign-in or synchronized data.

Dependency remediation evidence: [#29 report](DEPENDENCY_REMEDIATION.md). Updated-build Chromium shell tests pass; no additional device/media claims follow from the build-tool update.

Add-on interoperability and source-status presentation: [#9 evidence](ADDON_INTEROPERABILITY.md). Live development preview now serves reviewed8edec42 after the actual2026-10-19 HTTPS/guest/worker verification; local playback assertions remain separate evidence.
