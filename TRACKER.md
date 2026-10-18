# NuvioWeb progress and forecast

As of 2026-10-18. Source of truth: [acceptance-evidence ledger](docs/PROGRESS.json), [recovery audit](docs/RECOVERY_AUDIT.md), and linked PR/CI records. GitHub closed labels and inherited test counts alone are not product completion. Only main is authoritative; completion entries in an unmerged PR are proposed until their evidence PR merges.

Total tickets: **26**. Verified completed: **7**. In progress: **0**. External blockers: **1**. Ready: **3**. Pending dependencies/implementation: **15**.

The initial 24 roadmap tickets are retained, plus dependency remediation #29 and owner-requested recovery #31. Remaining unfinished tickets include all non-verified rows below; blocked work is included rather than hidden.

| Ticket | State | Dependencies | Evidence or precise limitation |
| --- | --- | --- | --- |
| [#1](https://github.com/saurabhhbansal/nuvioweb/issues/1) [M0][P0] Validate upstream licenses, provenance, and import strategy | verified | None | PR #27; acceptance/verification in linked ledger documents |
| [#2](https://github.com/saurabhhbansal/nuvioweb/issues/2) [M0][P0] Set up GitHub CI, PR review, and docs verification | verified | None | PR #25; acceptance/verification in linked ledger documents |
| [#3](https://github.com/saurabhhbansal/nuvioweb/issues/3) [M0][P0] Verify Nuvio hosted API usage terms and identity requirements | blocked_external | None | Identity-contract research preserved in draft PR #34; human auth/security review pending. Owner accepted documented public APIs; unlisted/session semantics unverified. |
| [#4](https://github.com/saurabhhbansal/nuvioweb/issues/4) [M1][P0] Import pinned Alpha NuvioWeb browser baseline with attribution | verified | #1 | PR #28; acceptance/verification in linked ledger documents |
| [#5](https://github.com/saurabhhbansal/nuvioweb/issues/5) [M1][P0] Reproduce upstream install, build, lint and unit tests | verified | #4, #2 | PR #30; acceptance/verification in linked ledger documents |
| [#6](https://github.com/saurabhhbansal/nuvioweb/issues/6) [M1][P0] Deploy free static browser preview on Cloudflare | verified | #5 | PR #36; live development preview, actual Chromium guest/worker checks and deployed artifact/header/source evidence. |
| [#7](https://github.com/saurabhhbansal/nuvioweb/issues/7) [M1][P0] Validate existing Nuvio login, sync and profile isolation | pending | #6, #3 | Implementation/verification outstanding |
| [#8](https://github.com/saurabhhbansal/nuvioweb/issues/8) [M1][P1] Inventory and safely isolate upstream sidecar-dependent routes | ready | #5 | Implementation/verification outstanding |
| [#9](https://github.com/saurabhhbansal/nuvioweb/issues/9) [M2][P0] Build legal add-on interoperability fixtures and test matrix | ready | #5 | Implementation/verification outstanding |
| [#10](https://github.com/saurabhhbansal/nuvioweb/issues/10) [M2][P0] Implement source descriptors and browser playback capability reporting | pending | #9, #5 | Implementation/verification outstanding |
| [#11](https://github.com/saurabhhbansal/nuvioweb/issues/11) [M2][P1] Prototype sandboxed Nuvio JavaScript plugin compatibility | pending | #9, #1 | Implementation/verification outstanding |
| [#12](https://github.com/saurabhhbansal/nuvioweb/issues/12) [M2][P1] Prototype quality-preserving local audio and container recovery | pending | #10, #1 | Implementation/verification outstanding |
| [#13](https://github.com/saurabhhbansal/nuvioweb/issues/13) [M3][P0] Define versioned compute protocol and strict job lifecycle | pending | #10 | Implementation/verification outstanding |
| [#14](https://github.com/saurabhhbansal/nuvioweb/issues/14) [M3][P0] Implement Nuvio-verified agent pairing, grants and revocation | pending | #13, #3 | Implementation/verification outstanding |
| [#15](https://github.com/saurabhhbansal/nuvioweb/issues/15) [M3][P0] Package a safe single-service Docker FFmpeg compute agent | pending | #13, #14 | Implementation/verification outstanding |
| [#16](https://github.com/saurabhhbansal/nuvioweb/issues/16) [M3][P1] Publish Bring Your Own Cloudflare Worker Lite template | pending | #13, #14 | Implementation/verification outstanding |
| [#17](https://github.com/saurabhhbansal/nuvioweb/issues/17) [M3][P2] Validate assisted Cloudflare Worker + Container compute deployment | pending | #15, #16 | Implementation/verification outstanding |
| [#18](https://github.com/saurabhhbansal/nuvioweb/issues/18) [M3][P2] Evaluate optional desktop compute companion | pending | #13, #14, #15 | Implementation/verification outstanding |
| [#19](https://github.com/saurabhhbansal/nuvioweb/issues/19) [M4][P0] Benchmark compute cost and design user-facing prepaid quotes | pending | #15, #13 | Implementation/verification outstanding |
| [#20](https://github.com/saurabhhbansal/nuvioweb/issues/20) [M4][P0] Build Nuvio-verified entitlements and atomic credits ledger | pending | #3, #19 | Implementation/verification outstanding |
| [#21](https://github.com/saurabhhbansal/nuvioweb/issues/21) [M4][P1] Implement isolated metered hosted processing jobs | pending | #20, #13, #19 | Implementation/verification outstanding |
| [#22](https://github.com/saurabhhbansal/nuvioweb/issues/22) [M4][P1] Integrate eligible payment provider and transparent credit checkout | pending | #20, #21 | Implementation/verification outstanding |
| [#23](https://github.com/saurabhhbansal/nuvioweb/issues/23) [M5][P1] Automate upstream change monitoring and reviewed parity tracking | ready | #4, #5 | Implementation/verification outstanding |
| [#24](https://github.com/saurabhhbansal/nuvioweb/issues/24) [M5][P1] Define full browser device, security and staged release verification | pending | #5, #9, #10 | Implementation/verification outstanding |
| [#29](https://github.com/saurabhhbansal/nuvioweb/issues/29) [M1][P1] Remediate audited build-tool dependency advisories before release | verified | #5 | PR #33; clean install/build, 1,079 unit tests, 4 Chromium journeys, lint and zero-advisory audits; proposed until protected integration |
| [#31](https://github.com/saurabhhbansal/nuvioweb/issues/31) Recovery audit, branch safeguards and browser evidence | verified | #1, #2, #4, #5 | PR #32; recovery acceptance evidence and CI in the audit |

## What works and what remains unverified

Source import and provenance are verified. A pinned Node 22 clean install/build, 1,079 inherited upstream tests, lint and distribution-asset checks pass. Four real Chromium smoke tests now pass for signed-out startup, validation/network errors and guest navigation/persistence; see the [feature matrix](docs/FEATURE_SUPPORT.md) for observed results and limits.

The [public development preview](https://nuvioweb-preview.pages.dev) passes actual Chromium shell/guest/automatic-worker and deployed artifact/header/source checks; local real worker replacement tests pass. Live authentication/session refresh/account isolation/sync, actual add-on/catalog/provider CORS, legal media playback/audio/subtitles, cross-browser codecs/HDR and full offline/PWA lifecycle remain unverified. Native sidecars are not deployed. The #29 patch removes all eight observed build-tool advisory records locally; PR #33 records protected integration evidence; release notice/asset/font/native rights gates remain open.

## Milestones, forecast and next demonstration

| Milestone | State / remaining effort |
| --- | --- |
| Source successfully imported | Verified: PR #28 preserves exact source tree, original history and notices |
| Application builds and inherited tests pass | Verified: PR #30; does not establish browser behavior |
| Browser MVP in a realistic environment | Not achieved; initial estimate 5–10 focused engineer-days after backend/config permission and access, low confidence |
| Feature-complete roadmap beta | Not achieved; rough 8–16 engineer-weeks including plugin sandbox, own/hosted compute and security, low confidence |
| Stable production-ready release | Not achieved; additional 4–8 weeks of cross-device/security/release/operational work, very low confidence; external waits excluded |

The next meaningful demonstration is a guest installing a local legal HTTP add-on, browsing its catalog and initiating a supported media fixture with explicit errors. After #29 protected integration, continue deployment preparation and #8/#9/#10 by dependency. Public development preview is deployed and verified as a shell; paid services and sensitive behavior changes retain review gates. These are effort estimates, not dates or progress percentages inferred from ticket counts.

Independent human review is unavailable with one collaborator; required approvals are zero and automated review is explicitly labelled. Main still enforces PRs, mandatory up-to-date CI, no force pushes/deletion and resolved conversations. Sensitive changes require a separate explicit human checkpoint.
