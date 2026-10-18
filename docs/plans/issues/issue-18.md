# Issue #18: [M3][P2] Evaluate optional desktop compute companion

**Plan status:** Proposed for agent review — no implementation/test evidence recorded.  
**Milestone:** M3 · **Priority:** P2  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/18  
**Workstream:** [M3 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Evaluate optional desktop compute companion

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

#13 protocol; #14 pairing; #15 agent

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Planned interfaces and deliverables

apps/desktop-agent spike and packaging/security decision document; signed helper proof-of-concept

The issue-owning agent must convert this initial artifact inventory into precise file paths, types/interfaces, test fixture IDs and API contracts after checking the imported codebase. Avoid introducing extra auth systems or central media relay as implicit dependencies.

## Detailed implementation sequence

1. Compare local agent/installer vs browser extension+native helper for Windows/macOS/Linux
2. Specify signed install/update/uninstall and automatic lifecycle model
3. Prototype packaging and one-time device pairing with a legal fixture
4. Document security tradeoffs and background process consent

**Integration sequencing:** land the smallest verifiable unit first; update the plan if tests reveal a wrong assumption, then create separate follow-up issues for work outside scope.

## Functional acceptance criteria

- [ ] Feasibility report and minimal proof-of-concept recorded
- [ ] No browser extension claims to run unrestricted FFmpeg by itself
- [ ] Safe uninstall and key revocation work

## Verification design

App install/pair/run/exit, revoked device, OS permissions and update signature verification.

**Evidence that must be attached before closure:** commands actually run, exit codes and assertions, tested browser/device versions if applicable, failures and workarounds. Do not mark a box checked based on static inspection alone.

## Threat, cost, privacy and licensing review

Strong device isolation and scoped pairing: prevent public remote shell/proxy, expensive uncontrolled jobs, replay, account confusion and leaked signed sources.

Confirm no secrets are introduced, provider/API costs are bounded, third-party source licenses are preserved and users receive no unexpected paid action. Escalate platform authorization or payment-policy uncertainties instead of guessing.

## Telemetry, rollback and ownership

Capture bounded, redacted failure counters and trace IDs without exposing access tokens, media URL queries or personal playback metadata.

**Rollback:** Revoke affected paired device credentials and disable compute routing; maintain free local/direct playback.

## Definition of done

- [ ] Dependency assumptions and interface/API contract verified against code or published upstream evidence.
- [ ] All issue acceptance criteria tested and documented.
- [ ] Negative/security/budget cases covered as relevant.
- [ ] Docs, compatibility notes and source provenance updated.
- [ ] Reviewed pull request linked to issue, with rollout and rollback evidence.
