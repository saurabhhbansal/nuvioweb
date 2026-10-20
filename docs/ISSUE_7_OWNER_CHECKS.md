# Issue #7 — authorized live observation contract

Status (2026-10-20): the owner has resumed bounded disposable-account validation under the [explicit authorization](../AGENTS.md). Sol owns execution; no routine owner approval is pending. This card preserves the criteria for [#120](https://github.com/saurabhhbansal/nuvioweb/issues/120).

**Candidate gate:** the old `7dcc3717742e04745c018eccd342df0915bbe8fe` / `b6451df5` preview contains old QR defects and must not be used for QR observations. The reviewed remediation is now integrated at `8eec52a7de888d156fac03edd9c523fc16964f7b` and served as development deployment `46d066cf`; SOURCE/config/inventory and hosted guest checks passed. Later Library fixes require their own verified served candidate before their app mutation checks. Record that revision/deployment in a new receipt; merging a PR does not refresh the preview.

Use the purpose-built guarded driver in the durable run directory. Keep credentials, emails/IDs, account/media payloads, QR content, screenshots, storage/HAR and tokens out of outputs. Verify the credential file digest before and after. Accounts A/B are designated disposable identities. Use isolated contexts; never attach to or kill a shared browser. Mutations require original-state backup, exact attributable records, concurrent-writer/full-snapshot accounting, exact cleanup and final readback. Read-only mode must deny automatic mutating app RPCs too; denied requests limit the evidence.

Record browser/version/OS, source/deployment, exact expected/foreign-set comparisons as booleans, request status/phase/timing, and synthetic versus real-service limits. Execute both account round trips, independent receiver and new profile/add-on/history/progress propagation when safe. App Save→receiver→final-item deletion must use isolated disposable data; never delete unrelated items or restore a stale full snapshot. Explicit pre-expiry refresh is not measured natural expiry. Local sign-out is not remote revocation.

The public v1.3 API reference documents refresh and logout but no QR approval/nonce/device workflow or atomic Library compare-and-swap contract. Investigate legitimate supported controls; missing provider semantics or physical hardware remains a technical dependency, never an owner-permission blocker. Keep historical unexplained failures visible; a later successful run alone does not explain them. `node scripts/check-issue7-acceptance.mjs docs/evidence/issue7-acceptance.json --validate` validates structure; full closure must refuse while acceptance is unmet.

## Historical manual checklist (2026-10-19)

This preserves the original observation requirements; agent execution is now authorized by the update above. Historical suggestions to wait for further routine approval are superseded.

## First batch — sign-in and persistence

1. Open the preview in a fresh browser profile/private window. Choose Sign In, or Settings → Account → Sign In if already in guest mode. Sign in with account A's existing Nuvio credentials. Report whether Account shows Signed in and the expected account. Do not create a separate NuvioWeb identity.
2. Reload. Close/reopen the app in the same browser profile (keep private browsing open if using it). Confirm A remains signed in and its selected profile is correct. This proves session persistence only, not refresh after token expiry.
3. Open the preview in an independent browser profile/device and sign in as A. Record whether the same profiles appear. If login fails, stop and report the visible error with private details redacted; do not repeatedly retry or change browser security settings.

Reply with first-batch results before continuing if anything fails. The agent can diagnose from the screen/error without your password.

## Second batch — cloud sync and profile separation

4. In A's first browser, add a clearly identified item to Library and create/rename a disposable profile to `A-test` if the interface permits. In the second browser signed in as A, reload or restart the app; upstream sync is not promised to update active screens in real time. Check the profile and library item. Record each separately and roughly how long it took. Do not count an already-existing item as proof of a new write.
5. If you already have a lawful, free HTTP add-on you control or normally use, toggle/install it in the disposable profile and check its state in A's second browser after reload. Use only an add-on without private API keys or charges. If none is available, report SKIPPED; the agent will arrange an appropriate fixture rather than invent a public endpoint.
6. If a lawful browser-playable source is available, play briefly, stop, and compare Continue Watching/history in the second browser after reload. Record the title alias and approximate position, not the signed media URL. If unavailable, report SKIPPED. Sync of progress/history is distinct from successful video playback.
7. Switch between two profiles within A and check that data appears in the intended profile, including any intentionally shared primary-profile add-ons. Record actual behavior instead of assuming every setting must differ. Switch back and verify A-test's data remains.

## Third batch — logout and account isolation

8. In A's first browser, use Settings → Account → Sign Out. Without clearing browser storage, sign in as B in that same browser. Verify B's account identity and profiles; check that A-only library/history/add-on test markers are absent. If any A-only data appears, stop, record which screen/marker and report FAIL. Do not continue modifying B while mixed data is visible.
9. Add a different Library marker as B. Sign out and sign back in as A in the same browser, still without clearing storage. Check that A's original data is restored and B's marker is absent. Repeat after reload. This tests an ordinary completed switch; it does not prove race safety during delayed requests.
10. While signed out, check that Account does not show a signed-in identity. Note whether private A/B data remains visible in guest screens; distinguish intentionally shared/local settings from account data. Do not infer remote token revocation from the UI alone.

## Optional follow-up, guided separately

- QR: only if the app offers Sign In with QR and you have a second device. Report whether approval completes and which account appears; never share the QR/code. An unavailable option is a documented limitation, not a test pass.
- Offline: after an ordinary sign-in, temporarily disconnect the network and reload, then reconnect. Record whether the UI explains offline/error state and recovers. Cached account display is not evidence of a valid server session.
- Refresh/revocation: leave the disposable session active and later check recovery, or revoke it using an official Nuvio account control if available. Do not edit tokens/storage, system time or network requests. A valid expiry/rejection assertion needs agent instrumentation and a measured expiry boundary; a simple reload cannot establish it.

## Result template

```text
Browser/version and OS:
Date and time:
Windows/devices: normal profile / private profile / second device
1 Sign in as A: PASS / FAIL / SKIPPED — observation
2 Reload/reopen persistence:
3 A on independent browser:
4 Profiles and Library cloud sync (each):
5 Add-on sync:
6 Progress/history sync:
7 Profile switching:
8 A → B isolation:
9 B → A isolation and reload:
10 Signed-out display:
QR/offline follow-up, if tried:
First failing step and redacted visible error:
```

The agent records reported observations with their environment and limits, reproduces failures, completes automated negative/race checks and seeks required auth review. Issue #7 stays open until each acceptance criterion has sufficient evidence. Use account aliases A/B only; never paste credentials or tokens into chat/issues. Remove only the disposable test data you created when finished.


## Executed agent observations — 2026-10-20

[Hosted account round trips](evidence/issue7-sol-hosted-accounts.json), [direct additive marker/cleanup](evidence/issue7-sol-live-markers.json) and [explicit refresh/scoped revocation](evidence/issue7-sol-live-lifecycle.json) are real-service observations with stated limits. [QR observation](evidence/issue7-sol-qr-live-observation.json): anonymous signup200, start400 rejects this preview redirect, no QR ready, local anonymous session cleared. Provider support/allowlisting and actual approval/nonce semantics are the exact missing capability. [Capability inventory](evidence/issue7-sol-capabilities.json) records unavailable physical/branded-device tools; emulation is not physical proof. No owner-permission blocker remains. The unexplained historical post-removal failure remains unresolved; later round trips alone do not explain it.
