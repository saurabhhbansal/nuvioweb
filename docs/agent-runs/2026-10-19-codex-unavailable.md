# Planning record — Codex CLI unavailable, 2026-10-19

The operating directive requires a read-only Codex CLI planning pass before substantial implementation units. Availability was checked at session start:

```sh
which codex        # no output
codex --version    # bash: codex: command not found
```

No `codex` binary is on `PATH` in this environment, and no alternate configured entry point is known. The directive explicitly says not to block the project for this reason, so the required planning procedure is executed by the primary agent using the same structure, and review is performed by a separate reviewer pass using the same checklist. Both are recorded honestly as **automated**, never as independent human approval.

## Procedure substitution

For every substantial unit the primary agent produces, in the issue plan under `docs/plans/issues/issue-N.md`:

1. Technical assessment — verified current behaviour, gaps, and assumptions actually checked against source.
2. Exact implementation approach — files, functions, interfaces, algorithms.
3. Atomic tasks — each normally ≤1–3 production files plus tests, with prerequisites, files to inspect/change, red test, steps, verification commands, success/failure conditions and rollback.
4. Risk assessment — security, concurrency, browser, privacy, cost, compatibility, licensing.
5. Acceptance evidence — how the behaviour is proven, per environment.
6. Dependency-ordered implementation order with stopping points.

Review is a separate pass over the actual diff that checks correctness against acceptance criteria, regressions, concurrency/session ownership, error handling, missing tests, security/credential boundaries, browser support, unnecessary complexity and documentation accuracy. Findings must cite file and line, and are independently verified before any change.

## Environment facts recorded for reuse

- Node 22.23.1 / npm 10.9.8 are the pinned runtime for this repository (`.node-version`).
- Playwright 1.64.0 with Chromium headless 156.0.8078.4 is the only installed browser engine observed so far.
- Codex absence does not relax any required check, security gate or evidence standard.
