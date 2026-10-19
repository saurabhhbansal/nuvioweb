# Agent continuity record — current state

Last updated: 2026-10-19, after the hosted B→A switch diagnosis. **Read this first after clearing context.**

This file is the durable handoff. A new agent must be able to resume from it without the previous conversation. Update it at the checkpoints listed in the operating directive, and group updates into the PR that caused them where possible.

## Current state

- Repository `saurabhhbansal/nuvioweb`: clean `main` at `ea54e69f95381de98f05e1c73c1f739a7d830d44` (PR #62 merged). No open PRs at the start of this unit.
- Hosted development preview: `1f67867ebab7f426672886121d852a643a436414`, deployment `b48de821-9034-49cc-8e1f-ab5c50e7fa3a`; rollback deployment `96f977f4` / `8edec42` retained.
- Four required workflows pass at `ea54e69`. `docs/PROGRESS.json` reports 26 tickets: 10 verified, 3 in progress (#7, #10, #11), remainder pending/ready.
- #7 and #10 remain open. #11 remains open for the default-off runtime seam after its measured engine decision.
- Private tooling and credentials are outside Git: `dist/tools/` (git-excluded) and `/home/saurabh/.config/nuvioweb/test-accounts.json` (0600). The file was recovered after a tooling incident; see below.

## Current selection

- Selected ticket: **#7** (real-account login/sync/profile isolation), with #10 evidence work in parallel when blocked.
- Current branch: `docs/issue-7-switch-diagnosis` (evidence/ledger PR for the hosted switch result).
- Current PR: the evidence PR opened from that branch.
- Last completed atomic task: hosted `1f67867` bounded read-mostly B→A switch diagnosis. Distinct owners; fresh A control164 watched/156 progress, B0/0; after actual Sign Out → A sign-in → primary-profile activation → Library, a new A-epoch `sync_pull_library` completed200 at ~5.9s and A's164/156 watched/progress identities matched fresh A exactly with no B set. Older missing-pull barrier not reproduced with corrected activation waits.
- Next exact atomic task: implement the private corrected-harness marker driver per the plan amendment in [issue #7 plan](../plans/issues/issue-7.md) — one synthetic incremental insert in B/profile1, independent B/A/B verification, and verified exact-key cleanup in `finally`. One run only; stop mutations if cleanup is uncertain. Then record the sanitized receipt and update the identity/MVP/ledger records.

## Relevant plans and evidence

- Issue plans: [issue #7](../plans/issues/issue-7.md) (includes the marker-probe amendment), [issue #10](../plans/issues/issue-10.md).
- MVP gate: [MVP_ACCEPTANCE.md](../MVP_ACCEPTANCE.md).
- Identity/sync: [IDENTITY_VERIFICATION.md](../IDENTITY_VERIFICATION.md); switch receipt [identity-switch-diagnosis-2026-10-19.json](../evidence/identity-switch-diagnosis-2026-10-19.json).
- Preview: [STATIC_PREVIEW.md](../STATIC_PREVIEW.md), [preview-refresh-2026-10-19.json](../evidence/preview-refresh-2026-10-19.json).
- Playback/quality: [PLAYBACK_QUALITY_MATRIX.md](../PLAYBACK_QUALITY_MATRIX.md), [browser-mvp-playback-2026-10-19.md](../evidence/browser-mvp-playback-2026-10-19.md).
- Governing sources: [AGENTS.md](../../AGENTS.md), [PROJECT_CHARTER.md](../PROJECT_CHARTER.md), [PRD.md](../PRD.md), [DECISIONS.md](../DECISIONS.md), [ROADMAP.md](../ROADMAP.md), [QUALITY_GATES.md](../QUALITY_GATES.md), [SECURITY_PRIVACY.md](../SECURITY_PRIVACY.md), [PROGRESS.json](../PROGRESS.json), [TRACKER.md](../../TRACKER.md).

## Last verification performed

- Hosted switch diagnosis (this unit): `node dist/tools/issue7-switch-diagnosis.mjs <owner-only-file> dist/tools/switch-diagnosis-final.json`, exit0; receipt copied to evidence. Chromium156.0.8078.4/Playwright1.64/LinuxARM64; hosted HTTPS + live primary API; third parties, service workers and legacy full-snapshot Library pushes blocked; no test-record mutation. Page errors0; console errors12 from blocked third-party resources; blocked foreign origins12.
- Earlier hosted refresh (still current deployment): 134/134 artifact hashes, GPL/notices, headers/404/source and automatic worker verified; complete hosted guest journey PASS in Chromium156 with0 uncaught errors; rollback retained. [Receipt](../evidence/preview-refresh-2026-10-19.json).
- Prior baselines remain authoritative for their seams: 1171 application tests, 40 browser/PWA journeys, 76 focused auth/sync/repository cases at `3b602f3`; cross-engine capability at `11ddfa3`; hosted guest journey at `1f67867`.
- Evidence-only PR checks required: `node scripts/check-docs.mjs`, `node --test scripts/check-docs.test.mjs scripts/governance.test.mjs scripts/prepare-static-preview.test.mjs`, `node scripts/check-progress.mjs`, plus links/ledger/ancestry/whitespace and the four protected PR workflows.

## Known failures and limits

- **#7:** the older `LIBRARY_PULL_NOT_OBSERVED` receipts (`8edec42`, loopback `f800920`) are preserved and are **not** explained by the new run; the new run did not reproduce the barrier. During this session, navigating to Library while profile activation was still in progress and stale screens remained mounted reproduced a similar no-navigation/no-pull symptom, so the older failures remain consistent with a harness timing barrier as well as a client/scheduling issue. Root cause unestablished.
- **#7:** both accounts' Libraries are empty. Nonempty Library isolation, app Save/delete/receiver deletion, live push and deletion propagation remain unverified. No add-on identity comparison was made in the switch run. Measured expiry/revocation/QR, offline recovery and named-device evidence remain open.
- **#10:** hosted guest journey PASS at `1f67867`; branded Edge/Safari/mobile, multitrack/audible output, hosted external-provider CORS and 4K60/HDR remain NOT TESTED or unverified. Chrome for Testing155 and Playwright Firefox157 pass their scoped suites; WebKit cannot be installed on this host; Edge has no ARM64 Linux build.
- Tokens remain XSS-readable in the inherited browser architecture. Local logout is not proof of remote revocation. Snapshot writes still carry concurrent-writer risk.

## Tooling incident and blockers

- **Credential-file overwrite (recovered).** A private diagnostic driver was invoked with swapped positional arguments; its failure handler wrote a sanitized receipt over the owner-only credentials file. No secret was exposed: the receipt contained only revision/status/limits. The original 167-byte file was reconstructed byte-exact from the local session transcript's original `write` event, validated against the owner's credential message and structure, and restored mode0600 with values never printed. Both private tools now reject receipt paths outside `dist/` or `docs/evidence/` and paths equal to the credentials file; the guard was verified with the file hash unchanged. Details: [incident note](2026-10-19-private-tooling-incident.md). Rotate or replace the disposable accounts after the marker verification.
- **Cloudflare:** owner completed `wrangler login`; preview uploads and rollback work. Set `WRANGLER_LOG_PATH` inside the workspace.
- **Codex CLI:** available as `codex-cli 0.163.0` at `/home/saurabh/.local/share/mise/shims/codex`; needs a writable home (`CODEX_HOME=$PWD/.codex-home`) plus `--sandbox read-only`. Use it for planning/review; never send credentials or real account state.
- No open blocker requires owner action for the next synthetic/private diagnosis. Owner action remains recommended for credential rotation and later named-device observations; any new live write beyond the bounded marker plan needs a committed plan amendment.

## Hosted preview

- Revision `1f67867`, deployment `b48de821-9034-49cc-8e1f-ab5c50e7fa3a`; worker `nuvio-app-shell-0.1.5-f40b9237c1a8`, asset `888e32602070`.
- Rollback deployment `96f977f4` / revision `8edec42` retained.
- Builds are not bit-reproducible: the inherited bundle embeds a build timestamp, so ids change per rebuild. Verify uploads against their own staged inventory.

## Context-clear quick start

1. `git status` and `git log -1 --oneline`: expect clean `main` at or after `ea54e69`, then the current evidence/feature branch.
2. Read this file, `docs/plans/issues/issue-7.md` (marker amendment) and `docs/evidence/identity-switch-diagnosis-2026-10-19.json`.
3. Hosted preview is `1f67867`/`b48de821`; rollback `96f977f4`/`8edec42`.
4. Credentials: `/home/saurabh/.config/nuvioweb/test-accounts.json` (0600, outside Git). Never print, log, commit, echo to reviewers or pass as a positional value; pass only its path. Recommend rotation after the marker run.
5. Tooling: pinned Node `export PATH=/home/saurabh/.local/share/mise/installs/node/22.23.1/bin:$PATH` (v22.23.1/npm10.9.8); Wrangler `node /home/saurabh/.npm/_npx/d77349f55c2be1c0/node_modules/wrangler/bin/wrangler.js`; Codex per above.
6. Do not repeat an unchanged-source live probe. The next live write is the bounded marker unit already amended in the plan; one run, exact-key cleanup, stop on uncertainty.
7. #10 remains open for branded Edge/Safari/mobile, multitrack/audible audio, hosted external-provider CORS and 4K60/HDR. #11 remains open for the default-off runtime seam.
8. Goal: keep the persisted objective active; do not mark complete until #7/#10 and the roadmap gates are genuinely satisfied.
