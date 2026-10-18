# Issue #3: API terms and identity contract

**Status:** Documentation contract reviewed and approved by the owner on 2026-10-18; protected integration and verification in progress. No auth implementation delivered.

**Issue:** https://github.com/saurabhhbansal/nuvioweb/issues/3 (OPEN, no comments or blocking dependencies when checked 2026-10-18).

**Workstream:** [M0 foundations](../M0-DOCS.md).
**Branch:** `issue-3-api-terms-identity-contract`, created from fetched `origin/main` at `a02a7cc355c9b77531bc8fdabb02ddec6f43e4e4`. Only this managed worktree is used; issue #5 and the original checkout are excluded.

## Entry evidence and scope

Read AGENTS.md and the charter, PRD, decisions, roadmap, security/privacy and quality gates; review upstream provenance/license evidence and the imported Alpha source at `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff`. The approved charter and credential-free research satisfy issue dependencies. Public hosted API permission is a release dependency, not a reason to stop documentation.

Research public primary service terms and constraints, map the imported auth/session/owner flow, specify future authoritative control-plane verification, consent and fallback. Source licensing cannot establish hosted service permission.

## Target files and API contract

- `docs/NUVIO_IDENTITY_CONTRACT.md`: dated sources/revisions; permission decision; auth and sync request/response map; verified issuer/subject versus sync-owner boundaries; consent; synthetic fixture verification plan; release gates, limitations and rollback.
- `docs/FEATURE_SUPPORT.md`: distinguish documented identity contract, permission uncertainty and unexecuted integration checks.
- `docs/SECURITY_PRIVACY.md` and `docs/DECISIONS.md`: link the normative contract and permission gate without implying a deployed verifier.
- This issue plan: concrete scope and exact observed verification outcomes.

Document existing password/refresh token POSTs, authenticated `get_sync_owner` RPC, QR bootstrap/exchange, storage and logout/account switching. Specify a future server-side access-token verifier using an approved fixed upstream user endpoint and, where supported, signature/issuer/audience/expiry/session validation. Its identity key is the verified issuer plus stable authenticated subject, never a browser ID, decoded JWT, profile index or shared sync owner. No endpoint is asserted live merely because it exists in source or generic Supabase documentation.

## Sequence and non-goals

1. Recheck current issue and fetched main; create a dedicated branch.
2. Update this plan before deliverable changes.
3. Inspect pinned source and public first-party pages; record evidence limitations, without authenticated service requests or contacting anyone.
4. Write the contract, synthetic/redacted fixture cases and permission-unavailable fallback; update support/security/decision links.
5. Run only documentation checks below, review scoped diff and record results.
6. Commit, push and open a draft PR using `Refs #3`, preserving issue state and human auth review.

No application edits, new login, password database, live tokens/account data, actual verifier implementation, new test harness, issue #5 builds/lint, deployment, payments, compute, issue closure or merge. A background research agent checks only public primary sources and writes temporary research notes outside the repo, as required by the research skill.

## Threat, privacy, license and cost review

Cover unsigned/expired/revoked/anonymous tokens, confused issuer/audience, shared owner privilege escalation, account-switch races, refresh replay, fallback credential forwarding, XSS/localStorage, logging and fail-open outages. Processing agents never receive Nuvio tokens/passwords. Consent to upstream login/sync does not authorize pairing, credentials export or paid compute. Preserve imported source/licenses intact. No service/compute spending is incurred; future verification traffic needs agreed quotas, deadlines and backoff. Lack of documented rates is not an unlimited allowance.

## Verification commands and acceptance

Required for this documentation-only change:

```sh
node --test scripts/check-docs.test.mjs
node scripts/check-docs.mjs
git diff --check
git diff --name-only origin/main...HEAD
```

Before commit, inspect `git diff --name-only` as well because the three-dot diff excludes uncommitted changes. Manually check every identity mapping against pinned source and public permission claim against its cited source; record synthetic cases as planned, not executed integration results. No live auth/network fixture tests, application build/lint or browser/device checks are required for this docs-only scope.

Acceptance: public constraints/uncertainty and release gate documented; authoritative stable identity and consent specified; no duplicate account/password system; usable fallback; reviewable draft PR with evidence. Research can be complete while external permission and implementation review remain unresolved; do not mark the GitHub issue complete on that basis.

## Rollback and ownership

Revert the documentation commit through review and restore prior matrix/links; retain investigation history. No runtime, account, token, media, billing or infrastructure rollback is needed. Project owner and human auth/security reviewer own acceptance; only the service operator can establish missing permission. No maintainer outreach is authorized.

## Execution record

- Initial sandboxed `gh issue view 3 --repo saurabhhbansal/nuvioweb --json number,title,body,state,labels,comments,url` failed (exit 1: network connection). Authorized network retry succeeded (exit 0); issue OPEN, expected scope, no comments.
- `git fetch origin main` succeeded (exit 0). Initial `git switch -c issue-3-api-terms-identity-contract origin/main` failed (exit 128: linked-worktree metadata read-only); authorized metadata-write retry succeeded (exit 0). No other checkout files or branch were changed.
- `git ls-remote alpha refs/heads/web` — exit 0; still `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff`. `git diff --exit-code 5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff^{tree} HEAD:app/alpha` — exit 0, unchanged imported tree. `sha256sum app/alpha/LICENSE` — exit 0, `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`.
- Public research used web browsing and credential-free public fetches. Browser extraction failed for `/docs/nuvio-public-api.md` and yielded no text for client-rendered terms; raw public assets succeeded. `/privacy` was unavailable/404; the correct policy is `/privacy-policy`. A delegated initial raw-source fetch was interrupted (exit 130), then pinned fetches succeeded. These are retrieval limitations, not passed service tests. An exploratory `rg` used nonexistent `app/alpha/js/ui/screens/auth` (exit 2); corrected inspection used `ui/screens/account`.
- Public API v1.3 plus terms support documented third-party operations; unlisted owner/QR/fallback scope and compute/billing identity permission remain unresolved. Read the [contract](../../NUVIO_IDENTITY_CONTRACT.md) for evidence and gates. Official self-host `get_sync_owner` source returns `auth.uid()`; hosted parity is not established.
- `node --test scripts/check-docs.test.mjs` — exit 0, 1 test entry passed, 0 failed under Node `v24.19.0`. `node scripts/check-docs.mjs` — exit 0, all inspected local Markdown links resolve. Repository CI targets Node 22; the local runtime differs, and the CI result must be checked separately.
- Initial `git diff --check` — exit 2 for three Markdown hard-break trailing spaces in this plan. Removed those spaces; final result recorded below. A plan-record editing command failed before writing because of a nested heredoc delimiter; corrected using a structured patch.
- No application install/build/lint, auth fixture suite, browser/device test, deployed API request, production-token or real-account test was run. Twelve synthetic fixture groups are a future contract verification plan, not executed results.
- Final `git diff --check` — exit 0 after whitespace correction. Final documentation checker/test rerun — exit 0, 1 passed, 0 failed and no broken inspected links. `git diff --name-only` plus `git ls-files --others --exclude-standard` — exit 0; exactly the five planned documentation files. `git diff --exit-code -- app/alpha` — exit 0, no application edits. Committed-scope verification and draft PR reference follow publication.

### Reproduced public evidence command

This exact credential-free command ran with authorized network access, exit 0. All four requests returned HTTP 200. SHA-256/length results matched: public API `81f6f15f6ea66f39c488de63e6efdca50393541697a0243bb02aa2eafa7efd4c` / 55675 bytes; terms `f533c645153afe757e268e2a03ad57dc1c4736424df247b74756cef9dcaebef4` / 18661; privacy `9e48792111180cfe875451b20922c648203f5281bf3aa5de3099ee7ed7d79842` / 19425; self-host baseline `31ee75708b08b3257d601d3b551e449e8caf7871360bf57911aa0564e38d24b2` / 249021.

```sh
python3 - <<'PY'
import hashlib, urllib.request
sources = {
 'public-api': 'https://nuvio.tv/docs/nuvio-public-api.md',
 'terms-asset': 'https://nuvio.tv/_next/static/chunks/app/terms/page-27e119a7f63b7214.js',
 'privacy-asset': 'https://nuvio.tv/_next/static/chunks/app/privacy-policy/page-cebe36a0497cee60.js',
 'self-host-baseline': 'https://github.com/NuvioMedia/self-host/raw/30f156807ae77b2aec80b091b0d513841a25ab91/database/migrations/00000000000000_baseline.sql',
}
for label, url in sources.items():
    with urllib.request.urlopen(url, timeout=20) as response:
        data = response.read()
        print(label, response.status, hashlib.sha256(data).hexdigest(), len(data))
PY
```

`rg -n -A30 -B5 'CREATE FUNCTION public.get_sync_owner' /tmp/nuvio-self-host-database-migrations-00000000000000_baseline.sql` — exit 0 in delegated research; implementation at lines 585–602. No self-host code/license was imported. Public research notes remained temporary; only paraphrased findings and citations are committed.

## Acceptance / remaining review

- Research and documented-contract deliverables: complete, subject to human review. Public use constraints, authoritative identity and consent, no duplicate password/account store, fallback, synthetic negative/security/budget cases and support matrix are documented.
- External permission: unresolved for unlisted hosted endpoints/alternate destinations and compute/billing identity use; not invented, denied or silently waived. No maintainer outreach performed.
- Runtime evidence: no live issuer/audience/session/RLS/browser claims; follow-up fixture and authorized integration gates remain in #7/#14/#20.
- Keep GitHub issue OPEN and draft PR unmerged until the required evidence/review is accepted. Draft publication alone does not complete this review gate.

## Owner steering and resumed publication — 2026-10-18

The owner supplied https://nuvio.tv/docs, accepted documented public-client use without a separate permission letter, and explicitly authorized a public preview. Re-fetching its linked API Markdown gives the same SHA-256 `81f6f15f6ea66f39c488de63e6efdca50393541697a0243bb02aa2eafa7efd4c`. Do not request that permission again. This does not establish unlisted endpoint behavior, live-session guarantees or paid-service launch authorization.

Resume the existing branch/commit, merge protected main `07d0286`, retain both baseline/browser evidence and identity-contract documentation, publish the draft for human auth/security review, and leave runtime verification to its existing tickets. Update contract/decision/security notes and central ledger to distinguish documented API availability from untested semantics. No runtime or deployment configuration changes in this PR.

The sole conflict was docs/FEATURE_SUPPORT.md: retained #5/#29 builds, #31 Chromium shell tests and #3 contract limits. After resolution, pinned Node22 documentation tests passed 6/6 with no skips; docs links, ledger structure and whitespace passed. Earlier file-level sandbox result is historical, not the current test count. Cloudflare public-preview authorization is recorded; `wrangler whoami` found an expired nonrefreshable login, an account-access blocker for #6 rather than a missing owner decision.

Automated Standards review found an outdated unqualified tree-equality statement after #29; corrected the evidence register to distinguish pristine import from the documented two-file dependency metadata patch. No auth/runtime source changes were introduced.

## Owner acceptance and integration plan — 2026-10-18

The owner explicitly reviewed and approved PR #34's identity contract for issue #3's documentation scope in this session, and authorized conflict resolution, required checks, protected merge, completion-evidence updates and explicit closure. Any substantive contract change must return for review. This supersedes the earlier instructions to leave the reviewed documentation draft/open; runtime and service-scope release gates remain unchanged.

Work in isolated `/tmp/nuvioweb-issue3` on `m0/issue-3-owner-acceptance`, preserving the original research worktree and unrelated add-on work. Merge current `origin/main` into the PR ancestry without rewriting history. Resolve documentation conflicts by retaining current deployment evidence and the approved identity requirements. Keep `docs/NUVIO_IDENTITY_CONTRACT.md` byte-identical to approved commit `7693878855717b0a725524a4db3a705dd653f04c`.

Target files: this plan, `TRACKER.md`, `docs/PROGRESS.json`, `docs/FEATURE_SUPPORT.md`, and integration status in `docs/DECISIONS.md` as necessary. Record all three issue acceptance criteria as documentation evidence; runtime verification remains in #7/#14/#20. Update the ledger to verified with evidence PR #34, proposed until protected merge. No API contract, application, workflow, auth implementation, credential, deployment, payment, compute or licensing changes are authorized by this integration.

Required local verification under pinned Node 22.23.1: `node --test scripts/check-docs.test.mjs`, `node scripts/check-docs.mjs`, `node --test scripts/governance.test.mjs`, `node scripts/check-progress.mjs`, `node scripts/check-commit-references.mjs origin/main HEAD`, `git diff --check origin/main`, `git diff --exit-code 7693878855717b0a725524a4db3a705dd653f04c -- docs/NUVIO_IDENTITY_CONTRACT.md`, and `git diff --name-only origin/main`. All four required GitHub CI contexts must succeed on the updated PR, with up-to-date checks, resolved conversations and admin protections intact. Record exact results here and on the PR before protected merge; then verify merged evidence and the issue closure guard against main. No synthetic/live auth tests are claimed by this documentation acceptance.

Threats, costs and rollback remain as above: preserve every identity and consent restriction, do not expose tokens, and incur no hosted compute. If integration changes the contract, stop for owner review. Rollback is a protected documentation revert; do not weaken branch protections or rewrite upstream history.

### Acceptance evidence

- [x] Public use constraints explicitly documented: contract decision/permission table, dated evidence register and rate/capacity limits.
- [x] Stable authenticated identity and consent specified: server-verified trust domain plus subject; sync owner is not authority; login, pairing and charge consent are separate.
- [x] No new Nuvio password database: existing-account browser flow and guest fallback retained; no runtime or account-store changes.
- Owner review is explicit session approval of the concrete PR #34 contract; earlier automated review remains automated and is not independent approval. The approved contract is intentionally retained verbatim, including historical pending-review annotations; this acceptance record supplies current status.
- `origin/main` at `18655a7` contributes completed #6 deployment evidence. Conflicts were only `TRACKER.md` and `docs/PROGRESS.json`; resolved by preserving that evidence and recording #3 documentation acceptance. The contract and runtime have no integration changes.
- Initial sandboxed `git merge --no-commit --no-ff origin/main` failed before merging (exit 128, read-only shared Git metadata). Authorized retry entered the expected two documentation conflicts (exit 1); resolution retained both workstreams.

### Integration verification results

Pinned toolchain: `/home/saurabh/.local/share/mise/installs/node/22.23.1/bin/node --version` — exit 0, `v22.23.1`. Commands below used that absolute Node executable.

- `node --test scripts/check-docs.test.mjs scripts/governance.test.mjs` — exit 0, 15 passed / 0 failed / 0 skipped (6 documentation and 9 governance tests). An earlier restricted execution of the governance harness failed at file level (exit 1) without child-test diagnostics; the authorized rerun above exposed all assertions and passed. The earlier restricted docs result counted one file, not six executed subtests.
- `node scripts/check-docs.mjs` — exit 0, all inspected local Markdown links resolve.
- `node scripts/check-progress.mjs` — exit 0, 26 tickets / 8 structurally verified records; actual merged-PR verification remains separate.
- `node scripts/check-commit-references.mjs origin/main HEAD` — exit 0, no local closing directives in new ancestry; rerun after integration commit before push.
- `git diff --check origin/main` — exit 0.
- `git diff --exit-code 7693878855717b0a725524a4db3a705dd653f04c -- docs/NUVIO_IDENTITY_CONTRACT.md` — exit 0; approved contract byte-identical. `git hash-object docs/NUVIO_IDENTITY_CONTRACT.md` and `git rev-parse 7693878:docs/NUVIO_IDENTITY_CONTRACT.md` both return `b11aa31f6a4a635b1d972b2216be7ccc0c6133ef`.
- `git diff --exit-code origin/main -- app/alpha .github scripts tests deploy package.json package-lock.json playwright.config.mjs` — exit 0; no runtime, infrastructure, test or workflow changes relative to current main.
- `git diff --name-only origin/main` — exit 0; exactly `TRACKER.md`, `docs/DECISIONS.md`, `docs/FEATURE_SUPPORT.md`, `docs/NUVIO_IDENTITY_CONTRACT.md`, `docs/PROGRESS.json`, `docs/SECURITY_PRIVACY.md`, and this issue plan.

All four protected CI contexts still must pass on the updated PR before merge. CI receipts, protected merge and explicit issue-closure verification will be recorded on PR #34 / issue #3. This preserves the approved contract without adding premature runtime or integration claims.
