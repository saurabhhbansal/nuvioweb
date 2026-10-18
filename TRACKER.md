# Active tracker

The project has 24 initial GitHub issues, each with a detailed execution plan: [Issue-to-plan index](docs/plans/ISSUE_INDEX.md).

Phase order: M0 foundation → M1 original browser source and auth → M2 addons/playback → M3 own compute → M4 optional hosted compute → M5 sustainable release.

## Current execution

- #2: complete through merged PR #25; documentation CI is present and passing. PR #26 overlaps that work and conflicts with main; do not merge it as an additional implementation.
- #1: pinned-source provenance and license audit implemented in [PR #27](https://github.com/saurabhhbansal/nuvioweb/pull/27); see [import contract](UPSTREAM_SOURCES.md) and [evidence audit](docs/UPSTREAM_LICENSE_AUDIT.md). The audit is complete; source import evidence is recorded separately under #4.
- #4: [PR #28](https://github.com/saurabhhbansal/nuvioweb/pull/28); owner approved `app/alpha`; pinned source imported intact with complete upstream history and notices. See [provenance](UPSTREAM_SOURCES.md).
- #5: clean locked install, configured fixture build, 1,079 tests and lint verified; dedicated application CI added. See [evidence](docs/BASELINE_VERIFICATION.md).
- #29: build-tool dependency advisory remediation before public release (8 reported package records; runtime-only audit reports zero).
- #3: hosted Nuvio API permission remains unverified; local source audit does not authorize public service use.

No application build, device compatibility, live identity integration or deployment has been verified by the provenance work.
