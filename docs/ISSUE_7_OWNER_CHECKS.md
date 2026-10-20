# Issue #7 — owner-run login, sync and isolation checks

Status: **blocked under the owner's live-account pause (2026-10-20).** This is the ready-to-run observation card for [#120](https://github.com/saurabhbansal/nuvioweb/issues/120), not an authorization to run it. The owner previously reported first batch (steps1–3) passed on 2026-10-19, identified Windows with Microsoft Edge, and later provided scoped owner-created Library evidence. Browser version and independent-session details remain incomplete; no measured token-refresh, rejection/revocation, QR-consent or device evidence exists. The owner elected to run these checks. This is the live evidence portion of [issue #7](https://github.com/saurabhhbansal/nuvioweb/issues/7), not sufficient by itself to establish all security/refresh race cases.

Use https://nuvioweb-preview.pages.dev (currently reviewed revision `7dcc371`, deployment `b6451df5`). Use two disposable existing Nuvio accounts, called A and B, with distinguishable test data; keep account emails, passwords and tokens private. Use an ordinary browser profile and a separate private window or another browser/device. Two tabs in the same profile share storage and cannot prove cloud sync. Record browser/version, operating system, test date and which window/device you used. A screenshot may include account details: crop/redact it. Do not share storage exports, QR codes, authorization codes, network archives or tokens.

## Ready observation card — 2026-10-20 (blocked, no probe authorized)

**Candidate to name before any run:** current development preview `https://nuvioweb-preview.pages.dev`, revision `7dcc3717742e04745c018eccd342df0915bbe8fe`, deployment `b6451df5-53cb-45d3-9312-361254bf3463`. A future authorized run must re-verify that the served source/config matches this revision first; if the preview has moved, name the new exact revision/deployment instead. Historical nonempty B→A evidence was collected on `1f67867`/`b48de821` and does not transfer automatically to the current deployment.

**Environment to record:** browser and full version, operating system, ordinary versus private profile, whether the two contexts are separate profiles/devices, date/time, and the exact candidate revision/deployment. Use two disposable existing Nuvio accounts A/B. Never post passwords, tokens, QR codes, account/item IDs, screenshots containing data, HAR or storage exports.

**Assertions that would count (each recorded separately, never inferred from counts):**

1. **Existing-account-only sign-in:** A signs in through the existing Nuvio flow; no NuvioWeb password store or second account appears. Record the visible account state and profiles.
2. **New-data propagation:** in A context 1, create or rename a disposable profile and add one clearly labelled disposable item/add-on/history/progress change. In A context 2 (independent storage), reload/restart and record whether that exact new change arrives. Distinguish existing-data hydration from a new mutation.
3. **Profile/account boundary:** record A's and B's visible profiles and the exact identity-set comparison for the nonempty control (booleans only). Then perform A→B→A in the same browser without clearing storage and record the expected/foreign set for each domain. B→A→B must be attempted and recorded; a single successful switch is not both round trips.
4. **Library Save → receiver → final removal:** with a reversible disposable item, save in the app, observe it in an independent receiver, remove the final item in the receiver/writer, reload the receiver and record whether the deletion propagates. Define exact cleanup before writing; if a safe final-item deletion cannot be arranged, leave this row blocked rather than substituting a synthetic result.
5. **Expiry/refresh/rejection:** only with agent instrumentation or an approved official control. Record the observed expiry boundary/outcome and rejected-refresh behavior; no decoded payloads. A reload alone is not refresh evidence.
6. **Offline → reconnect:** disconnect, reload/restart, record the visible state and whether cached display claims a server-valid session; reconnect and record recovery. Cached continuity is not revocation proof.
7. **QR:** only after [#118](https://github.com/saurabhbansal/nuvioweb/issues/118) lands and upstream consent/semantics are documented. Record approval, expiry, wrong/expired nonce and device behavior without sharing the code/QR. An unavailable QR option is a limitation, not a pass.

**Failure handling:** preserve the failing stage and bounded category (cancelled, timeout, rejected auth, missing response, UI stale) without raw request/response data. Stop unchanged retries. Reproduce locally before any runtime fix; a later success alone does not explain an earlier failure.

**Validation:** after an authorized run, the sanitized receipt is checked by `node scripts/check-issue7-acceptance.mjs docs/evidence/issue7-acceptance.json`. There is deliberately no executable live probe command authorized today; a future private driver needs its own reviewed bounded command. Missing provider/device observations stay BLOCKED, never synthetic PASS.

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
