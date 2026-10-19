# Issue #7: [M1][P0] Validate existing Nuvio login, sync and profile isolation

**Plan status:** Selected for live verification; owner reports initial manual checks passed, further evidence pending.  
**Milestone:** M1 · **Priority:** P0  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/7  
**Workstream:** [M1 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Validate existing Nuvio login, sync and profile isolation

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

M1-03; M0-03

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Planned interfaces and deliverables

Auth/sync contract tests, account isolation regression suite, token storage threat model

The issue-owning agent must convert this initial artifact inventory into precise file paths, types/interfaces, test fixture IDs and API contracts after checking the imported codebase. Avoid introducing extra auth systems or central media relay as implicit dependencies.

## Detailed implementation sequence

1. Exercise email/session refresh/QR paths that upstream provides and browser permits
2. Check sync owner, device registration, profile switching and library state
3. Test sign-out and switching between accounts without stale data leakage
4. Threat-model localStorage token and XSS exposure

**Integration sequencing:** land the smallest verifiable unit first; update the plan if tests reveal a wrong assumption, then create separate follow-up issues for work outside scope.

## Functional acceptance criteria

- [ ] Existing Nuvio account is the only user login
- [ ] Profiles/addons/watch history synchronize as tested
- [ ] No cross-account library or session leakage

## Verification design

Authorized test identities and browser sessions; expired token, offline auth, refresh rejection and profile switch cases.

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

## Inspected execution plan — 2026-10-19, before verification code

Base maincdd6615 includes owner-reviewed PR42. Dependency6 public preview and3 identity documentation are verified; preview currently serves8edec42, so record that deployed revision rather than claiming PR42 is deployed. Owner reports sign-in, reload persistence and same-account profile display in Windows/Edge; browser version/session setup unspecified. Owner explicitly authorized account tests and populated a600-mode local JSON file outside Git. No credential/email/token enters plans, issue comments, shell arguments, diagnostics or agents. Aliases A/B only.

### Targets, contract and scope

1. Read-only inspection: pinned `js/core/auth/authManager.js`, `accountLocalDataReset.js`, `core/storage/sessionStore.js`, `ui/screens/account/authSignInScreen.js`, profile navigation and existing auth/sync tests. Keep existing Nuvio password exchange and hosted identity; no duplicate identity, backend, fallback host or control-plane verifier.
2. Bounded local live driver in `/tmp/nuvioweb-issue7-live.mjs` (not bundled/published): read supplied credential file in memory only after checking regular file, owner,600-equivalent permissions and16KiB cap. Read aliases A/B, never echo fields. Playwright isolated nonpersistent contexts, no screenshots, traces, video, HAR, storageState or browser-console forwarding. Disable debug logging. Generic stage codes on failures, never raw Playwright errors that might contain input values.
3. Allow HTTPS requests only to exact public-preview origin and `https://api.nuvio.tv`; block other traffic/redirect recipients. Record only allowlisted operation labels, statuses and booleans/counts. No request bodies, Authorization values, signed URLs, account names/emails/IDs or session data. Do not export or decode real JWTs. Secrets never sent to processing/review agents.
4. First live pass: verify preview revision/config before credentials; actual deployed email/password form for A and B independently, successful password exchange + sync-owner response, signed-in navigation, reload persistence and isolated contexts. Read only structural presence/counts of profiles/library/add-ons/history; counts alone cannot prove sync or isolation. No library/profile/add-on writes, QR approval, account deletion, password change, paid action or live media. Stop after a rejected login/network blocker rather than retrying credentials repeatedly.
5. Completed account switch uses actual Settings Sign Out then B Sign In in the same isolated context without clearing storage. Compare private markers in memory only and report booleans; distinguish intentional local/shared settings from private account namespaces. Fresh A/B views provide controls. If read-only data is insufficient to identify cross-account leakage, record that limit and use owner-observed distinct markers or a separately documented reversible test-data step. Never infer isolation from empty lists or unequal counts alone.
6. Complementary synthetic `authManager`/storage/sync tests will be scoped after observed evidence and written plan amendment: expiry/rejected refresh, owner parsing, delayed responses across logout/account switch, offline behavior and profile namespaces. A simple reload is persistence, not measured token refresh/revocation. If a regression fails, record red result and diagnosis before minimal auth changes; sensitive fixes retain owner review.
7. Record sanitized evidence in `docs/evidence/identity-live-2026-10-19.json` and a readable `docs/IDENTITY_VERIFICATION.md` only after actual observations. Update plan, FEATURE_SUPPORT, PROGRESS/TRACKER with partial/blocked/completed distinctions. Issue7 remains open until all acceptance criteria have evidence and human auth review. Do not treat this read-only pass or inherited tests as completion.

### Tests, threats, rollback and checkpoints

Pinned Node22.23.1/npm10.9.8, Playwright1.64.0/local Chromium156. Run the live driver once per stage/alias with bounded45s wait and explicit authorized network access; no broad retry. Commands contain only file path, never secrets. Required docs/governance/ledger/ancestry/whitespace validation for evidence-only changes; meaningful targeted auth regressions and full build/lint/browser/application suite if runtime auth changes. Public service errors are blockers/evidence, not reasons to weaken assertions or switch credential recipients.

LocalStorage tokens remain XSS-readable in upstream browser architecture; ephemeral test contexts do not eliminate that product risk. Remote logout/revocation is not established by client token removal. Avoid account cross-contamination, stale async callbacks, API overuse and accidental disclosure in error traces. No new service/proxy/compute/billing or external outreach. Rollback local verification by closing contexts; remove only any explicitly created test markers if later authorized. Do not revoke real sessions/delete existing user data. Runtime fixes, if needed, get a separate scoped reviewed PR and protected revert path. Preserve Alpha source/history/license mapping.
