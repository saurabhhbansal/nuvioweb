# Issue #1: [M0][P0] Validate upstream licenses, provenance, and import strategy

**Plan status:** Proposed for agent review — no implementation/test evidence recorded.  
**Milestone:** M0 · **Priority:** P0  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/1  
**Workstream:** [M0 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Validate upstream licenses, provenance, and import strategy

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

Docs foundation

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Planned interfaces and deliverables

docs/UPSTREAM.md; UPSTREAM_SOURCES.md at the future import; GPL-3.0 LICENSE and copyright inventory

The issue-owning agent must convert this initial artifact inventory into precise file paths, types/interfaces, test fixture IDs and API contracts after checking the imported codebase. Avoid introducing extra auth systems or central media relay as implicit dependencies.

## Detailed implementation sequence

1. Inspect Alpha GPL-3.0 licensing and copyright notices plus dependency licenses at pinned web commit
2. Choose source-history-preserving import strategy and write UPSTREAM_SOURCES.md contract
3. Document acceptable source reuse from Falcon/GYK and AGPL differences with Orochi

**Integration sequencing:** land the smallest verifiable unit first; update the plan if tests reveal a wrong assumption, then create separate follow-up issues for work outside scope.

## Functional acceptance criteria

- [ ] Reproducible source SHA and import procedure are documented
- [ ] Required license files/notices are listed and will be preserved
- [ ] Dependency reuse constraints are recorded before source import

## Verification design

Validate cited source files and resulting provenance manifest; no upstream code imported in this issue.

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
