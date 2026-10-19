# Existing Nuvio identity — issue #7 verification

Status: in progress. Source pin Alpha5624da2; application still uses the existing Nuvio account flow. No duplicate identity implementation. [Execution plan](plans/issues/issue-7.md), [owner checklist](ISSUE_7_OWNER_CHECKS.md), [identity contract](NUVIO_IDENTITY_CONTRACT.md).

## Observed live evidence, 2026-10-19

[Sanitized receipt](evidence/identity-live-2026-10-19.json) records13 observations against deployed preview8edec42, Chromium156.0.8078.4 on LinuxARM64. Owner separately reports the initial three checks on Windows/Microsoft Edge; version and independent-session arrangement are not yet recorded.

- Actual Nuvio password exchanges for aliases A/B succeeded and returned the intended distinct identities. Neither email/password nor tokens/identifiers were exported to the evidence.
- Reload retained sessions for A and B. This is persistence, not measured expiry/refresh.
- A in two isolated browser contexts showed the same profiles; A has3 and B1. Equality was compared privately using per-run salted fingerprints, which were not retained.
- Completed A→B→A switches in the same browser context, without clearing storage manually, matched each account's fresh profile control. Normal Sign Out removed local access/refresh tokens and showed Sign In. No claim of server-side revocation.

Tests used owner-authorized accounts loaded only from a600-mode file outside Git. Browser contexts were nonpersistent and closed afterwards; no screenshots, traces, HAR, video or storage export. Only the exact HTTPS preview and Nuvio API origins were allowed. No existing Library/profile/add-on/history record was modified by the driver. Normal application login/device registration/background sync still occurs. Review agents receive no credentials or real account state.

## Unverified acceptance and technical limits

Library/add-on/watch-history synchronization and isolation remain unverified by this first pass. Matching profiles do not prove other stores are isolated. New-data propagation, delayed responses crossing logout, measured expiry/rejected refresh, offline recovery, QR consent and revocation require separate assertions. Counts or inherited tests alone are insufficient. Provider playback was blocked and not tested.

The upstream client stores tokens in localStorage, which same-origin XSS can read. This work has not replaced its storage model. Local logout is not proof of remote session revocation. The separately planned pairing/entitlement verifier must not trust decoded/cached browser identity. No backend, compute, payment or public deployment is added here.

Issue #7 stays open until its acceptance criteria, meaningful negative cases and required human auth review are satisfied. Further evidence/failures will be appended with exact commands and limits.

## Synthetic refresh regression found and corrected on the feature branch

The actual AuthManager failed five deterministic delayed-response scenarios: refresh completing after logout, after B login, during response-body parsing, while a new B refresh was pending, and while obsolete bootstrap resumed. The expanded focused run recorded11 passes/5 failures. Local guards now bind publication to the session generation and original token pair, detach pending refresh on logout, let only the owning task clear its slot and discard obsolete bootstrap continuation. The same16 focused lifecycle/auth/cleanup cases pass,0 skips. Normal exchange/rotation/coalescing, rejected/malformed refresh and delayed owner-resolution controls remain covered.

These are synthetic findings and an unmerged, undeployed fix; the live checks above exercised the older deployed revision. Full regression verification and explicit owner auth review remain required. Existing offline/expiry policy, destinations/scopes and storage format are preserved.

Local refresh-fix regression verification:1114/1114 application tests,31/31 Chromium/PWA journeys, lint, inert build/12-asset check and15/15 docs/governance tests pass. These do not replace the outstanding live/new-data/negative checks.

[First hydration attempt](evidence/identity-hydration-attempt-2026-10-19.json) remains recorded as failed/partial: cloud requests returned200 and existing watched/add-on sets matched across A contexts, but the initial progress snapshot differed and the driver checked Sign Out before asynchronous navigation completed. The driver is being corrected to wait for completed/stable hydration and router mounting; no product sync fix or successful Library-isolation claim follows from this attempt. Empty Library controls cannot prove cross-account Library isolation.

## Final bounded live hydration probe

[Attempt2](evidence/identity-hydration-attempt-2-2026-10-19.json) corrected the early snapshot: independent A matched162 watched identities,154 progress identities and6 configured add-ons. [Final reduced probe](evidence/identity-hydration-final-2026-10-19.json) used actual browser router state and stable snapshots. A/B primary-profile cloud pulls returned200. Completed A→B matched fresh B's empty watched/progress and2 add-ons, with A-only watched/progress/add-on identities absent. These comparisons used private per-run salted identity hashes; no item names, URLs, IDs or hashes were retained.

The final probe FAILED on B→A restoration: profiles and6 add-ons returned, but watched/progress remained empty versus A's162/154 control; the expected cloud pull operations were not observed within the bounded wait. This is an outstanding deployed hydration/scheduling problem to reproduce with synthetic controlled services, not a successful account-switch hydration test. No further live retries were performed. The original13 session/profile observations still have their limited meaning.

Both test Libraries were empty. Equal empty controls do not verify Library synchronization or isolation. New-data creation/removal and push propagation remain untested; no existing remote record was modified. Future write probes need a documented reversible marker and a verified narrow cleanup contract. The current PR addresses only the separately reproduced refresh races and preserves these live limitations.

Automated Standards/Spec reviews at909deac report no actionable findings in the bounded refresh fix; neither is human approval. All four required CI contexts passed on909deac. Final documentation updates require exact-head CI before the owner auth review checkpoint.

## Controlled sync lifecycle regressions

The real startup-sync module with controlled synthetic services reproduced five teardown/ownership failures (4 pass/5 fail), then two additional context/interval boundary failures (9 pass/2 fail), and language-load teardown (11 pass/1 fail). The feature branch now invalidates pending lifecycle work, permits a new account's independent pulls, rejects old context adoption/automatic pushes, and protects new task/waiter/interval slots from old completions. Same-lifecycle profile dedupe remains covered. Focused auth/sync/cleanup is28/28 pass,0 skips. This is synthetic verification; it does not retroactively turn the deployed B→A failure into a success. A private local-candidate live-service replay is planned without public deployment.

## Final reviewed candidate — private live-service replay

[Local candidate receipt](evidence/identity-local-candidate-2026-10-19.json), source8650d85afd665c589872ddf8474a3695900c6fb7, is distinct from a public deployment. Existing static staging served only at loopback4375, with real Nuvio API traffic allowed and all third-party recipients blocked. No proxy or disabled browser security. A mistyped initial server directory failed before credentials were used; the exact staged SHA was then served. Contexts and loopback server were closed after testing.

The13-observation reduced candidate replay passed its asserted scopes: intended A/B identities, local logout, stable fresh-account controls and completed A→B→A. B→A now returned200 for all four observed Library/history/progress/add-on pull operations and restored A's162/154/6 identity sets, matching its fresh control without a reload. A-only watched/progress/add-on records remained absent in B. Some empty B-domain pull requests were not observed during the bounded window; matching empty controls is limited evidence, not successful remote empty-read proof for every domain.

No new data was written. Both Libraries stayed empty, so Library propagation/isolation is still unverified. New-write/removal semantics, measured live expiry/revocation, cross-tab/QR/offline/device verification and post-merge/public-preview checks remain. The original deployed8edec42 failure remains preserved rather than overwritten by this candidate receipt.

Final source8650d85:1127/1127 application tests,31/31 Chromium/PWA journeys,32/32 focused auth/sync/cleanup, lint, inert build/12-asset checks and17/17 docs/governance/preview regressions pass,0 skips. Reviewers' nested profile/Simkl continuation findings were reproduced, fixed and re-reviewed with no remaining actionable Standards/Spec findings. These are automated reviews; explicit owner auth review and final-head protected CI remain required before integration.
