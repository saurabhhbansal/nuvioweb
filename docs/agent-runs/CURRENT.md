# Agent continuity record — current state

Last updated: 2026-10-19, after the startup-failure classification unit (#10). **Read this first after clearing context.**

This file is the durable handoff. A new agent must be able to resume from it without the previous conversation. Update it at the checkpoints listed in the operating directive, and group updates into the PR that caused them where possible.

## Current state

- Repository `saurabhhbansal/nuvioweb`: `main` at the merge of PR #77 (`d2a6acd`, startup classification), which sits on top of PR #76 (`775e18c`). No open PRs.
- Hosted development preview: `1f67867ebab7f426672886121d852a643a436414`, deployment `b48de821-9034-49cc-8e1f-ab5c50e7fa3a`; rollback deployment `96f977f4` / `8edec42` retained.
- Four required workflows passed on the merged heads `44cbdff` (#66), `c9e4325` (#67) and `38cf2c9` (#70). `docs/PROGRESS.json` reports 26 tickets: 10 verified, 4 in progress (#7, #10, #11, #23), remainder pending.
- #7 and #10 remain open and environment-gated. #11 unit 6a is merged; unit 6b remains. #23 PR A/B (state contract + read-only collector) are merged; the issue-writing publisher and workflow remain.
- Private tooling and credentials are outside Git: `dist/tools/` (git-excluded) and `/home/saurabh/.config/nuvioweb/test-accounts.json` (0600). The file was recovered after a tooling incident; see below.

## Current selection

- Selected ticket: **#10** (hosted browser MVP playback). The startup-classification unit merged in [PR #77](https://github.com/saurabhhbansal/nuvioweb/pull/77) (`d2a6acd`, all four required checks green at `9a2edff`); the next unit is **automated Playwright WebKit coverage in CI**. **#23 PR C** is owner-gated because it introduces `issues: write`. #7 remains environment-gated.
- Current branch: none; clean `main` at `d2a6acd`.
- Last completed atomic tasks: #66 unit 6a; #67 pre-code plans; #70 #23 PR A+B; #72 unit 6b-1; #76 final Safari observations; startup-failure classification (#10, this PR); hosted nonempty Library B→A; owner manual device checks (Windows11 Edge155 guest checklist PASS, audible audio; iPhone17Pro/iOS27 Safari VP8/Opus demo PASS but native MKV/HEVC/DV/HDR sources fail) and owner app-removal evidence (B cloud1 item vs A2 after removal; one transient switch failure then a successful read-only round trip).
- Next exact atomic task: add Playwright **WebKit** to the browser workflow (an ubuntu runner can install it; this ARM64 host cannot) with synthetic fixtures for a supported H.264/MP4/HLS path, unsupported MKV/HEVC/DV descriptors, header-required messaging and capability-honest return, labelled as engine-family evidence rather than per-iOS-version proof. Do not implement #23 PR C without explicit owner review of the `issues: write` boundary. Do not repeat the live B→A→B probe; any sync runtime change first needs a deterministic synthetic reproduction.
- **Build prerequisite learned this round:** `npm run build --prefix app/alpha` needs `NUVIO_LOCAL_PROPERTIES=<repo>/tests/fixtures/build.properties` for tests (CI does the same). Without it the build falls back to `local.example.properties`, bakes an empty backend URL and fails `scripts/envProperties.test.mjs` / `check-alpha-build.mjs`. Never bake the live backend into a local test build.

## Relevant plans and evidence

- Issue plans: [issue #7](../plans/issues/issue-7.md) (includes the marker-probe amendment), [issue #10](../plans/issues/issue-10.md).
- MVP gate: [MVP_ACCEPTANCE.md](../MVP_ACCEPTANCE.md).
- Identity/sync: [IDENTITY_VERIFICATION.md](../IDENTITY_VERIFICATION.md); switch receipt [identity-switch-diagnosis-2026-10-19.json](../evidence/identity-switch-diagnosis-2026-10-19.json).
- Preview: [STATIC_PREVIEW.md](../STATIC_PREVIEW.md), [preview-refresh-2026-10-19.json](../evidence/preview-refresh-2026-10-19.json).
- Playback/quality: [PLAYBACK_QUALITY_MATRIX.md](../PLAYBACK_QUALITY_MATRIX.md), [browser-mvp-playback-2026-10-19.md](../evidence/browser-mvp-playback-2026-10-19.md), [startup classification evidence](../evidence/startup-classification-2026-10-19.md), [automated review record](2026-10-19-startup-classification-review.md), [device verification](../evidence/device-verification-2026-10-19.md).
- Plugin engine: [issue #11 plan](../plans/issues/issue-11.md), [PLUGIN_COMPATIBILITY.md](../PLUGIN_COMPATIBILITY.md), [PLUGIN_ENGINE_EVALUATION.md](../PLUGIN_ENGINE_EVALUATION.md).
- Upstream watch: [issue #23 plan](../plans/issues/issue-23.md), [state contract](../upstream/state.json), [report schema](../upstream/report.schema.json), [review record](2026-10-19-upstream-watch-review.md).
- Governing sources: [AGENTS.md](../../AGENTS.md), [PROJECT_CHARTER.md](../PROJECT_CHARTER.md), [PRD.md](../PRD.md), [DECISIONS.md](../DECISIONS.md), [ROADMAP.md](../ROADMAP.md), [QUALITY_GATES.md](../QUALITY_GATES.md), [SECURITY_PRIVACY.md](../SECURITY_PRIVACY.md), [PROGRESS.json](../PROGRESS.json), [TRACKER.md](../../TRACKER.md).

## Last verification performed

- Unit 6a (this unit): `node --test app/alpha/scripts/pluginEngineAssets.test.mjs` 7/7; `npx playwright test tests/browser/plugin-engine.spec.mjs --project=chromium` 9/9 (4.2s); `npm test --prefix app/alpha` 1237/1237 (15.1s); lint pass; inert build + `node scripts/check-alpha-build.mjs` 12 assets/no engine files; full `npx playwright test` 51/51 (1.6min). Built assets JS64,698B + WASM1,027,523B, total1,092,221B, MIME `text/javascript`/`application/wasm`, hashes in the evaluation doc.
- Marker and round trip (earlier this session): `node dist/tools/issue7-marker-diagnosis.mjs <owner-only-file> dist/tools/marker-diagnosis-raw.json`, exit0, status `marker-isolation-failed` (B arrival PASS, A absence PASS, returning-B restoration FAIL, cleanup verified); `node dist/tools/issue7-switch-roundtrip.mjs <owner-only-file> dist/tools/roundtrip-raw.json`, exit0, status `roundtrip-b-return-observed` (all three Library pulls200, returning-B ~6.7s). Receipts in `docs/evidence/`.
- Hosted switch diagnosis (earlier this session): `node dist/tools/issue7-switch-diagnosis.mjs <owner-only-file> dist/tools/switch-diagnosis-final.json`, exit0; receipt copied to evidence. Chromium156.0.8078.4/Playwright1.64/LinuxARM64; hosted HTTPS + live primary API; third parties, service workers and legacy full-snapshot Library pushes blocked; no test-record mutation. Page errors0; console errors12 from blocked third-party resources; blocked foreign origins12.
- Earlier hosted refresh (still current deployment): 134/134 artifact hashes, GPL/notices, headers/404/source and automatic worker verified; complete hosted guest journey PASS in Chromium156 with0 uncaught errors; rollback retained. [Receipt](../evidence/preview-refresh-2026-10-19.json).
- Prior baselines remain authoritative for their seams: 1171 application tests, 40 browser/PWA journeys, 76 focused auth/sync/repository cases at `3b602f3`; cross-engine capability at `11ddfa3`; hosted guest journey at `1f67867`.
- Evidence-only PR checks required: `node scripts/check-docs.mjs`, `node --test scripts/check-docs.test.mjs scripts/governance.test.mjs scripts/prepare-static-preview.test.mjs`, `node scripts/check-progress.mjs`, plus links/ledger/ancestry/whitespace and the four protected PR workflows.

## Known failures and limits

- **#7:** the older `LIBRARY_PULL_NOT_OBSERVED` receipts (`8edec42`, loopback `f800920`) are preserved and are **not** explained by the new run; the new run did not reproduce the barrier. During this session, navigating to Library while profile activation was still in progress and stale screens remained mounted reproduced a similar no-navigation/no-pull symptom, so the older failures remain consistent with a harness timing barrier as well as a client/scheduling issue. Root cause unestablished.
- **#7:** nonempty Library isolation passes scoped hosted B→A with owner-created items. The owner added a second item to each account and removed one from B through the app; a fresh control showed A=2/B=1, confirming the removal in cloud state. One post-removal B→A switch failed (Library and critical reads failed before headers) while an immediate read-only B→A→B round trip succeeded all Library pulls — transient/environment-sensitive, cause unestablished. App-level Save/remove, cross-client deletion, expiry/revocation/QR and offline remain open. Owner-created A/B Library items must not be deleted by automation.
- **#11:** unit 6a (merged PR #66) proves in-browser execution of opt-in engine assets in Chromium only. Unit 6b-1 (merged PR #72) adds opt-in build/stager emission with content-versioned assets, manifest/hash/MIME validation, notices and scoped headers, but no app import or execution. Unit 6b-2 still needs the default-off app seam, flag source, CSP decision, Firefox/WebKit coverage, real-network use and independent security/dependency review; no plugin is shipped, compatible or supported.
- **#23:** PR A/B are merged; no live GitHub call, workflow, issue publication, parity decision or observation baseline exists yet. The publisher's `issues: write` permission requires explicit owner review. Decisions/ports remain empty and the tag/release baseline is unapproved.
- **#10:** hosted guest journey PASS; Windows Edge manual guest checklist PASS with audible audio. iPhone Safari plays VP8/Opus but fails native MKV/HEVC/DV/HDR and non-MKV MP4. **Fixed in this unit:** startup failures now carry distinct reasons (`header-required`, `unsupported-container`, `unsupported-codec`, `invalid-content`, `network`, `aborted`, `decode-error`, `startup-stall`, `startup-media-error`, `startup-source-error`, `startup-unknown`) instead of one literal per call site; the header-required WebDL case reports `header-required`, and Matroska/HEVC declarations are classified from Chromium's real `canPlayType`. Evidence: [startup classification](../evidence/startup-classification-2026-10-19.md). Still open: automated WebKit coverage, multitrack audio, a supported HDR observation, hosted external-provider CORS. Owner has paused manual device checks; do not re-run the iPhone checks for this unit.
- Tokens remain XSS-readable in the inherited browser architecture. Local logout is not proof of remote revocation. Snapshot writes still carry concurrent-writer risk.

## Tooling incident and blockers

- **Credential-file overwrite (recovered).** A private diagnostic driver was invoked with swapped positional arguments; its failure handler wrote a sanitized receipt over the owner-only credentials file. No secret was exposed: the receipt contained only revision/status/limits. The original 167-byte file was reconstructed byte-exact from the local session transcript's original `write` event, validated against the owner's credential message and structure, and restored mode0600 with values never printed. Both private tools now reject receipt paths outside `dist/` or `docs/evidence/` and paths equal to the credentials file; the guard was verified with the file hash unchanged. Details: [incident note](2026-10-19-private-tooling-incident.md). Rotate or replace the disposable accounts after the marker verification.
- **Cloudflare:** owner completed `wrangler login`; preview uploads and rollback work. Set `WRANGLER_LOG_PATH` inside the workspace.
- **Codex CLI:** available as `codex-cli 0.163.0` at `/home/saurabh/.local/share/mise/shims/codex`; needs a writable home (`CODEX_HOME=$PWD/.codex-home`) plus `--sandbox read-only`. Use it for planning/review; never send credentials or real account state.
- GitHub Actions recovered after the critical incident; no queued-check blocker remains. Owner action is required only for credential rotation, named-device observations, any new live write beyond the bounded marker plan, and the #23 publisher permission boundary.

## Hosted preview

- Revision `1f67867`, deployment `b48de821-9034-49cc-8e1f-ab5c50e7fa3a`; worker `nuvio-app-shell-0.1.5-f40b9237c1a8`, asset `888e32602070`.
- Rollback deployment `96f977f4` / revision `8edec42` retained.
- Builds are not bit-reproducible: the inherited bundle embeds a build timestamp, so ids change per rebuild. Verify uploads against their own staged inventory.

## Context-clear quick start

1. `git status` and `git log -1 --oneline`: expect clean `main` at or after `775e18c`, then the current feature branch (startup classification, then WebKit CI).
2. Read this file, `docs/plans/issues/issue-11.md` (unit 6a merged, 6b next) and the plugin engine documents; for #23, `docs/plans/issues/issue-23.md` and the upstream-watch review record; for #7, `docs/plans/issues/issue-7.md` and the switch receipts.
3. Hosted preview is `1f67867`/`b48de821`; rollback `96f977f4`/`8edec42`.
4. Credentials: `/home/saurabh/.config/nuvioweb/test-accounts.json` (0600, outside Git). Never print, log, commit, echo to reviewers or pass as a positional value; pass only its path. Recommend rotation after the marker run.
5. Tooling: pinned Node `export PATH=/home/saurabh/.local/share/mise/installs/node/22.23.1/bin:$PATH` (v22.23.1/npm10.9.8); Wrangler `node /home/saurabh/.npm/_npx/d77349f55c2be1c0/node_modules/wrangler/bin/wrangler.js`; Codex per above.
6. Do not repeat an unchanged live probe and do not run another live marker write; the one bounded marker is complete with verified cleanup. A deterministic synthetic reproduction is required before any sync runtime change.
7. #10 remains open for automated WebKit coverage, multitrack/audible audio, hosted external-provider CORS and 4K60/HDR; branded Edge/Safari/mobile spot checks are optional per owner direction. #11 unit 6a is complete (test-only browser engine + builder); unit 6b still needs the default-off app seam, stager emission, CSP decision and independent security/dependency review.
8. Goal: keep the persisted objective active; do not mark complete until #7/#10 and the roadmap gates are genuinely satisfied.
