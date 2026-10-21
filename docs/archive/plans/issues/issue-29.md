# Issue #29: Remediate audited build-tool dependency advisories before release

**Plan status:** In progress on `m1/issue-29-dependency-advisories` after baseline PR #30 and recovery PR #32 merged. The original local patch was preserved unchanged during the audit.
**PR:** https://github.com/saurabhhbansal/nuvioweb/pull/33 (proposed completion until protected merge).
**Issue:** https://github.com/saurabhhbansal/nuvioweb/issues/29

## Objective, scope and dependency

The unchanged #5 lockfile reports eight affected build-tool package records (5 high, 2 moderate, 1 low); runtime-only audit reports zero. Preserve #5 as the historical baseline and apply a separate, reviewed dependency patch. No auth, payment, plugin sandbox, remote-fetch, compute-isolation, runtime feature, deployment or production account changes.

## Target files and contracts

- `app/alpha/package.json`, `app/alpha/package-lock.json`: minimum dependency changes needed to remove observed advisories. Only esbuild's existing manifest range is known to require an out-of-range update; review every resolved version/integrity/license change before clean installation.
- `.github/workflows/alpha.yml` and `.github/workflows/browser.yml`: audit application and root browser-tooling lockfiles after install, blocking reported advisories rather than masking them.
- `docs/DEPENDENCY_REMEDIATION.md`: exact old/new versions, license delta, advisory evidence and actual commands/results.
- `UPSTREAM_SOURCES.md`, `TRACKER.md`, `docs/FEATURE_SUPPORT.md`, baseline evidence: record local package/lockfile patches while retaining the original source pin, pristine import commit/tag and historical results.
- This plan and the issue index: link scope, acceptance evidence and PR.

No application API changes. Runtime dependency specifications, upstream JS source/tests, browser configuration and license files stay intact unless a demonstrated compatibility failure requires a separately reviewed change.

## Implementation and verification sequence

1. Preserve `/tmp/nuvioweb-issue-5-logs/audit.json` as the red-capable starting evidence: `npm audit --json` exits 1 with eight affected package records; `npm audit --omit=dev --json` exits 0.
2. Run non-force `npm audit fix --package-lock-only --ignore-scripts` on the pinned Node 22.23.1/npm 10.9.8 toolchain, inspect its exact diff and remaining advisories. Do not use `--force` or automatic unrelated major upgrades.
3. Upgrade esbuild explicitly to reviewed 0.28.2 only if still required. Authoritative [0.28.1 release](https://github.com/evanw/esbuild/releases/tag/v0.28.1) fixes the cited Windows development-server traversal; [0.28.2 release](https://github.com/evanw/esbuild/releases/tag/v0.28.2) is the subsequent patch. The full build is the compatibility check; no server is deployed.
4. Compare all lockfile package entries and direct dependency specifications against #5. Verify license metadata, exact registry integrity fields and changed package notice files; document added/removed components and any unresolved license gate. Revert unintended changes before proceeding.
5. Run clean `HUSKY=0 npm ci`, inert-fixture `npm run build`, `node ../../scripts/check-alpha-build.mjs`, complete `npm test`, `npm run lint`, and both full/runtime-only `npm audit --json` commands. No test skips or weakened assertions.
6. Add the full audit CI gate. Run root docs tests/checker, explicit provenance links and local patch whitespace checks. Open a scoped draft PR; require all four protected app/audit/docs/governance/browser contexts before merge. Update the protected progress ledger with acceptance evidence and a matching PR; close explicitly after merge, using Refs in commit/PR text.

## Acceptance criteria

- [x] Full application/runtime and root tooling audits report zero advisories after clean installation.
- [x] Exact 36-version/zero-license-change delta, verified tarballs/notices and two upstream metadata patch paths documented.
- [x] Clean install, build, 1,079-test upstream suite, lint, artifact/config checks and both audits pass.
- [x] Application/audit/docs CI passes on the PR; no runtime code/assertions changed to obtain success.

## Risks, costs and rollback

New build-tool versions may change minification or generated assets; full build/tests validate the inherited baseline, while real browser/device compatibility and complete release notices remain separate gates. Registry license metadata is not full bundled-source clearance. No compute/payment/deployment cost is introduced. Roll back by reverting this scoped PR, restoring the #5 lockfile; preserve the source history/tag and the audit record. No force pushes.

## Recovery/resumption checkpoint

Owner recovery issue #31 completed through protected PR #32. False issue closures were repaired and four mandatory CI contexts are enforced for admins. The previously uncommitted #29 diff and plan matched their backups before resumption. The postponed clean install completed under the restored approval service; the earlier lockfile-only audit was kept separate from subsequent installation/test evidence. Real Chromium smoke from #31 is now required alongside the existing suite. No sensitive implementation or production deployment is introduced.

## Executed verification after resumption

Clean install and configured build passed; lint unchanged passed. Full application/runtime and root-tooling audits exit 0 with zero reported advisories. All ten non-platform changed notice files match integrity-verified registry tarballs. Chromium smoke passes 4/4; governance/docs regressions pass 15/15; artifact/ledger/docs/whitespace checks pass. Full upstream suite passed 1,079/1,079 with zero failures/skips in 46.7 seconds. All four protected contexts passed at 6f94ebd: app/audit 40s, Chromium 44s, docs 9s, governance 16s; final documentation-only head is rechecked before merge. See [dependency report](../../DEPENDENCY_REMEDIATION.md).

## Automated review

Standards: zero findings; independently checked dependency/license delta and evidence. Spec: zero findings; acceptance scope matches #29. Both reviews are automated, not independent human approval. Protected PR CI passed on the implementation/evidence head; the final documentation-only head remains subject to all four enforced contexts.
