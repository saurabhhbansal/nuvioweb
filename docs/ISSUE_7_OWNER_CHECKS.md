# Issue #7 — owner-run login, sync and isolation checks

Status: owner reports first batch (steps1–3) passed on 2026-10-19. Browser/version/OS and independent-session details requested; Library sync and account-switch checks pending. This is a manual observation report, not agent-observed assertions or measured token-refresh evidence. The owner elected to run these checks. This is the live evidence portion of [issue #7](https://github.com/saurabhhbansal/nuvioweb/issues/7), not sufficient by itself to establish all security/refresh race cases. Agent fixture tests and review remain required before closure.

Use https://nuvioweb-preview.pages.dev (currently reviewed revision `8edec42`). Use two disposable existing Nuvio accounts, called A and B, with distinguishable test data; keep account emails, passwords and tokens private. Use an ordinary browser profile and a separate private window or another browser/device. Two tabs in the same profile share storage and cannot prove cloud sync. Record browser/version, operating system, test date and which window/device you used. A screenshot may include account details: crop/redact it. Do not share storage exports, QR codes, authorization codes, network archives or tokens.

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
