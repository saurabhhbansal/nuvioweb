# Issue #31: Recover roadmap integrity and browser evidence

**Status:** In progress on `audit/recover-progress`, based on main `c924a4b`.
**Issue:** https://github.com/saurabhhbansal/nuvioweb/issues/31

## Scope and recovered state

Owner-requested audit before resuming #29. GitHub timeline confirms #12/#13/#15 closed from unrelated imported commit messages, while #1/#2/#4/#5 closed through their intended merged PRs. Main is unprotected; there is one collaborator and no recorded PR reviews. #29's package/audit changes remain untouched in the original worktree; #3 has an unmerged documentation commit in another worktree.

## Target files and interfaces

- `docs/PROGRESS.json`, `scripts/check-progress.mjs`: authoritative issue state/evidence/dependency ledger, validated in CI; verified completion requires merged-PR and verification references, not GitHub closed labels.
- `TRACKER.md`, `docs/RECOVERY_AUDIT.md`, `docs/FEATURE_SUPPORT.md`, this plan: full ticket accounting, timeline receipts, recovered branch state, milestone distinctions, browser journey observations and effort forecast.
- `scripts/check-commit-references.mjs` plus focused tests: scan all newly reachable commit messages, including imported ancestry, for local closing directives. Fail before merging unresolved collisions; preserve existing upstream commits unchanged.
- `.github/workflows/governance.yml`, `scripts/guard-issue-closure.mjs`: CI ledger/history checks and a least-privileged default-branch closed-issue guard that reopens unsupported closures. The guard cannot prevent GitHub's transient close event; preflight blocks historical collisions and the ledger prevents false completion accounting.
- `.github/PULL_REQUEST_TEMPLATE.md`, `AGENTS.md`, `docs/QUALITY_GATES.md`: manual evidence-based issue closure, honest automated review limitations and human review checkpoints for sensitive code.
- Root `package.json`/lock, `playwright.config.mjs`, `tests/browser/*`, dedicated browser CI: first reproducible real Chromium startup/navigation smoke against built static files with all live external services blocked. Broader auth/add-on/playback/CORS coverage grows only where actual deterministic fixtures and observations support it.
- GitHub settings: require existing successful app/docs checks with strict base freshness, enforce for admins, require PRs with zero independent approvals for this one-maintainer repository, prohibit force pushes/deletion. Add governance/browser checks after their first successful run. No bypass lists or fabricated approvals.

## Sequence and verification

1. Save read-only repository/issue/PR/timeline/settings snapshots under `/tmp`; inspect actual plans/artifacts and every closed roadmap issue. This inspection is complete before mutations.
2. Reopen #12/#13/#15 with concise commit/acceptance explanations. Configure supported protection API and read back applied settings. Document that automated agent review is not independent human approval.
3. Add ledger/history/closure controls with meaningful fixtures covering incomplete, missing, unmerged and verified completion evidence plus historical import collisions. Tests must fail unsafe cases.
4. Install pinned browser tooling separately from the imported app; build the existing inert backend fixture. Browser smoke uses a real browser, loopback static/fixture servers, and no hosted account/media. Observe failures before changing any application behavior; no auth/runtime security modifications are in this audit.
5. Run governance tests/checks, root docs checks, app build/artifact checks and browser smoke. Record exact versions/results and limitations. Preserve inherited tests as baseline evidence only.
6. Open scoped draft PR, obtain automated review clearly labelled as such, and pass all configured CI. Integrate only through the protected PR workflow. Mark audit verified only when its acceptance evidence is complete, then resume #29 on its existing branch.

## Acceptance

- [x] Closure causes and remaining closed issues individually verified; false completions reopened.
- [x] Main protections applied/read back; review limits and required human checkpoints documented.
- [x] Completion ledger, commit preflight and closure decision logic covered by six focused regressions; workflows added, remote execution pending.
- [x] Four real Chromium smoke tests passed locally with zero skips; live auth/add-on/media/compatibility limits explicit.
- [x] Complete 26-ticket ledger/tracker, dependencies, external blockers and confidence-bounded milestone forecast written.
- [ ] Automated review, CI and merge evidence attached without claiming independent approval.

## Risks, costs and rollback

Only repository governance, tests and documentation change. No production deployment, paid services, live identities, plugin execution, remote-fetch implementation or compute infrastructure. A browser smoke is not hosted-auth or cross-device verification. GitHub's documented auto-close UI toggle has no verified public API and does not establish suppression of commit-message closures, so do not rely on an invented setting. Rollback is a scoped revert through protected PRs; do not disable protections or rewrite upstream history to get a merge through. Preserve #29 and #3 worktrees.

## Executed local evidence

- Read-only GitHub issue/PR/branch/settings/timeline snapshots and recent CI inspected; original main `c924a4b`. Other worktree #3 commit preserved; original #29 diff backed up and untouched.
- #12/#13/#15 reopened with precise historical closer receipts. All other closed roadmap tickets matched intended merged evidence PRs.
- Main protection PUT succeeded and GET verified strict Actions-bound checks, administrator enforcement, required PRs, zero independent approvals, no force/deletion and conversation resolution.
- `node --test scripts/governance.test.mjs scripts/check-docs.test.mjs` — 12 passed / 0 failed / 0 skipped. Synthetic unrelated-history fixture proves non-first-parent references are scanned. The actual historic import range also returned exit 1 with the known offending commits, as intended.
- `node scripts/check-progress.mjs`, `node scripts/check-docs.mjs`, `node scripts/check-alpha-build.mjs`, and `git diff --check` — passed. Application subtree has no local changes in this recovery.
- Root `npm install` — pinned Playwright 1.64.0; three packages installed, zero reported tooling advisories. Unchanged app `HUSKY=0 npm ci` and inert-fixture build passed; original eight build-tool advisories intentionally remain for #29.
- `npm run test:browser` — four real Chromium tests passed, no failures/skips, 17.4 seconds. First guest-test assumptions/selectors were corrected to the observed existing public flow; no application code or acceptance assertions were suppressed.

No deployed service or live account was tested. CI, required-context additions and automated review findings will be attached to the recovery PR before integration.
