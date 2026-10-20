# Issue #7 CH1 technical review record — 2026-10-20

Scope: PR #121, child [#117](https://github.com/saurabhhbansal/nuvioweb/issues/117), parent #7.
Base `f30c79f6045786c821047532104c90aa65b861cc`; reviewed through `2c1d2379cde0f9bc868b774c4f98fd4507e5ee80`,
with documentation-only follow-ups after that source commit.

**This is an automated technical review, not independent human approval.** It does not satisfy a
sensitive-owner review or replace protected CI.

## Reviewer substitution

Codex CLI 0.163.0 was available but could not run its read-only review: the workspace sandbox failed
with `bwrap: No permissions to create new namespace` and the reviewer reported that no diff was
inspected. The executor then used a distinct subagent reviewer with a read-only prompt and the
checklist in AGENTS.md. The subagent inspected the actual diff, receipt, validator and tests. This
substitution is recorded here as required by the integration gate.

## Findings and disposition

| Finding | Severity | Disposition |
| --- | --- | --- |
| A failure could be marked resolved by an unconnected criterion or any closed child, letting synthetic evidence erase a live failure. | P1 | Fixed: resolution now requires a later, same-kind pass observation **on the same criterion** whose artifact is the reference. Cross-criterion/child resolutions are rejected and tested. |
| No postdate/reference linkage and relative/HTTP references were only existence-checked. | P2 | Fixed: `observed_at` timestamps order observations; the reference must be a repository artifact equal to the resolving pass artifact and distinct from the failing artifact. |
| Closed-child resolver was a broad bypass; child keys could collide with criterion IDs. | P2 | Fixed: child-based resolution is no longer accepted; child keys cannot equal A1-A8. |
| Commit traceability was format-only (any 40-hex string). | P2 | Fixed: pass/fail commits must exist and be ancestors of the tested HEAD via `git cat-file`/`merge-base`; mutation tests cover null and zero commits. |
| A same-account profile-1 → profile-2 watched/progress/add-on leak would not be caught. | P2 | Fixed: base assertions are exact for the active profile namespace and assert the other profile's keys are absent; a number/string comparison bug in the test helper was corrected. |
| Evidence/doc counts and source commit were stale after gate fixes. | P2 | Fixed: receipt and fixture evidence point at source `2c1d237`; validator tests are recorded as 29/29; source commit references are updated. |
| Child-key collision, ledger status/closure consistency, whole-receipt secret scan and count-only results needed stronger rules. | P2/P3 | Fixed: ledger status must be in_progress/blocked_external while unmet and verified when met; closure/parent flags are checked; credential scanning covers the whole receipt; count-only and bare-label results are rejected. |
| The immutable mapping existed only in the editable checker. | P3 | Fixed: `docs/evidence/issue7-acceptance-contract.json` is a committed contract that must agree with the checker and receipt. |
| Fixture served add-on manifests for unknown accounts and silently defaulted a missing profile scope. | P3 | Fixed: aliases/profiles are restricted to A/B and 1/2, no credential headers are allowed, and strict profile operations reject a missing scope. |
| Expired/offline tests did not prove an attempted refresh/abort. | P3 | Fixed: tests assert a rejected refresh request and aborted identity requests. |
| CLI exit contract was ambiguous for structural errors. | P3 | Clarified: 0 valid/met, 1 structurally invalid, 2 valid but unmet; tests cover 0, 1 and 2. |
| Review record and cost note were missing. | P3 | Added: this record and the plan's cost/privileges section. |

## Verification after fixes (executor run)

- `node --test scripts/check-issue7-acceptance.test.mjs` — 34/34 pass.
- `node scripts/check-issue7-acceptance.mjs docs/evidence/issue7-acceptance.json --validate` — exit 0.
- Default closure mode — exit 2 with A1,A2,A3,A5,A6,A7,A8 unmet.
- `npx playwright test tests/browser/identity-sync.spec.mjs --project=chromium` — 13/13 pass.
- Full `npx playwright test` — 61/61 pass at the earlier head; rerun at the final head before merge.
- `npm test --prefix app/alpha` — 1396/1396 pass at the earlier head; rerun at the final head before merge.
- `npm run lint --prefix app/alpha`, `check-docs`, `check-progress`, governance tests, `check-commit-references`, `git diff --check` — pass.

## Limits

The reviewer did not independently execute Playwright (read-only); the executor executed it. All new
evidence is synthetic/local. No live account, provider, QR, credential or device operation was used,
and no claim of parent #7 acceptance is made.
