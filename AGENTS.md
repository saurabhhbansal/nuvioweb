# NuvioWeb coding agent instructions — Codex / Claude Code

**Authoritative sources:** docs/PROJECT_CHARTER.md, docs/PRD.md, docs/DECISIONS.md, docs/ROADMAP.md, docs/SECURITY_PRIVACY.md, docs/QUALITY_GATES.md.

## Required workflow

1. Select exactly one unblocked GitHub issue. Review upstream evidence and the related workstream plan.
2. Write/update an issue-specific plan in docs/plans with target files, API contract, non-goals, threats, test commands and rollback **before code changes**.
3. Make changes on a feature branch. Keep PRs scoped, reversible and testable. Preserve upstream license and history when source is imported.
4. Run only explicitly required tests with real results and record exact commands/pass/fail; do not claim tests/deployments were run unless verified.
5. Open a draft PR with issue + plan reference, verification, security/licensing/cost notes and known limitations. Require human review for auth, payment, plugin sandbox, remote fetch and compute isolation changes.
6. Maintain documentation and feature support matrix on each meaningful change.
7. Do not silently merge into main, change payment configuration or deploy hosted compute. Production actions require explicit project owner approval.

## Product invariants

- Existing Nuvio identity and sync, no duplicate account system.
- Free supported add-ons and original-quality native/browser playback.
- User-owned compute available without operator processing fees.
- Hosted compute only with explicit price/credit authorization and hard caps.
- No central video relay by default, unrestricted URL proxy, DRM circumvention or unauthorized media.
- Browser/codec claims based on device/fixture evidence, not title strings.
- Secrets and Nuvio access/refresh tokens never committed, logged or copied to processing agents.

## Initial coding assignment

M1 reproducible Alpha baseline. First recheck upstream pinned SHA, license and expected upstream contents, then import source with provenance and run clean build, lint and tests. Never improvise a new login implementation.

## PR checklist

Linked issue; plan; file diff; upstream provenance; test commands/output; auth/plugin SSRF and media caveats; estimated compute cost implications; rollback.
