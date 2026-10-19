# Browser MVP acceptance gate

Status at 2026-10-19: **FAIL — a complete hosted browser MVP is not yet demonstrated.** #7 and #10 remain open. Build/CI passes and merged PRs are prerequisites, not substitutes for these journeys. Advanced4K60/HDR/codecs and M3–M5 compute/payment work are outside this first gate.

## Revisions and environments

- Audited merged baseline before this MVP unit: `25ce335ec870d1f31dbed557d11fd7e6a08d3faa` (owner-reviewed PR48, following PR47). All four required main workflows pass. Runtime regression:1,171 application tests,40 browser/PWA journeys,76 focused cases; automated reviews are not independent approval.
- **H1 hosted preview:** https://nuvioweb-preview.pages.dev, `8edec4248405d59f5b8639085a1e779e6878911b`, deployment96f977f4. Actual HTTPS/source/header/guest/automatic-worker recheck passes in Chromium156.0.8078.4, Linux ARM64, Playwright1.64. All third-party browser requests blocked; no account or media claim. [Receipt](evidence/mvp-hosted-baseline-2026-10-19.json).
- **L1 local real service:** static loopback `f8009207be06e9120dd5beaf71a5e8bdbe6c4323`, runtime identical to main25ce335, Chromium156.0.8078.4/Linux ARM64. Real primary Nuvio API, authorized disposable A/B accounts; third parties and Library full-snapshot writes blocked. [Receipt](evidence/identity-library-reconciliation-2026-10-19.json).
- **L2 local browser/HTTP fixtures:** actual bundled UI and redistributable generated media over loopback HTTP. These test local fetch/CORS/player behavior, using synthetic catalog records. They are not hosted HTTPS/provider or named-device evidence. [Existing quality matrix](PLAYBACK_QUALITY_MATRIX.md), [add-on evidence](ADDON_INTEROPERABILITY.md).
- **S1 synthetic identity service:** bundled browser fixture intercepts API requests using synthetic identities/tokens; covers account/profile isolation, delayed old responses, final-item empty push, remote deletion and failed-write/pending reload. No real Nuvio service/CORS/session guarantee follows.

- **C1 candidate, NOT deployed:** `80f739cf18eef5dca6d9e0fa54899357032f88bd` (current main after governance PR #50; runtime source identical to `a1629fe`). Clean static staging has134 verified hashes, GPL/notices and the optional same-host CC0 demo; loopback preflight passed hashes/headers/404s/demo resources/guest shell/reload/alias with0 page errors and third parties blocked. Cloudflare authorization is expired, so no upload occurred; every hosted cell below stays NOT TESTED. [Receipt](evidence/preview-candidate-2026-10-19.json).
- PASS applies only to the stated seam. FAIL is an observed failed assertion or absent required behavior. NOT TESTED means no matching execution evidence; a different column's pass never fills that gap.

## Required journeys

| Journey | S1 synthetic service | L2 local HTTP/browser | H1 hosted preview | L1 real Nuvio service |
| --- | --- | --- | --- | --- |
| Open app and render sign-in/guest entry | PASS | PASS | PASS | PASS at loopback origin |
| Continue as guest and navigate | PASS | PASS | PASS | NOT TESTED; guest is local |
| Sign in using existing authorized Nuvio identity | PASS; synthetic only | NOT TESTED | PASS at older hosted8edec42 for scoped login only | PASS initial intended A/B login/authoritative identity |
| Install HTTP add-on and browse legal catalog/details | NOT TESTED | PASS existing #9 fixture | NOT TESTED | NOT TESTED; unrelated service |
| Select supported source and play legal video | NOT TESTED | PASS VP8/Opus and separately observed MP4/HLS/DASH | NOT TESTED | NOT TESTED; unrelated service |
| Pause, seek, resume, then return to browsing | NOT TESTED | PASS after scoped Router correction; complete UI pause/seek/resume→Back→browsing, PR49 verification; merge state recorded in its protected PR | NOT TESTED | NOT TESTED |
| Save item and retain it after reload | PASS synthetic account store/write seam; guest journey separate | PASS complete guest add-on/save/playback/reload journey; local guest persistence only | NOT TESTED | NOT TESTED; API marker insertion is not app Save |
| Switch profiles/accounts without leaking data | PASS synthetic nonempty A/B cases | NOT TESTED; guest profile checks are narrower | NOT TESTED on latest reviewed runtime | FAIL/incomplete B→A Library hydration; no leak observed, complete isolation not established |
| Reload without breaking shell/session | PASS | PASS shell/guest | PASS shell/guest | PASS scoped prior login persistence; latest nonempty switched session NOT TESTED |
| Understand service/source failure and return safely | PASS synthetic auth failures | PASS local403/410/HLS-CORS guidance/return | NOT TESTED for actual source/service failure | FAIL/incomplete switch hydration; clear user recovery not verified |

## Supporting and later gates

| Gate | Current result and boundary |
| --- | --- |
| Subtitle selection | PASS locally after Router correction: showing native English text track with an active original cue, followed by successful return/browse/reload. Hosted/named browser NOT TESTED |
| Audio selection | Local fixture has one Opus track. Menu reports no selectable tracks. Multitrack selection and audible device output NOT TESTED; no multitrack support claim |
| Remote-empty/final-item deletion | PASS synthetic browser/service controls; live application push/delete/receiver deletion NOT TESTED |
| Offline and conflict handling | Synthetic failed-write reload preserves pending edits. Automatic retry/resolution UI is absent; concurrent full-snapshot cloud writers remain unsafe to claim conflict-free. Complete offline/PWA journey NOT TESTED |
| Session expiry/rejection | Synthetic refresh,401 retry, account-switch and refresh-rejection guards PASS; measured live expiry/revocation/QR NOT TESTED |
| Chrome and Edge | No complete named/versioned browser journey yet. Owner's initial Windows/Edge3checks lack version/session detail; do not generalize Chromium results |
| Firefox, Safari and mobile | NOT TESTED on actual named browsers/devices. Linux WebKit/emulation cannot certify Safari/iOS |
| PWA | Hosted automatic worker/cache/reload PASS; local replacement test PASS. Complete offline shell/content/reconnect/mobile installation NOT TESTED |
|4K60/HDR/advanced codecs | Separate later device/fixture gates; local low-rate4K is not sustained high-bitrate/device certification |

## Blocking findings and next milestone

1. #7: B→A Library hydration lacks a successful new response within30s. Fresh independent nonempty B arrival works, marker cleanup is verified. No equivalent live mutation retry is scheduled. New diagnosis must distinguish transport cancellation/network failure from lifecycle behavior without speculative fixes or exposing account data. No new owner permission is needed for synthetic/local diagnosis; exact-candidate upload approval and named Edge observations are external checkpoints.
2. #10 navigation blocker reproduced and corrected locally: stale overlay popstate suppression swallowed explicit Back. Initial stale-guard fix passed locally but failed protected CI and4/5 bounded replays. Actual-player explicit/native controls isolated overlay consumption; final72 Router/focus cases and5 complete guest repeats pass, with final full regression/CI recorded in PR49. Protected integration is recorded in [PR49](https://github.com/saurabhhbansal/nuvioweb/pull/49); hosted verification remains separate. [Playback receipt](evidence/browser-mvp-playback-2026-10-19.md).
3. Hosted legal add-on/media/save journey and named Chrome/Edge evidence are absent. Prepare one controlled candidate containing reviewed MVP fixes and an optional same-host CC0 demo; refresh the dedicated development preview under the standing authorization in [AGENTS.md](../AGENTS.md), then verify actual HTTPS journeys. Do not upload every commit or mark local media as hosted playback.

Next demonstration: hosted guest → optional legal add-on → catalog → source → playback/pause/seek/subtitle → browse → saved Library/reload, plus verified real account isolation. Save/delete/sync coverage stays separate until exercised through actual application actions under a bounded safe protocol.

Estimated remaining browser MVP work:4–8 focused engineering days, low confidence, conditional on a bounded sync-barrier resolution, preview approval and named Chrome/Edge/device access. Cloud conflicts, storage or browser media findings can extend this. No percentage is inferred from issue counts; beta and production are separate later milestones.
