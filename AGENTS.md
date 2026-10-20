# NuvioWeb coding agent instructions — Codex / Claude Code

**Authoritative sources:** docs/PROJECT_CHARTER.md, docs/PRD.md, docs/DECISIONS.md, docs/ROADMAP.md, docs/SECURITY_PRIVACY.md, docs/QUALITY_GATES.md.

## Required workflow

1. Select exactly one unblocked GitHub issue. Review upstream evidence and the related workstream plan.
2. Write/update an issue-specific plan in docs/plans with target files, API contract, non-goals, threats, test commands and rollback **before code changes**.
3. Make changes on a feature branch. Keep PRs scoped, reversible and testable. Preserve upstream license and history when source is imported.
4. Run only explicitly required tests with real results and record exact commands/pass/fail; do not claim tests/deployments were run unless verified.
5. Open a draft PR with issue + plan reference, verification, security/licensing/cost notes and known limitations. Complete the integration gate below; sensitive areas have additional requirements.
6. Maintain documentation and feature support matrix on each meaningful change.
7. Do not silently merge into main, change payment configuration or deploy hosted compute. Routine verified work may be integrated only through the protected PR workflow and the standing delegation below. Production, payment enablement and hosted-compute launch remain owner-gated.

## Standing autonomous delegation — recorded 2026-10-19

The project owner authorized an autonomous execution workflow for this repository. This section records that delegation transparently before it is relied on, and supersedes the earlier rule that every change needed routine per-PR human approval. Security requirements, release restrictions and branch protection are unchanged.

**Authorized without per-change confirmation:**

- Select, prioritize and continue unblocked roadmap tickets; research and compare implementation options; write issue plans and decompositions.
- Create, edit and test code on feature branches; fix regressions and CI failures; open and update pull requests.
- Integrate reviewed, passing, reversible changes through the protected workflow (PR, required up-to-date checks, resolved conversations, no force push, no bypass).
- Update issues, trackers, plans, documentation and test evidence; close issues whose acceptance criteria are genuinely satisfied; continue to the next ticket.
- Run safe local and synthetic tests, and refresh the existing dedicated development-only `nuvioweb-preview` Cloudflare Pages project under the conditions in `docs/STATIC_PREVIEW.md`.

**Never authorized:**

- Disabling or bypassing GitHub branch protection, force-pushing or rewriting shared history, or deleting unrelated user data or repositories.
- Exposing credentials, API secrets or tokens; purchasing services or changing billing plans; launching payment processing; deploying new production services.
- Creating an unrestricted network proxy, weakening security checks to make tests pass, bypassing legal/licensing requirements, or representing automated review as independent human approval.

**Integration gate for every change:**

1. A documented plan naming target files, non-goals, threats, test commands and rollback.
2. Passing automated tests at the exact integrated commit, including the four required workflows.
3. A separate technical review pass over the actual diff. Use Codex CLI in read-only mode when available; otherwise run a distinct reviewer pass with the same checklist and record the substitution in `docs/agent-runs/`.
4. Explicit security, privacy, cost and regression checks, including targeted negative tests where the change touches them.
5. Reviewable evidence with exact commands, results and stated limits, distinguishing synthetic, local, hosted and real-service verification.
6. Protected integration only: exact head verified, all required checks green, no override, reversible change.

**Bounded authentication or remote-fetch changes:** additionally require targeted negative/security tests (expiry, rejection, cross-account/session ownership, delayed responses, cancellation) and a separate review pass. Record explicitly that this review is automated, not independent human approval. Already-issued remote operations cannot be undone and must be documented as such.

**Escalate instead of self-approving** when a change introduces new privileges, new credential recipients, payment access, dangerous or unrestricted network behaviour, or an unresolved material security/legal risk, or when repository enforcement cannot legitimately be satisfied.

## Product invariants

- Existing Nuvio identity and sync, no duplicate account system.
- Free supported add-ons and original-quality native/browser playback.
- User-owned compute available without operator processing fees.
- Hosted compute only with explicit price/credit authorization and hard caps.
- No central video relay by default, unrestricted URL proxy, DRM circumvention or unauthorized media.
- Browser/codec claims based on device/fixture evidence, not title strings.
- Secrets and Nuvio access/refresh tokens never committed, logged or copied to processing agents.

## Current assignment

Continue from the durable state in [docs/agent-runs/CURRENT.md](docs/agent-runs/CURRENT.md) and `docs/plans/issues/`. The M1 reproducible Alpha baseline is verified; the open work is the hosted browser MVP (#7, #10) followed by the roadmap in dependency order. Never improvise a new login implementation.

## PR checklist

Linked issue; plan; file diff; upstream provenance; test commands/output; auth/plugin SSRF and media caveats; estimated compute cost implications; rollback.

## Evidence-based completion and import safety

- The central ledger is `docs/PROGRESS.json`; update it and TRACKER.md with actual acceptance/verification evidence. Closed issue labels and inherited tests alone do not prove feature completion.
- Use `Refs #N` in project commits and PRs; close issues explicitly after their evidence PR merges. Run `node scripts/check-commit-references.mjs <base> HEAD` across all newly reachable ancestry before imports. Unresolved historical closing-reference collisions block merge; retain original upstream commits and notices rather than rewriting messages. Audit issue timelines immediately after any import.
- Main protections apply to admins: required up-to-date CI, PR workflow, no force pushes/deletion. Never bypass or weaken them. Automated review must be reported as automated, not independent human approval; human review remains required for sensitive areas above. The sole-maintainer repository currently requires zero independent approvals, a documented limitation rather than a claim of review.
- An inherited test pass establishes only its tested seam. Browser journey claims require a reproducible browser fixture, observed assertions and explicit limits for mocked/live services and supported devices.

## Issue #7 authorization update — 2026-10-20

The owner instructed: “tell sol 6.1 high to take this up and fix all the blockers and everything give it full permission to do anything and everything so no blocker is made from my side.” For this remediation, routine protected integration, dedicated development-preview updates and bounded live checks using the designated disposable identities are authorized. The earlier live-account pause is superseded. Secrets, unrelated user data, branch protections and production/payment/compute restrictions remain protected. Genuine unavailable provider/device capabilities must be evidenced, not described as awaiting routine owner permission. See [remediation plan](docs/plans/issues/issue-7-sol-remediation.md).
