# Issue #19: [M4][P0] Benchmark compute cost and design user-facing prepaid quotes

**Plan status:** Proposed for agent review — no implementation/test evidence recorded.  
**Milestone:** M4 · **Priority:** P0  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/19  
**Workstream:** [M4 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Benchmark compute cost and design user-facing prepaid quotes

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

#15 Docker agent; #13 protocol

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Planned interfaces and deliverables

docs/compute-benchmarks; benchmark harness, authorized fixtures and internal costing spreadsheet/schema

The issue-owning agent must convert this initial artifact inventory into precise file paths, types/interfaces, test fixture IDs and API contracts after checking the imported codebase. Avoid introducing extra auth systems or central media relay as implicit dependencies.

## Detailed implementation sequence

1. Benchmark audio-only, remux, subtitle, SDR/HDR representative processing on Cloudflare Containers and an alternative
2. Measure CPU/memory/disk duration, data ingress/egress, cold start and failure retry cost
3. Calculate internal unit cost including ops/LLM allocations without promising specific current prices
4. Define published maximum per-job quote, reserve/refund and cancellation language

**Integration sequencing:** land the smallest verifiable unit first; update the plan if tests reveal a wrong assumption, then create separate follow-up issues for work outside scope.

## Functional acceptance criteria

- [ ] Cost model grounded in measurement, not guesswork
- [ ] User-facing charges and limits are clear while internal supplier rates remain private
- [ ] No unlimited video conversion plan

## Verification design

Cost accounting reconciliation on synthetic legal workloads; quota simulation under high concurrency.

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
