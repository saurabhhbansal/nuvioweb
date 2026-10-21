# Issue #2: [M0][P0] Set up GitHub CI, PR review, and docs verification

**Plan status:** Implementation in progress on `m0-issue-2-docs-ci`; test evidence belongs in the review PR and GitHub Actions run.  
**Milestone:** M0 · **Priority:** P0  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/2  
**Workstream:** [M0 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Set up GitHub CI, PR review, and docs verification

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

Initial docs committed

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Concrete design (2026-10-18)

- `scripts/check-docs.mjs`: dependency-free Node 22 verifier of repository-local inline Markdown links in root guides, docs and GitHub templates. External URLs and same-page fragment links are intentionally not fetched; links escaping repo root must fail.
- `scripts/check-docs.test.mjs`: fixture-based unit tests for valid links, broken links, external URLs and traversal rejection.
- `.github/workflows/docs.yml`: least-privileged read-only PR/push GitHub Action running the verifier and unit tests; no cloud credentials, npm install or user data.
- This first increment does not configure branch protection; the repository owner must enable required checks and review rules in GitHub Settings after verifying the workflow.
- **Verification:** run Node 22 tests and checker on an actual PR; change one fixture to a broken link and confirm the test detects it. No claim of passing GitHub CI until a run completes.

## Planned interfaces and deliverables

.github/workflows/docs.yml; scripts/check-docs.*; PR checks documentation

The issue-owning agent must convert this initial artifact inventory into precise file paths, types/interfaces, test fixture IDs and API contracts after checking the imported codebase. Avoid introducing extra auth systems or central media relay as implicit dependencies.

## Detailed implementation sequence

1. Add minimal documentation links and formatting verification
2. Define CI workflow with least permissions and pinned relevant tooling
3. Add PR check instructions and evidence summary template
4. Require human review on security- or payment-sensitive areas

**Integration sequencing:** land the smallest verifiable unit first; update the plan if tests reveal a wrong assumption, then create separate follow-up issues for work outside scope.

## Functional acceptance criteria

- [ ] Docs validation runs on a test pull request
- [ ] CI permissions and secrets are minimal
- [ ] Release gates documented; no unreviewed production merge policy assumed

## Verification design

Execute docs checks and record GitHub Actions run URL; simulate bad link or malformed doc case.

**Evidence that must be attached before closure:** commands actually run, exit codes and assertions, tested browser/device versions if applicable, failures and workarounds. Do not mark a box checked based on static inspection alone.

## Threat, cost, privacy and licensing review

Source facts can become stale; URLs, license ownership or API permissions must not be assumed. Scope work to documentation and verification without production credentials.

Confirm no secrets are introduced, provider/API costs are bounded, third-party source licenses are preserved and users receive no unexpected paid action. Escalate platform authorization or payment-policy uncertainties instead of guessing.

## Telemetry, rollback and ownership

Capture bounded, redacted failure counters and trace IDs without exposing access tokens, media URL queries or personal playback metadata.

**Rollback:** Revert incorrect docs/tooling configuration and update GitHub issue; preserve transparent investigation history.

## Definition of done

- [ ] Dependency assumptions and interface/API contract verified against code or published upstream evidence.
- [ ] All issue acceptance criteria tested and documented.
- [ ] Negative/security/budget cases covered as relevant.
- [ ] Docs, compatibility notes and source provenance updated.
- [ ] Reviewed pull request linked to issue, with rollout and rollback evidence.
