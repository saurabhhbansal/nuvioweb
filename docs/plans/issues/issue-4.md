# Issue #4: [M1][P0] Import pinned Alpha NuvioWeb browser baseline with attribution

**Plan status:** Approved layout `app/alpha`; implementation in progress on `m1/issue-4-alpha-import`.
**Milestone:** M1 · **Priority:** P0  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/4  
**Workstream:** [M1 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Import pinned Alpha NuvioWeb browser baseline with attribution

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

M0-01

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Concrete implementation plan (2026-10-18)

Issue #1 is merged in PR #27. The owner confirmed `app/alpha` and authorized GitHub pushes/merges. Import the approved Alpha `web` pin `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff`, with no source edits or feature rewrites.

### Target files and interfaces

- `app/alpha/`: complete upstream tree, including GPL license, notices, source, tests, lockfile and nested upstream docs/workflows; these nested workflows do not run as this repository's Actions.
- Git history: nonsquashed `git subtree add`, retaining upstream as a parent; immutable tag `upstream/alpha-web-5624da2` pushed to origin.
- `UPSTREAM_SOURCES.md`: confirmed destination, actual import commit/tree and executed checks.
- `README.md`, `TRACKER.md`, `docs/UPSTREAM.md`, `docs/ARCHITECTURE.md`: record source availability and distinguish it from a tested/shipped app.
- `docs/FEATURE_SUPPORT.md`: initial evidence matrix; imported code is not browser/device verification.
- This plan: exact commands/results and linked PR.

No API contract changes: preserve every upstream byte and mode. Root CI remains documentation-only until #5. No dependency install, live auth/API calls, deployment, paid compute, plugin execution, or build fixes in #4. Application build/lint/tests follow as a separate issue #5 PR.

### Sequence and required verification

1. Re-fetch origin and Alpha `web`; confirm current branch tip and approved pin, license SHA-256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`, tree `ad9ff4cea2781cf85010f49b61c315c9bc332e86`, 605 tracked files and 999 reachable commits. Do not silently advance the pin.
2. Commit this plan before source changes so subtree import starts from a clean worktree.
3. Run `git subtree add --prefix=app/alpha 5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff` without `--squash`; tag the original pin. Keep all source notices intact.
4. Run tree comparison, ancestry check, file-count/license assertions and `git fsck --full`; record actual import commit. Verify root docs/scripts are unaffected by the import commit itself.
5. Update provenance/status/evidence matrix. Run `node --test scripts/check-docs.test.mjs`, `node scripts/check-docs.mjs`, explicit provenance-link validation and `git diff --check` restricted to our docs (upstream whitespace is not rewritten).
6. Open a draft PR, verify Node 22 CI, mark ready and announce/perform the authorized merge **with a merge commit**. Squash/rebase merging would drop the upstream ancestry and is prohibited for this PR. Verify ancestry and subtree tree equality again on merged main.

### Risks, costs and rollback

Preserved source includes original hosted-auth and native/sidecar integrations; importing it does not approve public backend use or attest to those components' security. The prior [license audit](../../UPSTREAM_LICENSE_AUDIT.md) remains a release gate. No service is deployed or called. Revert the eventual PR merge using first-parent semantics, retaining shared source history/tag and attribution; never force-push to remove provenance.

## Functional acceptance criteria

- [ ] Upstream source and reference commit are traceable
- [ ] License and copyright files retained
- [ ] Diff to imported baseline is understood and documented

## Verification design

Compare file manifest/commit metadata to upstream; run repository integrity checks.

**Evidence that must be attached before closure:** commands actually run, exit codes and assertions, tested browser/device versions if applicable, failures and workarounds. Do not mark a box checked based on static inspection alone.

## Threat, cost, privacy and licensing review

Existing Nuvio hosted auth is an external service; avoid secrets in build artifacts, account leakage, legal-license regressions and broken browser caching.

Confirm no secrets are introduced, provider/API costs are bounded, third-party source licenses are preserved and users receive no unexpected paid action. Escalate platform authorization or payment-policy uncertainties instead of guessing.

## Telemetry, rollback and ownership

Capture bounded, redacted failure counters and trace IDs without exposing access tokens, media URL queries or personal playback metadata.

**Rollback:** Revert feature changes to pinned imported upstream baseline, redeploy previous staging artifact, and preserve auth/token isolation.

## Definition of done

- [ ] Dependency assumptions and interface/API contract verified against code or published upstream evidence.
- [ ] All issue acceptance criteria tested and documented.
- [ ] Negative/security/budget cases covered as relevant.
- [ ] Docs, compatibility notes and source provenance updated.
- [ ] Reviewed pull request linked to issue, with rollout and rollback evidence.
