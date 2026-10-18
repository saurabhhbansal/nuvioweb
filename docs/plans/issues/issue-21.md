# Issue #21: [M4][P1] Implement isolated metered hosted processing jobs

**Plan status:** Proposed for agent review — no implementation/test evidence recorded.  
**Milestone:** M4 · **Priority:** P1  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/21  
**Workstream:** [M4 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Implement isolated metered hosted processing jobs

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

#20 credit ledger; #13 protocol; #19 benchmarks

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Planned interfaces and deliverables

services/hosted-compute; job scheduler; quotas; receipts; operational kill switch

The issue-owning agent must convert this initial artifact inventory into precise file paths, types/interfaces, test fixture IDs and API contracts after checking the imported codebase. Avoid introducing extra auth systems or central media relay as implicit dependencies.

## Detailed implementation sequence

1. Create guarded job scheduler with per-account concurrency and global budget stop
2. Run shared FFmpeg protocol executor on verified compute backend
3. Implement quoted maximum processing, cancellation, progress, output TTL and usage receipts
4. Keep direct, free playback available when hosted service unavailable

**Integration sequencing:** land the smallest verifiable unit first; update the plan if tests reveal a wrong assumption, then create separate follow-up issues for work outside scope.

## Functional acceptance criteria

- [ ] End-to-end staging paid-compute simulation works against authorized sample
- [ ] Job charge, result and refunds reconcile with ledger
- [ ] Operator media/egress budget cannot grow without bound

## Verification design

Request spoofing, job abuse, host failures, long duration, duplicate retry, cost kill switch and cross-account outputs.

**Evidence that must be attached before closure:** commands actually run, exit codes and assertions, tested browser/device versions if applicable, failures and workarounds. Do not mark a box checked based on static inspection alone.

## Threat, cost, privacy and licensing review

All payment and usage state requires authoritative identity, strict budgets, atomic ledger operations and explicit customer consent. Do not activate live billing without review.

Confirm no secrets are introduced, provider/API costs are bounded, third-party source licenses are preserved and users receive no unexpected paid action. Escalate platform authorization or payment-policy uncertainties instead of guessing.

## Telemetry, rollback and ownership

Capture bounded, redacted failure counters and trace IDs without exposing access tokens, media URL queries or personal playback metadata.

**Rollback:** Disable paid job intake, preserve ledger/audit records, settle or refund outstanding reservations according to terms, and keep free site live.

## Definition of done

- [ ] Dependency assumptions and interface/API contract verified against code or published upstream evidence.
- [ ] All issue acceptance criteria tested and documented.
- [ ] Negative/security/budget cases covered as relevant.
- [ ] Docs, compatibility notes and source provenance updated.
- [ ] Reviewed pull request linked to issue, with rollout and rollback evidence.
