# Issue #117 — executable identity/sync acceptance and nonempty browser fixtures

Parent: [#7](https://github.com/saurabhhbansal/nuvioweb/issues/7). Covers A1–A4 of the closure manifest
(`/home/saurabh/workspace/personal/agent-runs/nuvioweb/issue7-closure-20261020/acceptance-manifest.json`).
Base audited commit: `f30c79f6045786c821047532104c90aa65b861cc`.

## Goal

Replace "a test count or a merged PR means progress" with a fail-closed, criterion-specific
acceptance receipt and validator, and close the missing nonempty built-app fixture coverage for
profiles, add-ons, watched items and watch progress. Synthetic green remains synthetic: it cannot
satisfy a live requirement, cannot explain an earlier live failure and cannot close #7.

## Existing API contract this work touches

- `AuthManager.signInWithEmail` → configured Nuvio `/auth/v1/token?grant_type=password`, then
  `/rest/v1/rpc/get_sync_owner`; session tokens live in `SessionStore` (`localStorage`).
- `ProfileSyncService` pulls `/rest/v1/rpc/sync_pull_profiles`.
- `LibrarySyncService` pulls `/rest/v1/addons` (owner + `profile_id` query) when the active profile
  does not use primary add-ons, otherwise profile `1`.
- `WatchedItemsSyncService` pulls `/rest/v1/rpc/sync_pull_watched_items` with `p_profile_id`.
- `WatchProgressSyncService` pulls `/rest/v1/rpc/sync_pull_watch_progress` with `p_profile_id`.
- `SavedLibrarySyncService` pulls `/rest/v1/rpc/sync_pull_library` with `p_profile_id`.

The fixture must follow those scopes exactly. Account-level data is not re-keyed per profile; only
profile-scoped RPCs and `uses_primary_addons` routing are exercised.

## Acceptance receipt contract

`docs/evidence/issue7-acceptance.json` is the single current disposition record for A1–A8. Each
criterion carries `required_kinds`, one or more observations and a resolution. An observation names
`kind` (`synthetic`, `live` or `review`), `status`, tested 40-hex `commit`, optional `deployment`,
`command_or_observation`, `assertion`, `result`, `artifact`, `limitations` and `gate_owner`.

The validator derives the criterion status from observations instead of trusting a declaration:

- a pass needs every required kind to have a passing observation, a real commit, an existing
  artifact, a substantive assertion and a non-count-only result;
- a live pass additionally needs a named deployment/service;
- an unresolved `fail` observation forces the criterion to `fail`;
- a `blocked` observation forces `blocked`;
- a resolved failure needs a **later, same-kind pass observation on the same criterion** whose
  committed artifact is the reference. Cross-criterion or child-based resolution is rejected because
  synthetic work or a differently scoped child must not erase a live failure.
- pass/fail observations need a real committed 40-hex commit that exists and is an ancestor of the
  tested HEAD; an `observed_at` timestamp orders same-criterion evidence.

`scripts/check-issue7-acceptance.mjs --validate` checks structure and honesty only and exits 0 for an
honest blocked receipt. The default full-closure mode exits 2 when the receipt is structurally valid
but unmet, 1 when it is structurally invalid, and 0 only when all A1–A8 pass, the parent ledger is
genuinely verified, and the closure state is `met`. The immutable O1–O3/A1–A8 mapping is committed in
`docs/evidence/issue7-acceptance-contract.json`, not only in the checker script.

`docs/PROGRESS.json` #7 must remain `in_progress` while the receipt is unmet. A mismatch is a
structural error, not a warning.

## Targets

- `docs/evidence/issue7-acceptance.json`
- `scripts/check-issue7-acceptance.mjs`
- `scripts/check-issue7-acceptance.test.mjs`
- `tests/browser/identity-sync.spec.mjs`
- `docs/evidence/issue7-acceptance-contract.json`
- `docs/evidence/issue7-fixture-closure-2026-10-20.json`
- `docs/evidence/issue7-qr-red-2026-10-20.json`
- `scripts/qr-ownership-probe.mjs`
- `docs/IDENTITY_VERIFICATION.md`, `docs/plans/issues/issue-7.md`, `docs/PROGRESS.json`,
  `TRACKER.md`, `docs/FEATURE_SUPPORT.md`, `docs/agent-runs/CURRENT.md`,
  `docs/ISSUE_7_OWNER_CHECKS.md`

## Non-goals

- No live account, credential, session-log, QR or device use.
- No new authentication service, dependency, backend, proxy or provider recipient.
- No claim that synthetic fixtures prove deployed sync, provider authorization or remote revocation.
- No deletion of historical failing receipts and no re-wording of the original O1–O3 boxes.
- No runtime product change unless a deterministic synthetic test first reproduces a defect.

## Threats and failure modes

- A green validator that still closes #7 on an unmet receipt. The default mode must stay nonzero
  until every criterion passes; `--validate` is explicitly structural only.
- A synthetic observation promoted to satisfy a live requirement. Derived status plus required-kind
  checks reject it.
- A later success silently overwriting an earlier failure. Observations retain the failing row and a
  resolution reference; unresolved failures force `fail`.
- A missing or untraceable artifact/revision. Passing observations require an existing artifact and a
  40-hex tested commit.
- Fixture leakage across account/profile boundaries. Every synthetic response is keyed by the alias
  derived from the bearer token and by the exact `p_profile_id`/`profile_id` in the request; unknown
  routes and unknown mutations fail the test.
- Empty data accepted as proof. Nonempty keys are asserted in the DOM and in the relevant local
  stores, with foreign keys asserted absent.

## Test commands

```bash
node --test scripts/check-issue7-acceptance.test.mjs                                       # 29/29
node scripts/check-issue7-acceptance.mjs docs/evidence/issue7-acceptance.json --validate   # 0
node scripts/check-issue7-acceptance.mjs docs/evidence/issue7-acceptance.json              # 2 while blocked
node scripts/qr-ownership-probe.mjs app/alpha/js --assert-safe                             # red until CH2
NUVIO_LOCAL_PROPERTIES="$PWD/tests/fixtures/build.properties" npm run build --prefix app/alpha
node scripts/check-alpha-build.mjs
npx playwright test tests/browser/identity-sync.spec.mjs --project=chromium
node scripts/check-docs.mjs
node scripts/check-progress.mjs
node --test scripts/check-docs.test.mjs scripts/governance.test.mjs scripts/prepare-static-preview.test.mjs
node scripts/check-commit-references.mjs f30c79f6045786c821047532104c90aa65b861cc HEAD
git diff --check
```

## Cost and privileges

No hosted compute, paid service, credential recipient or new dependency. All verification is local
synthetic Node/Chromium work; CI cost is the existing four protected workflows plus the acceptance
gate and its 29 tests inside the existing Roadmap workflow. The gate adds no workflow permission.

## Rollback

Revert the scoped documentation, fixture and script commit through the protected PR workflow. No
runtime migration, account data, deployment or credential recipient changes. Historical evidence is
retained either way.

## Review and integration

Required CI at the exact final head, a separate technical review of the actual diff, explicit
privacy/auth/cost/regression checks, and protected merge. This is routine scoped work under the
standing delegation; it adds no privilege or credential recipient. Evidence is synthetic/local only.
