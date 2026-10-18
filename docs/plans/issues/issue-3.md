# Issue #3: [M0][P0] Verify Nuvio hosted API usage terms and identity requirements

**Plan status:** Proposed for agent review — no implementation/test evidence recorded.  
**Milestone:** M0 · **Priority:** P0  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/3  
**Workstream:** [M0 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Verify Nuvio hosted API usage terms and identity requirements

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

Approved charter; no production tokens

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Planned interfaces and deliverables

docs/NUVIO_IDENTITY_CONTRACT.md; documented nonsecret API flow and verified-subject claims

The issue-owning agent must convert this initial artifact inventory into precise file paths, types/interfaces, test fixture IDs and API contracts after checking the imported codebase. Avoid introducing extra auth systems or central media relay as implicit dependencies.

## Detailed implementation sequence

1. Document Nuvio third-party usage requirements and public-service constraints
2. Map existing Supabase-compatible auth, session refresh and get_sync_owner contract
3. Determine authoritative stable subject verification process for our control plane
4. Record fallback if hosted API permission is unavailable

**Integration sequencing:** land the smallest verifiable unit first; update the plan if tests reveal a wrong assumption, then create separate follow-up issues for work outside scope.

## Functional acceptance criteria

- [ ] Public use constraints are explicitly documented rather than assumed
- [ ] Stable authenticated identity and consent boundaries specified
- [ ] No new Nuvio password database proposed

## Verification design

Use redacted test credentials only with permission; create a contract test plan; do not store tokens in issue.

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
