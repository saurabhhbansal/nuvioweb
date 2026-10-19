# Upstream watch (issue #23 PR A/B) technical review — 2026-10-19

Reviewer: Codex CLI 0.163.0, `codex exec --sandbox read-only`. Scope: `4eeff8e...092f04d` on `feat/issue-23-collector`, covering `docs/plans/issues/issue-23.md`, `docs/upstream/state.json`, `docs/upstream/report.schema.json`, `scripts/check-upstream-state.mjs`, `scripts/upstream-watch.mjs` and their tests. This is an **automated technical review, not independent human approval**, and establishes no live-monitoring, licensing-completeness or parity evidence.

## Findings and dispositions

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | P1 | Report output path containment was lexical only; a symlinked parent or target could overwrite outside `dist/`. | Fixed. `assertSafeReportPath` resolves the real `dist/` root, rejects lexical escapes, creates/validates each parent component without symlinks, rejects a symlinked target and verifies the real parent; regression added. |
| 2 | P2 | New releases used numeric IDs in `releases.added`, violating the report schema. | Fixed. Added entries are `{id, tagName}` objects, sorted; schema and test agree. |
| 3 | P2 | Malformed comparison responses could yield a complete report. | Fixed. Comparison status, counts, totals and commit entries are validated; malformed data is an explicit incomplete error. Regression added. |
| 4 | P2 | Reviewed state budgets were ignored in favour of hard-coded ceilings. | Fixed. Effective limits are the minimum of hard ceilings, reviewed state limits and any tighter injected test limits; state-limit regression added. |
| 5 | P2 | Pagination completeness was wrong at the 200-commit boundary and when details were capped. | Fixed. Completeness uses validated `total_commits`; capped commit details are recorded as a cap rather than a completeness failure. |
| 6 | P2 | Licensing missed newly added/removed inventory outside the seven pinned paths. | Fixed. Added/removed/changed license, notice, manifest, lockfile and vendor paths now produce drift findings; regression added. |
| 7 | P2 | Report size was checked against compact JSON but pretty JSON was written. | Fixed. The collector serializes once, checks the exact bytes, emits a bounded compacted report if needed, and the CLI writes that serialization. |
| 8 | P2 | Equivalent tag inventories produced different fingerprints due to ordering. | Fixed. Unordered tag/release results are sorted before hashing; ordering-invariance regression added. |
| 9 | P2 | An enabled source did not have to match `import.sourceId`. | Fixed. Validator requires the single enabled source to be the import source; regression added. |
| 10 | P2 | Decision evidence could be empty and port tests could be non-strings. | Fixed. Decision evidence must be non-empty; port tests must be non-empty bounded strings. |
| 11 | P2 | Duplicate release IDs passed baseline validation. | Fixed. Duplicate IDs are rejected; regression added. |
| 12 | P2 | Ref validation accepted malformed Git refs. | Fixed. Branch and tag refs have separate bounded rules rejecting `..`, empty components, trailing dots/slashes and repeated slashes. |
| 13 | P2 | Network tests bypassed production response handling (streams, declared length, redirects). | Partially addressed. Added declared-content-length and full-response coverage; streamed cancellation, delayed reads and CLI exit-code tests remain a follow-up, documented as a limit. |

The plan text that overstated containment, licensing coverage and budget enforcement was corrected.

## Re-verification

- `node scripts/check-upstream-state.mjs` — exit 0, 0 errors.
- `node --test scripts/upstream-state.test.mjs` — 10/10 pass.
- `node --test scripts/upstream-watch.test.mjs` — 17/17 pass (offline mocks; no live GitHub call).
- `node scripts/check-docs.mjs`, `node scripts/check-progress.mjs`, `git diff --check` — pass.

## Limits

No live GitHub request, workflow, issue publication or parity decision is exercised. Streamed-body cancellation and CLI end-to-end exit codes remain incompletely covered. Automated review is not human approval; enabling any issue-writing publisher still requires owner review of the permission boundary.
