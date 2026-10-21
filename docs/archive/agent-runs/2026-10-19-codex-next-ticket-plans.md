# Codex planning runs for tickets #12, #13 and #23 — 2026-10-19

Three read-only Codex CLI runs were used to draft pre-code plans while GitHub Actions was degraded. They made no file changes, network calls, installs, tests or deployments. This record is automated planning, not human approval.

## Invocations

`CODEX_HOME=$PWD/.codex-home codex exec --sandbox read-only --skip-git-repo-check --output-last-message dist/tools/codex-plan-issue<N>.md - < prompt`

- Version: codex-cli 0.163.0.
- Base: `main`/`4eeff8e`; the checkout also held the unmerged #11 unit 6a branch. The #12 plan explicitly excludes those changes; #13 notes the four-commit-ahead checkout and treats unmerged files as non-evidence.
- Prompts required implementation-grade plans with verified current state, decomposed units, contracts, tests, threats, non-goals, dependency gates and rollback, and forbade code, installs and network access.
- Outputs (git-excluded): `dist/tools/codex-plan-issue12.md` (49KB), `issue13.md` (39KB), `issue23.md` (29KB).

## Disposition

The drafts were spot-checked for fabricated references, secrets, unsafe network/compute suggestions and overclaiming:

- `docs/plans/issues/issue-12.md` — audio recovery and container remux plan; explicitly rejects the LGPL Falcon/libmedia WASM route, avoids transcode/proxy/DRM scope, and treats alternate-audio recovery as distinct from codec conversion. It flags that #10 must be genuinely closed or have a documented dependency decomposition before implementation.
- `docs/plans/issues/issue-13.md` — protocol-only plan with a versioned envelope, strict lease/state machine, offline fixtures and explicit exclusions (no hosted compute, billing, verifier or agent implementation). Absolute host paths in its links were rewritten to repository-relative links.
- `docs/plans/issues/issue-23.md` — scheduled read-only upstream monitoring with a single bounded tracker update, no auto-import/merge, and an explicit owner review before any `issues: write` permission is enabled.

Each plan was appended under a visible "Codex read-only draft" header stating that it is unexecuted and must be re-verified and amended before source changes. `node scripts/check-docs.mjs` and `node scripts/check-progress.mjs` pass after link normalisation.

## Limits

- No plan was executed and none of its file paths or API guesses should be treated as verified implementation.
- No test, browser or deployment evidence is claimed.
- Automated planning and review are not independent human approval; sensitive areas (new privileges, credentials, compute, payment) remain owner-gated.
- PR checks were queued during a GitHub Actions degradation, so integration waits for CI recovery.
