# Issue #10 real-provider wind-up — 2026-10-20 UTC

## Current disposition

**DEFERRED acceptance; parent [#10](https://github.com/saurabhhbansal/nuvioweb/issues/10) remains OPEN / `in_progress`.** Unknown-metadata criterion verified on actual selected source cards; original supported4K and explainable-error boxes remain unchecked. Child [#137](https://github.com/saurabhhbansal/nuvioweb/issues/137) narrows real-source4K delivery/startup-stall diagnostics; [#138](https://github.com/saurabhhbansal/nuvioweb/issues/138) narrows physical HDR output. All three are labelled `deferred`. No false feature completion, billing/purchase/compute change or production/MVP release.

- [Actual-provider report](../evidence/issue10-real-provider-2026-10-20.md), including acceptance mapping, assumptions, commands, rejected observation runs and limits.
- [Structured real-provider receipt](../evidence/issue10-real-streams-2026-10-20.json): six source-observation runs,240 full returned-row observations, exact per-engine binary/selection/outcome evidence and privacy checks.
- [Plan](../plans/issues/issue-10.md), [engine matrix](../ENGINE_CAPABILITY_MATRIX.md), [central ledger](../PROGRESS.json), [tracker](../../TRACKER.md).

## Proven versus not proven

Actual installed providers, existing authorized test account/profile, normal HTTPS UI; no own addon, custom URL-template source, media packaging or response replacement. Six configured providers, zero custom template sources. Dune's captured30-row response was complete per response but not asserted settled across all providers; Gemini's settled lists reconcile exactly to canonical source cards, with zero pending requests. Full public lists retain informational/non-media rows.

**Working actual source:** [provider] AVC/AAC1080p MKV in Chromium156.0.8078.4:1920×1080,30.0003s wall/29.9841s media,720 total/2 dropped, about24.02 composition-counter fps, pause, seek, post-seek frame and Back. This is not4K/60/HDR/audible-output proof and not a silent downscale of a selected4K source.

**Unverified actual4K:** Chromium's returned HEVC/AC3 HDR10/HFR MKV did not start. WebKit27.2 WPE stalled on this MKV and the AVC/AAC control. Gecko157 exposed3840×2076 metadata/resume clock but zero media advancement/total frames in30.028s; one isolated callback sample does not establish advancing playback. Its observer failed at controls, exit2. The actual returned4K MP4 failed in WebKit and Gecko; filename explicitly says10bit **SDR**, not HDR. No inherent engine ban, host-speed ceiling or mandatory hardware purchase follows. Real header-required HLS guidance and source-error/Back were observed; generic WebKit startup-stall remains insufficiently actionable.

Historical generated/native/loopback and hand-normalized fixture results are **regression-only**, not owner acceptance. Strict60 exit3 stays unchanged. Best-effort callback frequency is not physical output. Physical HDR and combined4K60HDR were not measured; no verified physical output path exists in this headless run.

## Provenance and cleanup

Branch `m2/issue-10-real-provider-acceptance`, base `45d59a16ef19f7bacd70232b98f08150c2081bf7`. Actual served runtime was **`b5a8679404b98649f9c742abc6aa5da00edc50a9`**, deployment `9d9d6d0d-8617-4ed5-bc91-770038162800`. Main was not browser-served. No deploy; existing observers require the pinned runtime. Chromium default headless executable is reconstructed from installed Playwright1.64 selector/registry as `chrome-headless-shell`1248/156 with published hash; initial helper nominal full-browser path did not exist. No actual process-argv capture or backend isolation is claimed.

WPE TLS module discovery was corrected only in this owned private launch environment after controlled HTTPS tests; normal certificate checks stayed enabled. Rejected UI-selector/empty-overlay/resume-clock observations are retained and explained, not converted into passes. Final cumulative all-host non-loopback RX bound3,904,063,870bytes (~3.636GiB) remains below the original4GiB allowance; it includes unrelated traffic and is not per-source throughput/billing accounting.

At **20:21:21Z**, internal fresh-session identity consistency passed; strictly local session logout returned204; both owned private storage-state files were removed after exact path/type checks. Credential hash unchanged. Public receipt/note passed private account/auth/provider literal scanning and a deliberate in-memory access-token injection negative test. Secret state/credentials were never sent to review agents. Ordinary authorized playback/history/onboarding/provider-cache side effects were not broadly reset or stale-restored; already-issued remote operations cannot be undone. New owned browser contexts were closed, not existing operator/observer sessions.

Read-only continuity check at this wind-up: `/proc` reports **PID4037002** and **PID4170556** as sleeping Node processes. Their actual final receipts remain **0bytes**. Initial nonempty observer-marker files are not final results. One attempt to inspect an unnecessary alternate procfs view failed with permission denied after ordinary `/proc` already proved liveness; no alternate access or observer mutation followed. Public SOURCE200 still matchesb5a8679. Waiting is not pass; no #7/#120/#128–130 state, driver, token, clock, session, cleanup handle or acceptance change.

## Integration and continuation

Documentation/evidence-only scope. No app/test/fixture/CI/dependency/auth/fetch/runtime changes. A protected revert reverses this documentation unit only. Required local checks and separate automated Standards/Spec review are recorded in the linked report/PR; exact-head and actual-merge **all four** required contexts remain mandatory before integration is called verified. Codex CLI is absent on PATH; separate read-only automated reviewer passes are the transparent substitute, not independent human approval. Zero required independent approvals remains a repository limitation, not a review claim.

After evidence integration, publish the PR's final exact-head/actual-merge record on #10/#137/#138. Keep #10 open and deferred; do not start another broad synthetic/source-repair campaign or move unpassed original criteria to manufacture closure. Only pick up #137/#138 under their exact recorded real-provider acceptance and actual environment constraints. Do not restart/deploy/change elapsed observers to accelerate them.
