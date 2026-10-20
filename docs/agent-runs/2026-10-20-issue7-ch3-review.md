# Issue #7 CH3 technical review record — 2026-10-20

Scope: child [#119](https://github.com/saurabhhbansal/nuvioweb/issues/119), parent #7. Base
`2116e5b8c70a248a0cd642a1c741eac2dbd06fed`. First reviewer pass at `17b41b3`; fixes at
`aaffee1786e7adbdc888efbe9bd9922780d6e892` with documentation-only follow-ups.

**This is an automated technical review, not independent human approval.**

## Findings and disposition

| Finding | Severity | Disposition |
| --- | --- | --- |
| The 1001-item push guard was unreachable: `SavedLibraryStore.upsert` and `replaceForProfile` silently sliced to 1000, so a 1001st save evicted the oldest item and the next full snapshot deleted it remotely. | P1 | Fixed: removed the silent store slices. A 1001st item is retained; the service refuses the >1000 full-snapshot push without a request and keeps pending intact. A real repository/store test saves 1001 items and asserts both the oldest and newest remain. |
| The new 1001 test mocked `getAll`, so it bypassed the real store cap. | P2 | Fixed: repository-level test exercises real `save`/`getAll` through the store. Service tests cover >1000 refusal and exactly-1000 success. |
| Evidence said a test recorded the old truncated read; it did not. | P2 | Corrected: the evidence now states the real-store retention and push-refusal tests that exist; no historical old-path claim is made. |
| The added legacy-pending test duplicated an existing one. | P3 | Removed; the pre-existing legacy test remains. |
| The two-writer test was fixture-defined and did not assert the first writer's acknowledgement plus lost item. | P3 | Strengthened: both writers acknowledge, the remote keeps only writer B, and writer A's item is asserted absent. It remains an explicit characterization of last-writer-wins, not a safe-merge claim. |
| The policy's storage-failure row said push is not attempted when metadata cannot be trusted. | P3 | Corrected: the in-memory state protects same-page edits; a push may still proceed against it. No durable guarantee across reload. |
| The CH3 review record was a placeholder. | P3 | This record now lists the findings and dispositions. |
| Pre-existing cap sliced the combined all-profile list, so >1000 combined items could evict another profile's cache. | P3 | The silent slices are removed; local caches are no longer evicted by a combined cap. The >1000 push remains refused per profile. |
| Follow-up review: A5 evidence said 43 tests/timestamp while citing the 44-test commit; pull-path retention was not tested; UI still displays 1000; CURRENT was stale. | P3 | Fixed: A5 now says 45 tests at the final source, repository tests cover save and replaceAll/replaceForProfile 1001-item retention, the policy states the 1000-row display/console-only limitation, and CURRENT points at the merged CH2/current CH3 branch. |

## Verification after fixes

- `node --test savedLibrarySyncService.test.mjs savedLibraryRepository.test.mjs savedLibrarySyncState.test.mjs` — 45/45.
- `npm test --prefix app/alpha` — 1417/1417.
- `npm run lint --prefix app/alpha`, inert build, `check-alpha-build` — pass.
- Acceptance `--validate` — exit 0 with A2,A3,A5,A8 unmet; full closure exit 2.

## Re-review

The first reviewer pass was at `17b41b3`. A focused re-review was requested then; this record does not establish that it occurred at the final integrated head. The central claim is now two-layer: the real store retains 1001 items and the
service refuses the >1000 full snapshot.

## Limits

Synthetic characterization only. Two same-account writers remain last-writer-wins and unsupported; no
server conflict/version contract was observed. A5 stays blocked; no live Library write or offline
durability claim.


Historical review limit corrected 2026-10-20: the independent review inspected all changes through `0212e733275bcb3b95661b288139b69d8b01c064`, reproduced two QR defects and reported remaining fixture/ledger/evidence gaps. The Sol remediation has a new separate automated actual-diff review; historic findings are not a current exact-head clearance.
