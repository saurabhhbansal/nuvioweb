# Issue #7 review remediation — 2026-10-20

Selected issue: #7; baseline `0212e733275bcb3b95661b288139b69d8b01c064`. Children #117–#120 remain acceptance-specific; no other roadmap work. This plan supersedes the old live-account pause for this bounded run.

Owner instruction (2026-10-20): “tell sol 6.1 high to take this up and fix all the blockers and everything give it full permission to do anything and everything so no blocker is made from my side.” This authorizes scoped fixes, protected PR integration, existing dedicated development-preview refresh and bounded disposable-account validation. It does not bypass protections, permit secret disclosure, mutate unrelated data, or manufacture physical/provider capabilities.

Targets: authManager/qrLoginService owner/exchange boundaries; actual-screen QR and identity fixtures; acceptance validator and canonical links; PROGRESS/TRACKER/support/continuity/review records; owner observation card and sanitized evidence. Private purpose-built live tooling and logs belong in `/home/saurabh/workspace/personal/agent-runs/nuvioweb/sol-fix-all-20261020`.

API contract: owner resolution accepts an optional synchronous ownership guard, checked before cache access and each post-await retry/cache/signout side effect. QR exchange coalesces calls for the same active attempt; polling allows one outstanding request. Expired attempts cannot publish. Existing upstream auth/sync endpoints and identity remain unchanged. Library full snapshots cannot be treated as conflict-safe without server atomic revision evidence.

Before repair reproduce cancellation cache publication and concurrent exchange rejection in actual-module deferred tests. Add deterministic screen cancellation completion, held polling, explicit expiry and both nonempty multi-domain round trips. Record all unexpected fixture destinations except explicit inert resource denials.

Live driver: protect credential path from outputs/overwrite, digest before/after, no secret CLI arguments, no raw storage/HAR/screenshots. Establish scope/state before writes; use attributable disposable records and backups, exact cleanup/readback, no destructive stale snapshots. Investigate supported provider/device paths first. Stop unchanged retries; keep narrowly evidenced external dependencies open.

Required commands: pinned Node22; focused auth/lifecycle, Library/state/repository and acceptance validator tests; inert `NUVIO_LOCAL_PROPERTIES=$PWD/tests/fixtures/build.properties npm run build --prefix app/alpha`; `npx playwright test tests/browser/identity-sync.spec.mjs tests/browser/identity-qr.spec.mjs --project=chromium`; four repository workflow commands including docs/governance, app tests/build and browser CI; `node scripts/check-commit-references.mjs 0212e733275bcb3b95661b288139b69d8b01c064 HEAD`; acceptance --validate (0) and closure (2 while unmet); diff whitespace. Separate automated read-only review of actual diff before protected merge. Verify merged workflows, served source/inventory and hosted guest/live receipts.

Threats: cancelled owner cache/retry/signout; overlapping QR exchanges; expiry; foreign destinations; credential-bearing rendering/logging; destructive same-account snapshot writes; inaccurate acceptance claims. No new privileges, recipients, backend, compute, payments or production release. Existing GPL provenance preserved; preview stays within existing free development project.

Rollback: protected revert PR; retain previous Pages deployment `b6451df5-53cb-45d3-9312-361254bf3463` / `7dcc3717742e04745c018eccd342df0915bbe8fe`. Never delete unrelated account records. Original O1–O3 and closure guards remain unchanged.
