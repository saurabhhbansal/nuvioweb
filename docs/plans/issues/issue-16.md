# Issue #16: [M3][P1] Publish Bring Your Own Cloudflare Worker Lite template

**Plan status:** Proposed for agent review — no implementation/test evidence recorded.  
**Milestone:** M3 · **Priority:** P1  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/16  
**Workstream:** [M3 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Publish Bring Your Own Cloudflare Worker Lite template

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

#13 protocol; #14 pairing

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Planned interfaces and deliverables

deploy/cloudflare-lite; audited Worker template, Cloudflare Deploy instructions and resource binding list

The issue-owning agent must convert this initial artifact inventory into precise file paths, types/interfaces, test fixture IDs and API contracts after checking the imported codebase. Avoid introducing extra auth systems or central media relay as implicit dependencies.

## Detailed implementation sequence

1. Design no-secret-in-browser user-owned control Worker template
2. Deploy on test Cloudflare account, verify minimal permissions and resource bindings
3. Provide Deploy-to-Cloudflare instructions and clearly list supported operations
4. Confirm no FFmpeg/video transcode promise in Worker Lite

**Integration sequencing:** land the smallest verifiable unit first; update the plan if tests reveal a wrong assumption, then create separate follow-up issues for work outside scope.

## Functional acceptance criteria

- [ ] Fresh own-account deployment is reproducible
- [ ] User-owned Worker can pair with existing Nuvio identity securely
- [ ] Deployment limitations and direct provider charges clear

## Verification design

Template deploy and remove, secret rotation, restricted destinations, request size and high-rate rejection.

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
