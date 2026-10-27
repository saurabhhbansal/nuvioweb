# NuvioWeb agent instructions — Codex / Claude Code

**Revised 2026-10-21 by the owner.** This file supersedes earlier process rules, including anything in [docs/archive](docs/archive/). Product intent comes from the [PRD](docs/PRD.md), [DECISIONS](docs/DECISIONS.md) and [SECURITY_PRIVACY](docs/SECURITY_PRIVACY.md).

## Priority: ship a usable public beta

The goal is something a real user can open on the [development preview](https://nuvioweb-preview.pages.dev) and use: sign in with their Nuvio account, browse, pick a source and play, in the browser or an external player. Bias every decision toward user-visible progress. A small change that ships beats a perfect change that stays on a branch.

**Roadmap:** GitHub milestones. Work the [Public beta](https://github.com/saurabhhbansal/nuvioweb/milestones) issues first; "Later" holds deferred ideas. Do not start work outside a milestone issue without the owner.

**Out of scope:** general server compute, hosted jobs, credits, payments, media proxies and upstream tracking (the repo is a hard fork). **Exception (owner, 2026-10-27):** small, cheap Cloudflare Workers or Pages Functions are allowed for features that are at most in the legal grey area, such as the [external player return relay](docs/EXTERNAL_RETURN_RELAY.md). Each one stores the minimum for minutes, not days, runs on the free plan, and gets an ADR note. Still never a media, donor, shared or unrestricted proxy (ADR-019).

## Workflow

1. **Work one issue at a time.** Finish it, merge it, deploy it if user-facing, then start the next.
2. **Plan in the PR description** when the change is non-trivial: goal, files, non-goals, risks, at most 30 lines. No separate plan files.
3. **Work on a feature branch and keep PRs small.** Aim for under ~400 changed lines of code. Split larger work.
4. **Add or update tests for behaviour you change.** Unit tests and Playwright with mocks or fixtures are acceptable evidence. Mock clocks, network and auth responses rather than waiting on real time or real services.
5. **Open a PR.** Merge through the protected workflow once the required checks are green.
6. **Deploy user-facing changes to the dev preview** after merge, as described in [DEPLOY_PREVIEW](docs/DEPLOY_PREVIEW.md).
7. **Close the issue** when its PR merges (use `Fixes #N` or close it by hand).

## Evidence: CI plus a short PR note

- **CI is the evidence.** Green required checks at the merged commit prove the tests pass. Do not copy test counts, command transcripts or check results into Markdown or JSON files.
- **The PR description is the record.** It covers the linked issue, what changed, tests run and known limits in a few bullets. Clearly label anything verified only with mocks.
- **Do not create evidence, receipt, run-log or review files.** `docs/archive` is history only; do not extend it.
- **Update [FEATURE_SUPPORT.md](docs/FEATURE_SUPPORT.md)** when user-visible support changes.
- **Never claim untested things.** Real-device, HDR, 4K and other browser engines are "unverified" unless actually tested. Say so in one line and move on.

## Writing style for docs, PRs and issues

- Plain English for a human reader. No internal codes, PIDs, hashes in prose or run-on qualifier chains.
- Be brief. A status line is one sentence; a limitation is one bullet.

## Review

- **Run one automated review pass on the diff** before merge (a separate reviewer pass). Fix real findings and list them in the PR description. Don't write a review document.
- **Sensitive changes** (auth/session handling, plugin sandbox, network fetch policy) also get targeted negative tests: expiry, rejection, cross-account, cancellation, SSRF. Flag them in the PR for owner review.
- Automated review is not independent human approval. Say so once in the PR.

## Standing autonomous delegation

**Authorized without asking:**

- Selecting the next milestone issue.
- Code changes on feature branches, fixing CI, and opening and merging PRs through the protected workflow.
- Updating issues and docs, and closing issues whose acceptance criteria are met.
- Refreshing the `nuvioweb-preview` dev Cloudflare Pages project.
- Bounded live checks using the designated disposable test identities.

**Never authorized:**

- Disabling or bypassing branch protection, force-pushing or rewriting shared history.
- Exposing credentials, API secrets or tokens.
- Purchasing services, changing billing, enabling payments, or deploying production services or compute.
- Creating an unrestricted network proxy, weakening security checks to pass tests, or bypassing legal/licensing requirements.
- Deleting unrelated user data or repositories.

**Escalate to the owner, don't self-approve,** when a change adds new privileges, new credential recipients, unrestricted network behaviour, or an unresolved security or legal risk.

## Product invariants

- **Accounts:** use the existing Nuvio identity and sync, with no second account system.
- **Playback:** free add-on playback at original quality where the browser supports it. Explain incompatible formats; don't silently degrade.
- **Proxying and DRM:** no central video relay, no unrestricted URL proxy, no DRM circumvention. A permitted Worker never fetches on a user's behalf and never sees or stores a stream address.
- **Neutral client:** test and demo only with legal or self-hosted media and the project's fixtures. Never add, test against or name third-party scraper providers in code, tests, docs, commits or PRs.
- **Capability claims:** codec and device claims come from real checks, not title strings.
- **Secrets:** secrets and Nuvio tokens are never committed, logged or sent to add-ons, plugins or players.
- **Upstream:** preserve upstream GPL license, notices and history in `app/alpha`.

## Commits and PRs

- Use `Refs #N` in commits and PRs.
- Required checks: `Locked install, build, tests and lint`, `Chromium application smoke`, `Docs links and checker tests`, `Roadmap and import checks`. Do not rename these jobs.
- Follow the [PR template](.github/PULL_REQUEST_TEMPLATE.md) and [CONTRIBUTING](docs/CONTRIBUTING.md).
