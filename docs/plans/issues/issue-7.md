# Issue #7: [M1][P0] Validate existing Nuvio login, sync and profile isolation

**Plan status:** Live session/profile checks passed; sync and synthetic lifecycle verification in progress.
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

### Live first-pass results and next bounded verification

The private driver passed13 scoped observations on deployed8edec42 in Chromium156.0.8078.4/LinuxARM64: A/B exact login-identity match, reload persistence, A in independent context with equal profiles, local logout token removal, A→B→A matching fresh controls. A has3 profiles and B1; private salted fingerprints compared in memory, never exported. Existing account data was not edited. Library/add-on/history/expiry/revocation remain unverified; no evidence from counts alone.

Next live read-only pass may select primary profile1 using actual UI, dismiss local Quick Setup if needed, open Library and wait for the existing cloud-pull operations. Compare existing profile-scoped Library/add-on/history identity sets privately across fresh A, independent A, fresh B and switched contexts; expose only booleans/counts. Do not install add-ons, mark watched, modify library, change PINs/preferences or follow external provider/media links. If no distinct existing markers or unavailable pulls, record the exact gap rather than manufacture a pass. Normal upstream login/device registration/background sync can occur; no new mutation API is introduced.

Synthetic lifecycle target: new `app/alpha/js/core/auth/authManager.lifecycle.test.mjs`, actual AuthManager/SessionStore with in-memory storage and controlled promises/fetch. Pin password exchange method/path/body (synthetic only), fresh/expired/anonymous bootstrap, concurrent refresh coalescing/rotation/rejection, delayed owner resolution and late refresh across sign-out/A→B. Assertions concern externally visible state/token ownership, not source regex. Read-only source inspection suggests refresh writes after awaited response without a session-generation check; reproduce before any product change. If confirmed, amend this plan for the minimal guard before editing runtime. Required focused command `node --test app/alpha/js/core/auth/authManager.lifecycle.test.mjs app/alpha/js/core/auth/authManager.test.mjs app/alpha/js/core/auth/accountLocalDataReset.test.mjs`; full application/lint/inert build/browser if a runtime fix is necessary. Secrets remain synthetic in all committed tests.

### Confirmed refresh race — runtime fix amendment before code

Focused lifecycle run:13 tests,11 passed/2 failed. Both failures are behavioral: late refresh resolves true after logout and after completed B login, replacing current credentials. No live token was used; all fixtures are synthetic. Competing hypotheses were stale storage cleanup, wrong owner-cache namespace and refresh publication without ownership validation. The controlled deferred fetch isolates the latter: logout removes tokens and B initially establishes correctly, then A's old response writes the pair. Existing owner-response guard test passes.

Amend exact runtime target `app/alpha/js/core/auth/authManager.js`: capture session generation and both token snapshots for each refresh; validate ownership after response/body awaits and before any publication/failure-state update. Sign Out detaches its pending refresh so a new session can refresh independently. A completed old task may clear only its own refresh-promise slot. Preserve one-request coalescing, normal rotation, endpoint/scopes, missing-token and current offline/rejection semantics. Add after-JSON-parse/logout and independent-new-refresh ownership regressions before declaring green. Also test bootstrap waiting on an obsolete refresh so it cannot sign out B; if reproduced, guard bootstrap's post-refresh continuation with its captured session generation. No new login, endpoint, storage migration or token policy. Owner auth review required on the concrete result before merge; public preview stays unchanged.

The expanded deterministic probe produced16 tests:11 passed/5 failed (both original refresh races, logout during JSON parsing, old-task/new-refresh ownership and obsolete bootstrap). The minimal generation/token guards, detached logout refresh slot, task-owned cleanup and post-refresh bootstrap generation check then passed16/16 with0 failures/skips in156ms. No debugging logs introduced. Required full application/build/lint/browser verification and owner auth review still pending; no fix deployed.

Read-only hydration attempt1 is preserved as sanitized evidence, not a pass. A's library/history/progress/add-on requests returned200, with162 watched records and6 add-ons matching the independent A snapshot. An early progress snapshot was0 versus154 in the independent context, and the script stopped at PROFILE_SIGNOUT_NOT_AVAILABLE immediately after clicking asynchronous Profile navigation. Inspecting the driver identifies two test barriers to correct: it compares the pre-reload A snapshot, and it tests Sign Out visibility before the router finishes mounting. Amend only the private driver to wait for response completion and stable local snapshots, retain post-reload controls, and await the Sign Out locator; compare nonempty identity sets with assertions. Preserve empty-Library/new-write limitations and stop if discrepancy persists. No product sync change is justified by this attempt alone.

### Executed local verification — refresh-ownership unit

Pinned Node22.23.1/npm10.9.8:

- `node --test app/alpha/js/core/auth/authManager.lifecycle.test.mjs app/alpha/js/core/auth/authManager.test.mjs app/alpha/js/core/auth/accountLocalDataReset.test.mjs` — initial13:11 pass/2 fail; expanded16:11 pass/5 fail, exit1; after fix16/16 pass,0 skipped, exit0. Synthetic deferred promises make the five races deterministic; current owner-cache and cleanup controls pass.
- `NUVIO_LOCAL_PROPERTIES="$PWD/tests/fixtures/build.properties" npm run build --prefix app/alpha` — exit0; asset514eeafc588f, worker35fe37439b18.
- `node scripts/check-alpha-build.mjs` — exit0,12 assets/inert configuration/no privileged fields.
- `npm run lint --prefix app/alpha` — exit0.
- `npm test --prefix app/alpha` —1114/1114 pass,0 failures/skips,17.959sec, exit0.
- `npx playwright test` —31/31 pass,0 failures/skips,1.1min, exit0; actual bundled startup/guest/Settings/add-ons/playback and worker updates remain green. These local tests use inert services; the live receipt separately targets unchanged deployed8edec42.
- `node --test scripts/check-docs.test.mjs scripts/governance.test.mjs` —15/15 pass,0 skips; local docs links,26-ticket ledger and whitespace pass.
- `node /tmp/nuvioweb-issue7-live.mjs /tmp/nuvioweb-test-accounts.json` — exit0,13 live observations, receipt linked above. Script body contains no credentials and no account data is embedded in command arguments; file is read only in memory.
- `node /tmp/nuvioweb-issue7-sync.mjs /tmp/nuvioweb-test-accounts.json` — hydration attempt1 exit1 with preserved partial receipt. Corrected async barriers are under rerun; do not claim the initial mismatch passed. No runtime sync code changed.

Owner-approved PR42 and its protected ledger follow-up PR43 have merged; issue8 is CLOSED and the issue-closure guard succeeded. This #7 branch merged protected main5406c0b without rewriting history. Issue7 remains in progress; its current refresh fix requires automated review, protected CI and explicit owner auth review before merge. No public refresh-fix deployment or completion claim.

Hydration attempt2 corrected the initial progress capture: independent A matched all existing identity sets (162 watched,154 progress,6 add-ons, both Libraries empty), after200 responses and stable snapshots. Logout succeeded. The run stopped during switched-B primary-profile navigation, so no Library/account-switch hydration pass is claimed. Preserve attempt2. A final reduced probe will use `history.state.route` (the actual router state) instead of visibility of suspended underlying screens, label each wait precisely and capture only allowlisted route/visible-screen booleans on failure. This distinguishes a driver barrier from a deployed routing bug without exporting screenshots/account text. Stop further live retries if that probe fails; continue the independent refresh fix PR with the precise blocker documented.

### Final bounded hydration outcome and review boundary

`node /tmp/nuvioweb-issue7-sync-final.mjs /tmp/nuvioweb-test-accounts.json` — exit1, HYDRATION_CONTROL_MISMATCH on B→A after13 observations; [final sanitized receipt](../../evidence/identity-hydration-final-2026-10-19.json). A→B matched fresh B and excluded A-only watched/progress/add-on sets. B→A profiles/add-ons returned but watched/progress stayed0 instead of162/154; corresponding pulls were absent within bounded wait. Stop further live retries as planned; investigate stale sync scheduling/teardown with a controlled local test next. No data mutation performed, no successful Library-isolation/new-write claim (both Libraries empty). Private salted comparison hashes were not exported.

[Draft PR44](https://github.com/saurabhhbansal/nuvioweb/pull/44) contains the isolated refresh-ownership fix and honest evidence. Automated Standards and Spec reviews of909deac each found0 actionable issues; explicitly not independent human approval. Four protected CI contexts on909deac succeeded. Subsequent changes add only sanitized evidence/docs; no runtime changed after the1114/31 regression pass. Recheck final-head CI, then require explicit owner auth review before integrating this unit. The remaining hydration/new-data/QR/offline/expiry work keeps issue7 open.

### Controlled hydration investigation — before additional source/tests

Keep exactly issue7 selected and PR44 draft while investigating its remaining completed-switch failure. Extend the same bounded account-lifecycle scope only if an actual regression reproduces; rewrite PR title/description and rerun required checks/reviews if source scope changes. Do not treat the first refresh fix's green CI as evidence for new sync code.

Targets: existing `app/alpha/js/core/profile/startupSyncService.test.mjs` esbuild seam runs the real service with synthetic domain dependencies; add deferred old-cycle stop/start and same-profile critical hydration cases. Ranked hypotheses: (1) `stop()` retains `inFlight` so new-account requests wait for unrelated old-account work; prediction: hold an old domain promise, stop/start, and new scoped watched/library pulls will not start. (2) critical hydration dedupes only profile ID so a new account's profile1 reuses old-account work; prediction: hold old critical settings, stop/start and request profile1, then no new domain calls occur until old work finishes. (3) profile activation/background orchestration or the live driver is responsible rather than service teardown; prediction: both service probes pass, requiring a separate real-navigation fixture rather than a service rewrite. Establish red results before choosing a fix; never infer server failure from absent UI data.

If confirmed, minimal runtime target is `core/profile/startupSyncService.js`: lifecycle generation invalidation/detachment on stop/start, task-owned in-flight cleanup and obsolete-cycle checks across awaited pull/push boundaries; invalidate critical-hydration dedupe on teardown and capture current context before async critical work so old completion cannot adopt a new account. Preserve per-profile dedupe within the same lifecycle, independent-domain parallelism, retries, push budgets and safe hydration gates. Add positive same-lifecycle coalescing, old-completion/new-task, non-blocking restart and no obsolete follow-up mutation assertions. No API/schema/destination changes. Existing auth/privacy human review gate applies; no public deployment. Full focused sync/auth, application/lint/build/browser/docs/ancestry and refreshed automated review required after any runtime change.

Controlled sync seam reproduced both ranked teardown hypotheses and stale-context adoption: initial7 tests,4 pass/3 fail. Expanded push/auto-addon ownership probes:9 tests,4 pass/5 fail, exit1. Restart does not launch B while A's held cycle is pending; old critical profile1 work is reused; context captured after await adopts a later session; obsolete automatic pushes proceed to later domains; new add-on sync callers reuse old tasks/waiters. These are synthetic deterministic findings aligned with the live missing-hydration symptom. Extend exact teardown target to `addonSyncInFlight` detachment and task-owned waiter resolution/final cleanup; prohibit obsolete follow-up pushes. Preserve normal single-lifecycle coalescing and keep the final live failure unclaimed until a reviewed deployment is tested.

After the initial lifecycle guards,9/9 sync cases passed. Two additional awaited-boundary probes then failed: a stop/start during context capture still initiated domain work, and an obsolete `start()` finishing its initial pull replaced the new lifecycle interval. Add guards immediately after context capture and before interval publication, plus before retrying an obsolete pull. This remains the same lifecycle-ownership target; add no new scheduling policy or remote endpoints.

### Candidate verification amendment before live candidate code

Focused auth/sync/cleanup now28/28 pass,0 skips, after all reproduced boundaries (including teardown during awaited language load). Complete the full build/lint/application/browser regression for this expanded source before relying on earlier checks. Source scope is now AuthManager plus StartupSyncService, not only refresh; update PR44 title/body and rerun automated review.

After committing the clean candidate, stage existing public configuration with `npm run preview:stage` (no upload), serve that immutable static directory on loopback4375 only, and adapt the final read-only A/B hydration driver to this local candidate revision. Verify SOURCE/config match exactly; allow HTTP only to fixed127.0.0.1:4375 and HTTPS only to api.nuvio.tv, blocking other recipients. No proxy/backend/server-side auth is introduced. Receipt must say LOCAL CANDIDATE + source SHA, not a deployed public revision. Browser-level live-service checks are contingent on real API CORS permitting this origin; a blocked origin is evidence, not permission to disable browser security or add a proxy. Normal login/device registration/background sync may occur; do not create/delete Library/add-on/history/profile records or expose real state. This candidate replay is justified by the new source changes, not another retry of unchanged deployed code. Public preview remains8edec42 throughout. Explicit owner auth review and protected CI precede integration and any separately verified development refresh.

Expanded sync source verification checkpoint: focused auth/sync/cleanup28/28 pass,0 skips (398ms). Build with inert properties and12-asset/private-field check pass, asset70b389ab0edc/worker1238b621e534; lint passes. No DEBUG instrumentation found. Full application/browser regressions are running; previous1114/31 results describe the refresh-only checkpoint, not this expanded diff. Cumulative Alpha inventory41 paths; endpoints/scopes/token formats and server schemas remain unchanged.

Automated Standards and Spec reviewers found the same P2 gap at8209ed8: nested profilesTask continuations after ProfileSyncService.pull/collectKnownProfileIds and Simkl credential→refresh can start work after teardown before the outer generation guard runs. Add deferred stop/start regressions at both profile awaits and before Simkl refresh, plus queued-domain dispatch after teardown. Guard each dependent continuation and route independent domain dispatch through one local lifecycle-aware queue helper, preserving same-session parallelism and results. Do not claim the reviewed8209ed8 passed; rerun reviewers/full checks after correction. Already-issued requests remain governed by each domain's existing session checks; this unit cannot undo a server operation that began earlier.

Review correction: the first nested-profile test fixture initially waited on a branch it did not trigger and was stopped; corrected it to exercise the stored-profile fallback before claiming a result. The corrected bounded run gave16 sync tests:12 passed/4 failed for both profile awaits, Simkl follow-up and queued old-domain dispatch. A local lifecycle-aware dispatch helper and dependent-continuation guards then passed all32 focused auth/sync/cleanup cases,0 skips (461ms). No test assertion was weakened. Repeat full regression and automated review for this changed source; earlier1123/31 results remain historical.

### Final source and candidate evidence

Final reviewed source8650d85: `npm test --prefix app/alpha`1127/1127pass,0skips,17.724sec; `npx playwright test`31/31pass,0skips,1.1min. Inert build assetac94ba7d0efd/worker426eafb940dd,12-asset/config check and lint pass. Focused32/32pass;17/17 docs/governance/preview regressions, links/ledger/ancestry/whitespace pass. Automated Standards/Spec re-review at8650d85 confirms prior P2 nested-continuation findings resolved, no remaining actionable findings.

`npm run preview:stage` at8650d85 — exit0, only `dist/preview/8650d85afd665c589872ddf8474a3695900c6fb7`; public-config asset074d1003fc92/worker8246f52846df. No upload. First local server command used a mistyped SHA directory and exited1/ENOENT before credentials/network; corrected exact path served only127.0.0.1:4375.

`node /tmp/nuvioweb-issue7-local-candidate.mjs /tmp/nuvioweb-test-accounts.json` — exit0,13 scoped observations; [sanitized local-candidate receipt](../../evidence/identity-local-candidate-2026-10-19.json). B→A now restores162 watched/154 progress/6 add-on identities and all four observed pulls return200; A→B excludes A-only identity sets and matches fresh B. Same real API, local static candidate origin, no public deployment or intentional test-record mutation; ordinary application background sync remained enabled. Empty B-domain request observations remain limited; both Libraries empty, no Library/new-write claim. All contexts and loopback server closed afterwards.

Later documentation-only commits do not change this tested runtime. PR44 remains draft until final-head protected CI and explicit owner auth review. This unit is ready for that checkpoint; issue7 remains open for nonempty Library propagation/isolation, new-write/removal, broader negative/QR/offline/device evidence and public post-merge checks.
