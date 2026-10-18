# Feature support and verification evidence

Last updated 2026-10-18. This matrix records observed evidence; imported implementation is not a device-support claim. Source: Alpha `web` at `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff`, imported into `app/alpha` by [issue #4](https://github.com/saurabhhbansal/nuvioweb/issues/4). See [provenance](../UPSTREAM_SOURCES.md) and [license gates](UPSTREAM_LICENSE_AUDIT.md).

| Capability or gate | Current evidence | Remaining verification |
| --- | --- | --- |
| Source provenance and notices | Identical Git tree, 605 tracked files, GPL license hash, original ancestry and repository integrity checks passed | Preserve mapping and notices with later patches and releases |
| Documentation CI | Root documentation checker/tests pass | Keep each PR green |
| Locked dependency install | #5: clean `npm ci` passed, Node 22.23.1/npm 10.9.8, original lockfile retained | #29: remediate reported build-tool advisories before release |
| Browser distribution build | #5: upstream build passed; 12 assets and inert public-config checks passed | Distribution notice/rights review; no public deployment |
| Application tests and lint | #5: 1,079 tests passed with zero skips; lint passed | Keep CI green; these tests do not establish real browser/device compatibility |
| Nuvio login, refresh, profiles and sync | Original source retained unchanged | #3 service-use permission and #7 authorized identity/isolation tests |
| HTTP/Stremio add-ons | Original source retained unchanged | #9 legal fixtures, parsing/error/CORS matrix |
| Native video, HLS and DASH | Original source retained unchanged | #10 real fixtures on specified browsers/devices; no 4K/HDR/codec claim yet |
| JavaScript plugin compatibility | Original upstream implementation retained | #11 sandbox/API/license/security verification; no broad compatibility claim |
| Browser-local recovery | No new implementation | #12 prototype and device evidence |
| Static preview and PWA lifecycle | No deployment | #6 preview, routes, cache and update smoke tests |
| Sidecar-backed features | Original source retained; no sidecar deployed | #8 dependency inventory, capability flags and restricted endpoints |
| Own-host or hosted compute and payments | Planning only; no deployed service | #13–#22 protocol, security, cost, consent and release gates |

See [baseline evidence](BASELINE_VERIFICATION.md) for commands, the initial configuration-test failure and its fixture resolution. No live account, external-media playback, browser/device, production deployment or paid-service testing was performed as part of the source import or build baseline. Historical audits remain dated evidence; current status is recorded here and in issue-specific plans.
