# Feature support and verification evidence

Last updated 2026-10-18. This matrix records observed evidence; imported implementation is not a device-support claim. Source: Alpha `web` at `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff`, imported into `app/alpha` by [issue #4](https://github.com/saurabhhbansal/nuvioweb/issues/4). See [provenance](../UPSTREAM_SOURCES.md) and [license gates](UPSTREAM_LICENSE_AUDIT.md).

| Capability or gate | Current evidence | Remaining verification |
| --- | --- | --- |
| Source provenance and notices | Pristine #4 import matched605 files/tree/license; original ancestry retained; [six local patch paths](../UPSTREAM_SOURCES.md) documented | Preserve mapping and notices with later patches and releases |
| Documentation CI | Root documentation checker/tests pass | Keep each PR green |
| Locked dependency install | #5 baseline and #29 reviewed patch clean-install on Node 22.23.1/npm 10.9.8; full/runtime/root audits report zero advisories | Keep protected audit CI green; no general security clearance |
| Browser distribution build | #5 and #29 upstream build passed; 12 assets and inert public-config checks passed | Broader release notice/rights review; dedicated development preview verified under #6 |
| Application tests and lint | #29: 1,079 tests passed with zero skips; lint passed | Keep CI green; these tests do not establish real browser/device compatibility |
| Chromium startup and guest shell | #31/#29: 4 real-browser smoke tests pass: signed-out rendering, validation/network errors, guest Home/Search/Library/Settings and choices after reload | Chromium 156.0.8078.4 only; no live provider, codec or PWA claim |
| Nuvio login, refresh, profiles and sync | Owner-reviewed [identity contract](NUVIO_IDENTITY_CONTRACT.md) in PR #34 maps pinned source and documented API; browser form/error behavior tested | Unlisted owner/QR/fallback scope and #7 authorized session/isolation evidence |
| Stable subject for pairing / entitlements | Owner-reviewed authoritative current-user lookup design, separate subject/owner and consent boundaries; no verifier implemented | Verified deployed issuer/session semantics and #14/#20 security tests; cached owner or decoded JWT cannot authorize |
| Permission-unavailable fallback | Existing guest entry and shell navigation tested; contract specifies local use without duplicate accounts | Hosted background traffic suppression and offline/provider behavior remain unverified |
| HTTP/Stremio add-ons | #9 local Chromium: actual manifest/catalog/meta/stream/subtitle parsing, UI install/toggle/reload, real allowed/denied CORS, explicit errors and profile snapshots; [matrix](ADDON_INTEROPERABILITY.md) | Live providers/cloud sync, general timeout policy and broader compatibility unverified |
| Native video, HLS and DASH | #9 actual bundled UI initiates original local fixture playback in Chromium156: video640x360, time advances, no media error | #10 broader codecs/1080p/4K/HDR/HLS/DASH/audio/subtitle/device evidence; one fixture is not universal support |
| JavaScript plugin compatibility | Original upstream implementation retained | #11 sandbox/API/license/security verification; no broad compatibility claim |
| Browser-local recovery | No new implementation | #12 prototype and device evidence |
| Static preview and PWA lifecycle | #6: [public development preview](https://nuvioweb-preview.pages.dev), actual Chromium shell/guest/automatic-worker checks and deployed headers/source hashes; local two-build update tests pass | Live auth/providers/playback, complete offline and other devices/browsers unverified; [evidence](STATIC_PREVIEW.md) |
| Sidecar-backed features | Original source retained; no sidecar deployed | #8 dependency inventory, capability flags and restricted endpoints |
| Own-host or hosted compute and payments | Planning only; no deployed service | #13–#22 protocol, security, cost, consent and release gates |

See [baseline evidence](BASELINE_VERIFICATION.md) for commands, the initial configuration-test failure and its fixture resolution. No live account, external-media playback, browser/device, production deployment or paid-service testing was performed as part of the source import or build baseline. Historical audits remain dated evidence; current status is recorded here and in issue-specific plans.

Browser smoke reproduction and limits: [recovery audit](RECOVERY_AUDIT.md). Playwright 1.64.0, Chromium headless 156.0.8078.4, 4 passed / 0 failed / 0 skipped locally in 17.4 seconds. External requests and service workers are blocked. Guest shell navigation is not proof of populated catalogs, successful sign-in or synchronized data.

Dependency remediation evidence: [#29 report](DEPENDENCY_REMEDIATION.md). Updated-build Chromium shell tests pass; no additional device/media claims follow from the build-tool update.

Add-on interoperability and source-status presentation: [#9 evidence](ADDON_INTEROPERABILITY.md). Live preview revision remains the separately recorded #6 upload until a later verified deployment.
