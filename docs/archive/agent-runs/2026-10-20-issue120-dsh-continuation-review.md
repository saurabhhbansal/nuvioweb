# Issue #120 DSH continuation — automated evidence and integration review

## Scope and provenance

DSH continued the existing branch and draft [PR133](https://github.com/saurabhhbansal/nuvioweb/pull/133), without redoing merged PR127/131/132 or repeating live fixture mutations. Reviewed documentation baseline: `4f87e0159bf66afb2d6b2388fbf8bd0a23bc3787`; runtime remains `b5a8679404b98649f9c742abc6aa5da00edc50a9`. The issue-specific [plan](../plans/issues/issue-120-live-checkpoint.md) was extended before continuation evidence edits.

Two separate read-only DSH subagents reviewed the existing evidence and full `b5a8679..4f87e01` diff. Codex CLI was not found on the current shell PATH, so the distinct DSH technical reviewer is the recorded substitute; earlier committed Codex reviews remain separately attributed. **All review here is automated, not independent human approval or an independent live replay.** Required independent GitHub approvals remain zero; branch protection is not bypassed.

The full-head reviewer supplied a complete result before its execution ended abnormally; that received result explicitly excluded unstaged continuation edits. A completed read-only follow-up separately reviewed the 10 tracked continuation-document changes and new continuation receipt against that exact head, with no blocking Standards/Spec findings. It confirmed JSON parsing/privacy scan and whitespace checks, and independently read both host process statuses and empty final receipts. Public fetch/local suite results in that follow-up remain executor-reported, not independently rerun. Neither reviewer received credentials, tokens, private browser profiles, backups or original private arrays, and neither launched a live driver.

## Existing evidence verdict

No material finding blocks bounded A2 completed-phase acceptance or A3 current-verification resolution. This is not issue closure or an unqualified whole-run pass.

- [Application phase summary](../evidence/issue7-app-journey-phases-2026-10-20.json): independently recomputed executed V12 driver SHA-256 `3ae2bb094c798fb55831f1e674752c4baefc98c0adda32817c831aeefd5f5c54` and raw receipt SHA-256 `674b50b5b60f344cb7e379606be4b763ea318b30422e1571f9f6eca1ed903a60`, both matching the export. All 25 checks and shared revision/timing/limits/uncertainty fields agree. Actual app profile/add-on/Save/watched/play/pause/Back/final-removal actions and independent receiving UI precede creation of the foreign context. Final receiver emptiness requires a completed current-epoch Library response, active disposable profile, settled sync metadata, empty scoped store and zero rendered cards. Qualifying writer mutations return remote 204; API setup is not substituted for the app actions.
- Raw V12 remains **incomplete**: final foreign settings/credential-seed requests were locally aborted, not forwarded or rejected by the provider. Required phases completed before the terminal latch. Broader foreign background behavior is unverified. Reviewer wording finding corrected: this is a terminal unexpected-request latch, not an unknown issued-write outcome; the raw unknown-write/auth flags remain false.
- V12 cleanup closes contexts and settles issued work before exact unused nonprimary-profile deletion/readback. Original measured domain rows compare exactly, with only server-managed profile `updated_at` excluded. Browser/baseline local-session cleanup and credential-file digest checks are true. Earlier lost observer/session handles remain separately unverified; this is not universal cleanup and does not justify account-global revocation or stale snapshot restoration.
- [Classified switch replay](../evidence/issue7-classified-switch-replay-2026-10-20.json): recomputed driver SHA-256 `dd92cb65264f8ad96237a47032f9a6d03fb315d054f2913856f3e86e5214963e` matches. Six exported steps and shared checks match raw telemetry: 705 events, 55 intentional API denials, zero unexplained active API failure events. Both nonempty Library switch orders compare exact current normalized five-domain stores and Library DOM; local fallback profile is explicitly labelled. This is current verification, **not a causal explanation of the historical pre-header failure**, a stress-reliability claim or permission to forward background mutations. Historical failure and missing telemetry remain active and explicit.
- [Offline-v2 receipt](../evidence/issue7-offline-reconnect-2026-10-20.json): documented offline message/zero Saved-Cloud cards, preserved private scope, zero completed offline API reads and exact reconnect restoration are distinct from the earlier failed cached-shelf expectation and from future expiry.
- Full-head review confirmed original O1–O3, mappings and required kinds unchanged; checker/contract/runtime/workflows/dependencies unchanged. The archived negative fixture matches the original baseline receipt SHA-256 `4a3f1e892608a3b4ceccd37937678f08e33a596362a6dc8f2829e54fdf850426`. Negative test bodies remain unchanged; only the current actual-receipt expectation advances to A8. No credential/email candidates were found in the reviewer scan of changed JSON. The older protected checkpoint's remaining-work text is now explicitly labelled a historical snapshot rather than the active unmet set.

## Continuity and pending elapsed evidence

[Sanitized DSH receipt](../evidence/issue7-dsh-continuation-2026-10-20.json) records the public SOURCE/manifest check, driver hashes, empty final receipts and process-view limitation. Direct filesystem reads of host procfs show recorded PIDs 4037002 and 4170556 as sleeping Node processes; executor rechecked both at approximately 13:45 UTC after quota resumption. Workspace-write shell `ps` sees an isolated PID namespace and cannot establish their absence. Process presence is not an eventual-success claim.

The two original targets remain **2026-10-27T09:53:49.952Z** (direct natural expiry/refresh) and **2026-10-27T10:21:40.792Z** (application post-expiry rejected refresh). Both final receipts are empty. No clocks, tokens, running drivers, sessions or pinned deployment were changed.

Important actionable finding: running application observer v3 already retains `offlineReloadRenderedConfiguredApp=false`; its aggregate requires every check true. Even successful future lifecycle phases cannot yield a whole-run pass. Leave it running unchanged. Future real-expiry/rejected-refresh, pre-bootstrap token-integrity, private-cache/token clearing, signed-out UI and cleanup checks need their own bounded evidence review alongside the independent offline-v2 receipt. Do not edit the earlier failed assertion, relabel the aggregate or accept waiting as evidence. Successful natural refresh of an unrevoked session is a separate direct-observer assertion, not supplied by the revoked application observer.

## Executor verification and integration conditions

Executed locally on Node `v24.21.0`:

- `node --test scripts/check-issue7-acceptance.test.mjs scripts/governance.test.mjs scripts/check-docs.test.mjs` — 50 pass, 0 fail, 0 skip.
- `node scripts/check-docs.mjs` — pass.
- `node scripts/check-progress.mjs` — pass; structural ledger validation only.
- `node scripts/check-commit-references.mjs b5a8679404b98649f9c742abc6aa5da00edc50a9 HEAD` — pass.
- `node scripts/check-issue7-acceptance.mjs docs/evidence/issue7-acceptance.json --validate` — exit 0, one unmet criterion A8; not closure.
- `node scripts/check-issue7-acceptance.mjs docs/evidence/issue7-acceptance.json` — exit 2, A8 unmet; repeated after quota resumption.
- `git diff --check b5a8679404b98649f9c742abc6aa5da00edc50a9 HEAD` — pass.

All four required CI workflows passed at old documentation head `4f87e01`; these are not final-head results for continuation edits. Final-head checks, resolved conversations, unchanged strict protections and a normal protected merge remain required. Actual-merge workflows must then be collected separately. No new application build/browser run or full public asset rehash is claimed from local continuation checks.

Security/privacy/licensing/cost: sanitized public metadata/statuses/booleans only; no new credential recipients, privileges, dependencies, legal-media substitution, upstream notice/history changes, payments, purchases or hosted compute. No production release or preview redeploy. Rollback is a protected evidence revert while preserving original receipts and elapsed observers. #7/#120 stay open; QR/physical-device/stronger guarantees remain unsupported deferred follow-ups #128–#130.
