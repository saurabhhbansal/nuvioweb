# Recovery audit — 2026-10-18

Scope: [issue #31](https://github.com/saurabhhbansal/nuvioweb/issues/31), requested by the owner before resuming unfinished development. Initial main: `c924a4b89a41e6acf90a1b3ccb7b6ec89d60e922`. No source restart, deployment, history rewrite or paid service.

## Recovered work

The most recent task is #29 on `m1/issue-29-dependency-advisories`. Its package/lockfile updates, full-audit CI step and issue plan were local and uncommitted; clean installation of that patch had not run because the previous automatic approval review failed on an account usage limit. Those changes were preserved in place and backed up under `/tmp` before using a separate audit worktree. They are partially implemented, not complete and not abandoned.

A separate worktree contains unmerged commit `8f0161919f027626f83f31abb1914c118d248a4a` for #3 (API permission/identity documentation). It has no PR in the inspected repository snapshot. It is preserved for later review; it is not counted as a finished service-permission validation.

PR #26 is already closed without merging and overlaps merged #25; do not duplicate it. Other feature branches retain the completed #1/#4/#5 PR history. All current origin branches, local/worktree branches, issue bodies, PR states/reviews, closure events and recent CI were inspected. Snapshots are in `/tmp/nuvioweb-audit-*.json`; durable evidence is linked below and in the [ledger](PROGRESS.json).

## False completions corrected

GitHub's `ClosedEvent.closer` identifies these exact imported commits. The referenced work concerns unrelated upstream features; the new roadmap acceptance artifacts and verification are absent.

| Roadmap issue | Actual historical closer | Missing roadmap evidence | Disposition |
| --- | --- | --- | --- |
| #12 local audio/container recovery | [26675644f82c](https://github.com/saurabhhbansal/nuvioweb/commit/26675644f82c958e5b0ed7c12b11390ebf0237f4), XML loading; `Resolves #12` | Eligible-device recovery, preserved video/HDR and fallback fixture reports | Reopened with [explanation](https://github.com/saurabhhbansal/nuvioweb/issues/12#issuecomment-6249528047) |
| #13 compute protocol | [7fc5081480d5](https://github.com/saurabhhbansal/nuvioweb/commit/7fc5081480d51eb429098cbe40271f169095fe04), UI card actions; `Fixes #13` | Versioned protocol, mock executor and lifecycle/ownership validation | Reopened with [explanation](https://github.com/saurabhhbansal/nuvioweb/issues/13#issuecomment-6249528527) |
| #15 Docker compute agent | [135b880a5cf8](https://github.com/saurabhhbansal/nuvioweb/commit/135b880a5cf834181d0cc5c39693d0a668e582ff), profile editor; `Closes #15` | Safe FFmpeg agent, pairing, fresh install, cancel/cleanup and bounded media test | Reopened with [explanation](https://github.com/saurabhhbansal/nuvioweb/issues/15#issuecomment-6249529052) |

These closed at 09:27:42–09:27:44 UTC after source import PR #28 merged at 09:27:36. Other closed roadmap tickets were individually checked: #1 → PR #27 provenance/license audit; #2 → PR #25 docs CI; #4 → PR #28 exact tree/ancestry import; #5 → PR #30 clean build/inherited tests/lint. Their closures identify those PRs and have corresponding artifacts and successful CI. None establishes browser MVP functionality. No other false closed issue was found in the snapshot.

GitHub documents that commit closing keywords take effect on the default branch; imported unqualified numbers can therefore collide. The UI auto-close setting documents linked PRs, and no verified public REST/GraphQL switch was found that guarantees suppression of independent commit-message closures. We did not invent or claim to set one. [GitHub linking rules](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue), [auto-closing setting](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-auto-closing-issues).

## Prevention and review workflow

- `docs/PROGRESS.json` records completion evidence and dependencies; a closed GitHub label is not the source of truth. A verified entry needs a specific evidence PR, documentation and verification record. Cancellation remains distinct from completion.
- `scripts/check-commit-references.mjs BASE HEAD` scans **all** newly reachable commit messages, including non-first-parent imported ancestry. Local closing-reference collisions fail CI before merge. Preserve original upstream SHAs/messages/notices; unresolved imports stay blocked rather than sanitizing history.
- Project commit/PR text uses `Refs #N`. Close a ticket explicitly after its acceptance evidence is merged. Immediately reconcile issue timelines after any future import.
- PR title and description edits rerun preflight. GitHub lets maintainers customize the generated merge/squash message after PR checks; do not introduce closing directives there, and always reconcile post-merge timelines. This remaining metadata boundary is a process limitation, not a guarantee provided by branch protection.

The default-branch closed-issue workflow requires verified ledger evidence and an actually merged matching PR. It reopens unsupported closures and explains why. This is a repair guard, not a claim that GitHub can never emit a transient close event. Its token has issue-write permission only for the closed-issue job; PR validation has read-only contents access.
- Nine focused governance regressions cover the three historical forms, qualified references, absent/incomplete/unmerged evidence, invalid dependencies and a synthetic unrelated-history import. Existing upstream history/license remains unchanged.

## Main protection applied and read back

`GET /repos/saurabhhbansal/nuvioweb/branches/main/protection` initially returned 404, “Branch not protected.” Repository permissions include admin; the sole collaborator is the owner. Protection was then configured through the supported API and read back:

| Control | Applied state |
| --- | --- |
| Pull request workflow | Required |
| Existing checks | `Docs links and checker tests`; `Locked install, build, tests and lint`, both bound to GitHub Actions app 15368 |
| Up-to-date branch | Required (`strict: true`) |
| Apply to administrators | Enabled |
| Force pushes / branch deletion | Disabled / disabled |
| Conversation resolution | Required |
| Independent approvals | **0**, sole-maintainer limitation |
| Linear history | Not required, preserving original import merge ancestry |

After the first successful review-fixed PR run, `Roadmap and import checks` and `Chromium application smoke` were also made required, bound to Actions app 15368, and the four-context settings were read back. The API explicitly supports zero required approvals. This requires the PR path while allowing normal autonomous maintenance; it does **not** enforce independent review. [Protection API](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection), [protected branch behavior](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

Earlier merged PRs have no recorded GitHub reviews. This audit does not retroactively label self-inspection as independent approval. Automated reviewer findings are recorded as automated, and human owner review remains required before merging auth, payment, plugin sandbox, remote-fetch or compute-isolation behavior changes. No bypass actors or admin bypass were introduced.

## Browser evidence and limits

Run the root pinned browser tooling against the built static application, without upstream sidecars:

```bash
npm ci
npx playwright install chromium
cd app/alpha
HUSKY=0 npm ci
NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build
cd ../..
npm run test:browser
```

The fixture server binds loopback only. Tests use a real Chromium browser, block all external requests, do not use live identities/media, and exercise the actual built bundle. Service workers are intentionally blocked in this initial smoke, so this does not verify PWA updates or offline caching. Browser traces/screenshots are local ignored test artifacts. [Playwright web-server mechanism](https://playwright.dev/docs/test-webserver).

Initial observations: startup/sign-in rendering, empty-form validation and unreachable-backend failure handling pass. The first guest test incorrectly assumed a profile picker on initial guest entry; the observed existing flow enters home immediately and shows the profile picker after reload. The test was corrected to assert that actual public flow, with no application changes. Final local run: **4 passed, 0 failed, 0 skipped**, 17.4 seconds on Playwright 1.64.0 / Chromium headless 156.0.8078.4. Guest Home/Search/Library/Settings navigation and guest/profile choices after reload pass. Test navigation uses actual accessible buttons; initial selectors were corrected to those public controls. Final journey results and remaining gaps are in the [feature matrix](FEATURE_SUPPORT.md); no success is claimed for live auth/refresh/sync, add-on installation/catalog data, playback/tracks/subtitles, real-provider CORS, Firefox/Safari/mobile or public hosting until those journeys have their own evidence.

## Resume order and forecast

After integrating this recovery through protected CI, resume the existing #29 branch and verify its pending dependency patch. Then prioritize #8 sidecar capability isolation and #9 legal add-on/browser fixtures; #10 playback descriptors and real media follow their dependencies. #3 requires upstream hosted-service evidence; #6 requires explicit public-deployment approval and account access. Independent work continues while those external gates remain open.

The [central tracker](../TRACKER.md) lists every ticket, dependencies and current counts. Engineering effort estimates are planning ranges, not calendar promises: browser MVP 5–10 focused engineer-days after external auth/config access; feature-complete roadmap beta approximately 8–16 engineer-weeks including sandbox/compute/security work; stable production an additional 4–8 weeks of cross-device, security, operational and release verification. Confidence is low, especially for plugin compatibility, codecs/HDR, compute economics and external permission/payment gates. Source imported and tests passing are completed foundation milestones; neither is a realistic-browser MVP, beta or production release.

## Automated review and corrections

Two code-review axes were run against base `c924a4b`: Standards and Spec. They are automated agent reviews, not independent human approval. Standards identified missing PR-title/edited-event coverage and ambiguous structural-validation wording; Spec identified an evidence-PR 404 that could prevent reopening. All were corrected with metadata-path, missing-PR and permission-error regression coverage. CI also caught overly broad matching of ordinary audit prose; a focused red test reproduced it, then immediate-reference parsing passed while preserving the historical cases. Final local governance/docs total: **15 passed, zero failures/skips**. Both automated reviewers rechecked their fixes and reported no remaining concrete scoped blockers.

The ledger's local validation checks structure, paths and dependency records; it does not independently prove acceptance or a remote merge. The closure guard verifies the actual matching merged PR through GitHub, and the manual audit establishes current completion evidence. Only the protected default-branch ledger is authoritative; proposed feature-branch entries do not complete a ticket before integration. See [recovery PR #32](https://github.com/saurabhhbansal/nuvioweb/pull/32) for final required CI and the recorded automated review.

Remote review-fixed verification: [governance](https://github.com/saurabhhbansal/nuvioweb/actions/runs/39125636782/job/117670048751), [Chromium](https://github.com/saurabhhbansal/nuvioweb/actions/runs/39125636740/job/117670048596), [app baseline](https://github.com/saurabhhbansal/nuvioweb/actions/runs/39125636768/job/117670048774) and [docs](https://github.com/saurabhhbansal/nuvioweb/actions/runs/39125636784/job/117670048735) all passed. The issue-write event guard is a separate workflow from required read-only PR checks, avoiding skipped event jobs replacing those validation contexts. No bypass was used.
