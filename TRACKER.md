# Active tracker

The project has 24 initial GitHub issues, each with a detailed execution plan: [Issue-to-plan index](docs/plans/ISSUE_INDEX.md).

Phase order: M0 foundation → M1 original browser source and auth → M2 addons/playback → M3 own compute → M4 optional hosted compute → M5 sustainable release.

## Current execution

- #2: complete through merged PR #25; documentation CI is present and passing. PR #26 overlaps that work and conflicts with main; do not merge it as an additional implementation.
- #1: pinned-source provenance and license audit implemented in [PR #27](https://github.com/saurabhhbansal/nuvioweb/pull/27); see [import contract](UPSTREAM_SOURCES.md) and [evidence audit](docs/UPSTREAM_LICENSE_AUDIT.md). Application code remains unimported.
- #4: next baseline task after #1; owner decision on import layout requested. Preserve complete upstream history and notices.
- #3: hosted Nuvio API permission remains unverified; local source audit does not authorize public service use.

No application build, device compatibility, live identity integration or deployment has been verified by the provenance work.
