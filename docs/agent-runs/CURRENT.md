# Agent continuity record — current state

Last updated: 2026-10-19, context-clear handoff. **Read this first after clearing context.**

This file is the durable handoff. A new agent must be able to resume from it without the previous conversation. Update it at the checkpoints listed in the operating directive, and group updates into the PR that caused them where possible.

## Recovery summary (first output of the 2026-10-19 session)

**What exists.** Repository `saurabhhbansal/nuvioweb`, clean `main` at `a1629fefe25aa2bb791ed5283737ffb7646da8f4` (merged PR #49), identical to the stated checkpoint. No open PRs. Four required main workflows (Documentation checks, Locked install/build/tests/lint, Roadmap integrity, Chromium application smoke) pass at that commit. Branch protection still enforces PRs, strict up-to-date CI, admin enforcement, resolved conversations, and denies force pushes/deletions; required approving reviews are zero because the repository has a single collaborator. `docs/PROGRESS.json` reports 26 tickets: 10 verified, 2 in progress (#7, #10), 14 pending/ready. The public development preview https://nuvioweb-preview.pages.dev still serves `8edec4248405d59f5b8639085a1e779e6878911b` (deployment `96f977f4`), which is behind main. No local worktree contains unmerged user work: the extra linked worktrees are historical and prunable, and no stashes or untracked changes exist.

**What is unfinished.** The browser MVP gate is FAIL: #7 still lacks a completed real-account isolation result (B→A Library hydration produced no successful new response within the bounded 30s observation), and #10 lacks hosted HTTPS playback plus named Chrome/Edge/Firefox/Safari/mobile, multitrack audio and sustainable-quality evidence. The hosted preview predates PR #42 and PR #44–#49, so no hosted guest playback, save/reload or account claim exists for current source. Issues #11–#24 remain unstarted roadmap work in dependency order.

**Chosen next task.** Governance first, as required: record the owner's standing autonomous delegation in `AGENTS.md`/`QUALITY_GATES.md`/`DECISIONS.md` so the delegated workflow is transparent rather than silently assumed. Immediately after that: revalidate the prepared clean preview candidate for current main and attempt the controlled development-preview refresh; where the refresh is blocked, complete the local preflight and continue the bounded #7 diagnosis and #10 hosted/named-browser verification.

## Current selection

- Selected ticket: **#7** (real-account login/sync/profile isolation) and **#10** (source descriptors and browser playback capability reporting) remain the only in-progress MVP tickets. Governance/continuity work precedes them and is not a roadmap ticket.
- Current branch: clean `main` at `e6bed408ad0c7890cfae5c85caec88abc2d528fe`; no open PR.
- Current PR: none (PR #61 hosted-evidence merged at `e6bed40`).
- Most recently completed atomic task: deployed `1f67867` to the authorized development preview as `b48de821-9034-49cc-8e1f-ab5c50e7fa3a`; hosted HTTPS/worker and complete hosted guest journey PASS; recorded in PR #61.
- Next exact atomic task: bounded real-account #7 B→A Library switch diagnosis, read-only first, exactly as planned in `docs/plans/issues/issue-7.md` (Codex-ranked, 2026-10-19). No mutation is required for the first run.

## Relevant plans and evidence

- Issue plans: [issue #7](../plans/issues/issue-7.md), [issue #10](../plans/issues/issue-10.md).
- MVP gate: [MVP_ACCEPTANCE.md](../MVP_ACCEPTANCE.md).
- Identity/sync evidence: [IDENTITY_VERIFICATION.md](../IDENTITY_VERIFICATION.md), [identity receipts](../evidence/).
- Preview contract/evidence: [STATIC_PREVIEW.md](../STATIC_PREVIEW.md), [preview receipt](../evidence/preview-2026-10-19.json).
- Playback/quality evidence: [PLAYBACK_QUALITY_MATRIX.md](../PLAYBACK_QUALITY_MATRIX.md), [browser MVP receipt](../evidence/browser-mvp-playback-2026-10-19.md).
- Governing sources: [AGENTS.md](../../AGENTS.md), [PROJECT_CHARTER.md](../PROJECT_CHARTER.md), [PRD.md](../PRD.md), [DECISIONS.md](../DECISIONS.md), [ROADMAP.md](../ROADMAP.md), [QUALITY_GATES.md](../QUALITY_GATES.md), [SECURITY_PRIVACY.md](../SECURITY_PRIVACY.md), [PROGRESS.json](../PROGRESS.json), [TRACKER.md](../../TRACKER.md).

## Last verification performed

- Recovery: `git status`, `git branch -vv`, `git log -5 --oneline`, `git remote -v`, `git worktree list`, `git stash list` — clean main, no stashes, no untracked work. `git fetch --all --prune` — upstream `alpha` mirror advanced to `8a2c2fe` (new tag `v0.1.6`), not merged. 15 open issues (#7–#24), no open PRs. All four required contexts succeeded at `a1629fe`. Branch protection: strict checks, admin enforcement, no force push/deletion, zero required approvals.
- Governance PR #50: `node scripts/check-docs.mjs` pass; `node --test scripts/check-docs.test.mjs scripts/governance.test.mjs` 15/15 pass; `node scripts/check-progress.mjs` valid. Merged at `80f739c` after all four required checks passed on exact head `8936214`.
- Preview candidate at `80f739c` in clean detached worktree: `npm run preview:stage` pass (asset `53a3ebbd44cc`, worker `nuvio-app-shell-0.1.5-134fd4f07f67`); 134/134 inventory hashes independently matched, GPL matched, 10 demo files, 0 forbidden paths. Loopback preflight PASS: 10 hash/header checks, 404s, demo resources, guest navigation/reload/alias, 0 page errors, all third-party origins blocked. Receipt: [preview-candidate-2026-10-19.json](../evidence/preview-candidate-2026-10-19.json).
- Cloudflare access check FAIL: `wrangler 4.129.0 pages project list --json` requires `CLOUDFLARE_API_TOKEN`; OAuth expired `2026-10-19T10:05:01Z`. No upload attempted.
- Capability-aware unit at `11ddfa3`: Chromium `npx playwright test` 42/42; Chrome for Testing 155 40/40 + 2/2 PWA; Playwright Firefox 157 40/40; focused quality/source-preference 9/9 in both Firefox and Chromium. Evidence: [cross-engine capability](../evidence/cross-engine-capability-2026-10-19.json).
- Cross-engine unit at `aff4f062`: `node --test app/alpha/js/data/remote/addonFailure.test.mjs` 6/6; `npm test --prefix app/alpha` 1181/1181; lint pass; inert build/12 assets pass; Chromium `npx playwright test` 42/42; Chrome for Testing 155 40/40 non-PWA plus 2/2 PWA; Playwright Firefox 157 33/40 (7 capability/test-brittleness differences documented in [cross-engine evidence](../evidence/cross-engine-2026-10-19.json)).
- Deployment 2026-10-19: `npm run preview:stage` at `1f67867` (134/134 hashes, GPL, 10 demo files, 0 forbidden), loopback preflight PASS, `wrangler pages deploy` 19 uploaded/114 cached, `verify-live-preview.mjs` PASS (10 hashes, 404s, worker, guest) and `verify-mvp-preview.mjs` PASS (all7 guest journeys, 0 errors). Receipt: [preview-refresh-2026-10-19.json](../evidence/preview-refresh-2026-10-19.json).
- Prior-agent receipts remain authoritative for their tested seams; see the files above.

## Known failures and limits

- **#7:** B→A Library hydration produced no successful new Library response within 30s (`LIBRARY_PULL_NOT_OBSERVED`). Request failures/cancellations were observed but not classified; cause unestablished. No leak observed. No new live mutation retry is planned without a new testable diagnosis.
- **#10:** No hosted HTTPS playback, no branded Edge/Safari/mobile journey, no multitrack/audible-audio claim, no 4K60/HDR certification. Chrome for Testing 155 now passes the complete suite; Playwright Firefox 157 passes the guest journey but its build has no H.264, so H.264 quality and Chromium-hardcoded ordering tests fail there (capability, not product regression). WebKit could not be installed (missing host libraries); Microsoft Edge has no ARM64 Linux build on this host.
- Local guest playback (install → catalog → save → play/pause/seek/resume → subtitle → Back → browse → reload) passes in Chromium headless 156.0.8078.4 on Linux ARM64 only.
- Pending/legacy Library edits lack automatic retry/conflict UI; inherited full-snapshot writes can overwrite concurrent writers.
- Account tokens remain XSS-readable in the inherited browser architecture.

## Known blockers

- **Development-preview upload:** resolved 2026-10-19 — owner completed `wrangler login`; `pages project list` confirmed the existing `nuvioweb-preview` project and deployment `b48de821` succeeded. Set `WRANGLER_LOG_PATH` to a workspace path to avoid harmless EROFS log warnings.
- **#7 live diagnosis material:** resolved 2026-10-19 — owner supplied disposable A/B accounts, saved at `/home/saurabh/.config/nuvioweb/test-accounts.json` (mode 0600, outside Git). Never echo, log, commit or forward its contents; rotate after verification. Synthetic coverage remains green but does not establish live backend behaviour.
- **Codex CLI unavailable:** `codex: command not found` on this host. Planning and review therefore use the same written template executed by the primary agent and a separate reviewer pass; results are recorded as automated, never as independent human approval. See [planning record](2026-10-19-codex-unavailable.md).

## Required approvals

- None for routine verified work under the standing delegation recorded in [AGENTS.md](../../AGENTS.md).
- Owner action: Cloudflare interactive login (blocker above).
- Elevated review remains required for new privileges, credential recipients, payment access, dangerous network behavior or unresolved security risk.

## Hosted preview

- Public development preview revision: `1f67867ebab7f426672886121d852a643a436414`, deployment `b48de821-9034-49cc-8e1f-ab5c50e7fa3a`; worker `nuvio-app-shell-0.1.5-f40b9237c1a8`, asset `888e32602070`. Hosted HTTPS/worker and complete hosted guest journey PASS.
- Rollback: previous deployment `96f977f4` / revision `8edec42` is retained.
- Builds are not bit-reproducible: the inherited bundle embeds a build timestamp, so ids change per rebuild of identical source. Verify uploads against their own staged inventory.


## Context-clear quick start

1. `git status` and `git log -1 --oneline`: expect clean `main` at or after `e6bed40`; no open PRs.
2. Read this file, then `docs/plans/issues/issue-7.md` (Codex-ranked hosted diagnosis) and `docs/evidence/preview-refresh-2026-10-19.json`.
3. Hosted preview is deployed at `1f67867` / deployment `b48de821`; rollback is `96f977f4` / `8edec42`. The complete hosted **guest** journey passes; account isolation does not.
4. #7 accounts are at `/home/saurabh/.config/nuvioweb/test-accounts.json` (0600, outside Git). Never print, log, commit or forward its contents; rotate after verification.
5. Tooling:
   - Codex 0.163.0: `/home/saurabh/.local/share/mise/shims/codex`. Under the workspace-write sandbox it needs a writable home: `CODEX_HOME=$PWD/.codex-home` (already created and git-excluded, with `auth.json`/`config.toml` symlinked read-only). Run `codex exec --sandbox read-only --skip-git-repo-check --output-last-message <path> - < prompt`.
   - Pinned Node: `export PATH=/home/saurabh/.local/share/mise/installs/node/22.23.1/bin:$PATH` (v22.23.1/npm10.9.8).
   - Wrangler: `node /home/saurabh/.npm/_npx/d77349f55c2be1c0/node_modules/wrangler/bin/wrangler.js ...` with `WRANGLER_LOG_PATH` set inside the workspace.
6. Do not run another equivalent live Library mutation retry. The first #7 run is read-mostly; stop at the 30-second barrier and preserve the incomplete result.
7. #10 remains open for branded Edge/Safari/mobile, multitrack/audible audio, hosted external-provider CORS and 4K60/HDR. #11 remains open for the default-off runtime seam after the measured engine decision.
8. Goal: keep the persisted objective active; do not mark complete until #7/#10 and the roadmap gates are genuinely satisfied.
