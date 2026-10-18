# Feature support and verification evidence

Last updated 2026-10-18. This matrix records observed evidence; imported implementation is not a device-support claim. Source: Alpha `web` at `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff`, imported into `app/alpha` by [issue #4](https://github.com/saurabhhbansal/nuvioweb/issues/4). See [provenance](../UPSTREAM_SOURCES.md) and [license gates](UPSTREAM_LICENSE_AUDIT.md).

| Capability or gate | Current evidence | Remaining verification |
| --- | --- | --- |
| Source provenance and notices | Identical Git tree, 605 tracked files, GPL license hash, original ancestry and repository integrity checks passed | Preserve mapping and notices with later patches and releases |
| Documentation CI | Root documentation checker/tests pass | Keep each PR green |
| Locked dependency install | Not executed for source import | #5: clean `npm ci` on pinned Node/npm |
| Browser distribution build | Not executed for source import | #5: upstream build, expected `dist` artifacts and notice inventory |
| Application tests and lint | Imported upstream tests/configuration; not executed | #5: complete upstream suites and explicit baseline failures |
| Nuvio login, refresh, profiles and sync | [Identity contract](NUVIO_IDENTITY_CONTRACT.md) maps unchanged pinned source; public API v1.3 supports documented third-party operations under terms | #3 human review and unsupported owner/QR/fallback service scope; #7 synthetic/authorized identity, revocation and isolation evidence |
| Stable subject for pairing / entitlements | Documented authoritative `/auth/v1/user` design, separate subject/owner and consent boundaries; no verifier implemented | Approved issuer/audience/session semantics, service-scope permission and #14/#20 security tests; cached owner or decoded JWT cannot authorize |
| Permission-unavailable fallback | Existing guest entry observed in source; contract specifies local use without duplicate accounts | Future restricted-mode change must suppress hosted background traffic; no guest/offline browser verification claimed |
| HTTP/Stremio add-ons | Original source retained unchanged | #9 legal fixtures, parsing/error/CORS matrix |
| Native video, HLS and DASH | Original source retained unchanged | #10 real fixtures on specified browsers/devices; no 4K/HDR/codec claim yet |
| JavaScript plugin compatibility | Original upstream implementation retained | #11 sandbox/API/license/security verification; no broad compatibility claim |
| Browser-local recovery | No new implementation | #12 prototype and device evidence |
| Static preview and PWA lifecycle | No deployment | #6 preview, routes, cache and update smoke tests |
| Sidecar-backed features | Original source retained; no sidecar deployed | #8 dependency inventory, capability flags and restricted endpoints |
| Own-host or hosted compute and payments | Planning only; no deployed service | #13–#22 protocol, security, cost, consent and release gates |

No live account, external-media playback, browser/device, production deployment or paid-service testing was performed as part of the source import. Historical audits remain dated evidence; current status is recorded here and in issue-specific plans.
