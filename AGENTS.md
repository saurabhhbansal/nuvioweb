# NuvioWeb coding agent instructions — Codex / Claude Code

**Revised 2026-10-21 by the owner.** This file supersedes earlier process rules here and any heavier process wording in other docs (QUALITY_GATES, plans, agent-runs). Product intent still comes from [PROJECT_CHARTER](docs/PROJECT_CHARTER.md), [PRD](docs/PRD.md), [DECISIONS](docs/DECISIONS.md) and [SECURITY_PRIVACY](docs/SECURITY_PRIVACY.md).

## Priority: ship a usable browser MVP

The goal is something a real user can open on the [development preview](https://nuvioweb-preview.pages.dev) and use: sign in with their Nuvio account, browse, pick a source and play. Bias every decision toward user-visible progress. A small change that ships beats a perfect change that stays on a branch.

**Current focus, in order:**

1. Finish and deploy #148 (external player hand-off), #149 (source ranking) and #150 (failure diagnostics) to the preview.
2. Close #7 (login/sync). Test token expiry and rejected refresh with a mocked clock and expired/revoked fixtures. The owner does one manual check after the real expiry. Do not wait on long-running observer processes or block other work on them.
3. Then #10/#11/#12, scoped down to what improves playback for users now.

**Paused until the owner says otherwise:** M3/M4 (compute agents, Cloudflare compute, credits, payments, hosted jobs) and #23 (upstream monitoring automation). Do not start, plan or extend them.

## Workflow

1. **Work one issue at a time.** Finish it, merge it, deploy it if user-facing, then start the next. Do not keep several issues half-done.
2. **Write a short plan only when the change is non-trivial.** Put it in the PR description, or in `docs/plans/issues/issue-N.md` if it spans PRs. Cover goal, files, non-goals and risks in **at most 30 lines**.
3. **Work on a feature branch and keep PRs small.** Aim for under ~400 changed lines of code. Split larger work.
4. **Add or update tests for behaviour you change.** Unit tests and Playwright with mocks or fixtures are acceptable evidence. Mock clocks, network and auth responses rather than waiting on real time or real services.
5. **Open a PR.** Merge through the protected workflow once the required checks are green.
6. **Deploy user-facing changes to the dev preview** after merge, as described in [STATIC_PREVIEW](docs/STATIC_PREVIEW.md).

## Evidence: CI plus a short PR note

- **CI is the evidence.** Green required checks at the merged commit are the proof that tests pass. Do not copy test counts, command transcripts or check results into Markdown or JSON files.
- **The PR description is the record.** It covers what changed, how it was tested (the commands), and known limits in a few bullets. Clearly label anything verified only with mocks.
- **Do not create new evidence/receipt files.** That means `docs/evidence/*`, `docs/agent-runs/*` and per-change review docs. Existing files stay as history; do not keep extending them.
- **Closing an issue:** add one entry to [PROGRESS.json](docs/PROGRESS.json) with the PR number, the plan or doc link, and the CI command. The closure guard requires this. Then close the issue.
- **Update [TRACKER.md](TRACKER.md) only to change a ticket's status.** It is a plain table with one short plain-English line per ticket, no narrative and no jargon. Keep the whole file under 60 lines.
- **Update [FEATURE_SUPPORT.md](docs/FEATURE_SUPPORT.md)** when user-visible support changes.
- **Never claim untested things.** Real-device, HDR, 4K and other browser engines are "unverified" unless actually tested. Say so in one line and move on. Don't build infrastructure to prove a negative.

## Writing style for docs, PRs and issues

- Write plain English for a human reader. Avoid internal codes (e.g. "A8", "DSH", "V12"), PIDs, hashes in prose, and run-on qualifier chains.
- Be brief. A status line is one sentence, and a limitation is one bullet.

## Review

- **Run one automated review pass on the diff** before merge, using Codex CLI read-only if available, otherwise a separate reviewer pass. Fix real findings and list them in the PR description. Don't write a separate review document.
- **Sensitive changes** (auth/session handling, plugin sandbox, network fetch policy) also get targeted negative tests: expiry, rejection, cross-account, cancellation, SSRF. Flag them in the PR for owner review.
- Automated review is automated, not independent human approval. Say so once in the PR.

## Standing autonomous delegation

**Authorized without asking:**

- Selecting the next issue per the focus list above.
- Code changes on feature branches, fixing CI, and opening and merging PRs through the protected workflow.
- Updating issues, docs and the tracker, and closing issues whose acceptance criteria are met.
- Refreshing the `nuvioweb-preview` dev Cloudflare Pages project.
- Bounded live checks using the designated disposable test identities.

**Never authorized:**

- Disabling or bypassing branch protection, force-pushing or rewriting shared history.
- Exposing credentials, API secrets or tokens.
- Purchasing services, changing billing, enabling payments, or deploying production services or hosted compute.
- Creating an unrestricted network proxy, weakening security checks to pass tests, or bypassing legal/licensing requirements.
- Deleting unrelated user data or repositories.

**Escalate to the owner, don't self-approve,** when a change adds new privileges, new credential recipients, payment access, unrestricted network behaviour, or an unresolved security or legal risk.

## Product invariants

- **Accounts:** use the existing Nuvio identity and sync, with no second account system. Never improvise a new login implementation.
- **Playback:** free add-on playback at original quality where the browser supports it. Explain incompatible formats; don't silently degrade.
- **Proxying and DRM:** no central video relay by default, no unrestricted URL proxy, no DRM circumvention.
- **Lawful sources only.** Test and demo only with legal or self-hosted media and the project's fixtures. Do not add, test against or name piracy scraper providers in code, tests or docs.
- **Capability claims:** codec and device claims come from real checks, not title strings.
- **Secrets:** secrets and Nuvio tokens are never committed, logged or sent to processing agents.
- **Upstream:** preserve upstream GPL license, notices and history in `app/alpha`.

## Commits and PRs

- Use `Refs #N` in commits and PRs.
- Before importing upstream history, run `node scripts/check-commit-references.mjs <base> HEAD`.
- **PR checklist:**
  - linked issue
  - what changed
  - tests run
  - security/privacy notes, if relevant
  - known limits
  - rollback, if not a simple revert
