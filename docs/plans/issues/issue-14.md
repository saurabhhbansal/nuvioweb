# Issue #14: [M3][P0] Implement Nuvio-verified agent pairing, grants and revocation

**Plan status:** Proposed for agent review — no implementation/test evidence recorded.  
**Milestone:** M3 · **Priority:** P0  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/14  
**Workstream:** [M3 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Implement Nuvio-verified agent pairing, grants and revocation

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

#13 compute protocol; #3 identity verification

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Planned interfaces and deliverables

services/control-api: Nuvio subject verifier; pair/revoke routes; agent credentials and audit events

The issue-owning agent must convert this initial artifact inventory into precise file paths, types/interfaces, test fixture IDs and API contracts after checking the imported codebase. Avoid introducing extra auth systems or central media relay as implicit dependencies.

## Detailed implementation sequence

1. Specify authoritative existing Nuvio access-token validation and stable subject mapping
2. Add expiring single-use pairing code and explicit account approval
3. Generate per-agent revocable, scoped grants; no Nuvio refresh-token sharing
4. Test replay/cross-account/session expiry/key rotation

**Integration sequencing:** land the smallest verifiable unit first; update the plan if tests reveal a wrong assumption, then create separate follow-up issues for work outside scope.

## Functional acceptance criteria

- [ ] One valid Nuvio session securely pairs one agent
- [ ] Revoked agent cannot run another job
- [ ] No additional login/password database exists

## Verification design

Fake/expired token, guessed code, stolen lease, stale profile, replayed nonce and key rotation.

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
