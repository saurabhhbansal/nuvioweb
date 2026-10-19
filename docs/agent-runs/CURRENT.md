# Agent continuity record — current state

Last updated: 2026-10-19, after the hosted B→A switch diagnosis. **Read this first after clearing context.**

This file is the durable handoff. A new agent must be able to resume from it without the previous conversation. Update it at the checkpoints listed in the operating directive, and group updates into the PR that caused them where possible.

## Current state

- Repository `saurabhhbansal/nuvioweb`: clean `main` at `ea54e69f95381de98f05e1c73c1f739a7d830d44` (PR #62 merged). No open PRs at the start of this unit.
- Hosted development preview: `1f67867ebab7f426672886121d852a643a436414`, deployment `b48de821-9034-49cc-8e1f-ab5c50e7fa3a`; rollback deployment `96f977f4` / `8edec42` retained.
- Four required workflows passed on the merged heads `44cbdff` (#66), `c9e4325` (#67) and `38cf2c9` (#70). `docs/PROGRESS.json` reports 26 tickets: 10 verified, 4 in progress (#7, #10, #11, #23), remainder pending.
- #7 and #10 remain open and environment-gated. #11 unit 6a is merged; unit 6b remains. #23 PR A/B (state contract + read-only collector) are merged; the issue-writing publisher and workflow remain.
- Private tooling and credentials are outside Git: `dist/tools/` (git-excluded) and `/home/saurabh/.config/nuvioweb/test-accounts.json` (0600). The file was recovered after a tooling incident; see below.

## Current selection

- Selected ticket: **#11 unit 6b-2** (default-off app seam + CSP/security review) next; 6b-1 (opt-in asset emission) is implemented in the current PR. **#23 PR C** is owner-gated because it introduces `issues: write`. #7/#10 remain environment-gated.
- Current branch: `feat/issue-11-engine-assets`; base `main` at `257640c`.
- Current PR: the 6b-1 opt-in engine asset emission PR (no app import, upload or deployment).
- Last completed atomic tasks: #66 unit 6a (opt-in engine assets + Chromium fixture, review fixes, app1237/1237, browser51/51); #67 pre-code plans for #12/#13/#23; #70 #23 PR A+B (state contract/validator + read-only collector, validator10/10 and collector17/17 offline, Codex review 1P1+12P2 with P1+11 fixed). All merged through protection after GitHub Actions recovered.
- Next exact atomic task: write the unit 6b pre-code plan amendment (default-off app seam, hashed stager emission with `application/wasm`, CSP/`wasm-unsafe-eval` decision, Firefox/WebKit coverage, security/dependency review package) before any application or stager change. Do not implement #23 PR C without explicit owner review of the `issues: write` boundary. Do not repeat the live B→A→B probe; any sync runtime change first needs a deterministic synthetic reproduction.

## Relevant plans and evidence

- Issue plans: [issue #7](../plans/issues/issue-7.md) (includes the marker-probe amendment), [issue #10](../plans/issues/issue-10.md).
- MVP gate: [MVP_ACCEPTANCE.md](../MVP_ACCEPTANCE.md).
- Identity/sync: [IDENTITY_VERIFICATION.md](../IDENTITY_VERIFICATION.md); switch receipt [identity-switch-diagnosis-2026-10-19.json](../evidence/identity-switch-diagnosis-2026-10-19.json).
- Preview: [STATIC_PREVIEW.md](../STATIC_PREVIEW.md), [preview-refresh-2026-10-19.json](../evidence/preview-refresh-2026-10-19.json).
- Playback/quality: [PLAYBACK_QUALITY_MATRIX.md](../PLAYBACK_QUALITY_MATRIX.md), [browser-mvp-playback-2026-10-19.md](../evidence/browser-mvp-playback-2026-10-19.md).
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
- **#7:** one synthetic marker showed B arrival and no marker in A (scoped isolation support), but returning-B restoration failed once with pre-header Library/watched/progress request failures; an immediate read-only repeat passed. The failure category was not captured in the marker run, and the failure is not deterministic. No further marker write will be made. App Save/remove, receiver deletion, live push, add-on identity comparison, measured expiry/revocation/QR, offline recovery and named-device evidence remain open.
- **#11:** unit 6a (merged PR #66) proves in-browser execution of opt-in engine assets in Chromium only. Unit 6b-1 adds opt-in build/stager emission with content-versioned assets, manifest/hash/MIME validation, notices and scoped headers, but no app import or execution. Unit 6b-2 still needs the default-off app seam, flag source, CSP decision, Firefox/WebKit coverage, real-network use and independent security/dependency review; no plugin is shipped, compatible or supported.
- **#23:** PR A/B are merged; no live GitHub call, workflow, issue publication, parity decision or observation baseline exists yet. The publisher's `issues: write` permission requires explicit owner review. Decisions/ports remain empty and the tag/release baseline is unapproved.
- **#10:** hosted guest journey PASS at `1f67867`; branded Edge/Safari/mobile, multitrack/audible output, hosted external-provider CORS and 4K60/HDR remain NOT TESTED or unverified. Chrome for Testing155 and Playwright Firefox157 pass their scoped suites; WebKit cannot be installed on this host; Edge has no ARM64 Linux build.
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

1. `git status` and `git log -1 --oneline`: expect clean `main` at or after `38cf2c9`, then the current evidence/feature branch.
2. Read this file, `docs/plans/issues/issue-11.md` (unit 6a merged, 6b next) and the plugin engine documents; for #23, `docs/plans/issues/issue-23.md` and the upstream-watch review record; for #7, `docs/plans/issues/issue-7.md` and the switch receipts.
3. Hosted preview is `1f67867`/`b48de821`; rollback `96f977f4`/`8edec42`.
4. Credentials: `/home/saurabh/.config/nuvioweb/test-accounts.json` (0600, outside Git). Never print, log, commit, echo to reviewers or pass as a positional value; pass only its path. Recommend rotation after the marker run.
5. Tooling: pinned Node `export PATH=/home/saurabh/.local/share/mise/installs/node/22.23.1/bin:$PATH` (v22.23.1/npm10.9.8); Wrangler `node /home/saurabh/.npm/_npx/d77349f55c2be1c0/node_modules/wrangler/bin/wrangler.js`; Codex per above.
6. Do not repeat an unchanged live probe and do not run another live marker write; the one bounded marker is complete with verified cleanup. A deterministic synthetic reproduction is required before any sync runtime change.
7. #10 remains open for branded Edge/Safari/mobile, multitrack/audible audio, hosted external-provider CORS and 4K60/HDR. #11 unit 6a is complete (test-only browser engine + builder); unit 6b still needs the default-off app seam, stager emission, CSP decision and independent security/dependency review.
8. Goal: keep the persisted objective active; do not mark complete until #7/#10 and the roadmap gates are genuinely satisfied.
