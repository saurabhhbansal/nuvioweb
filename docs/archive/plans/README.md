# Implementation plans

Every issue that modifies source or infrastructure must have a plan scoped to that issue, not just an epic. Epics may reference the workstream templates below.

## Required plan fields

- Issue URL and target commit / milestone
- Problem, measurable objective and non-goals
- Dependencies, source evidence and unknowns
- Files/components expected to change
- Security, account identity, cost and licensing implications
- Step-by-step incremental implementation
- Test commands, legal fixtures, expected outcomes and negative cases
- Observability, rollback and measurable definition of done

## Starting workstream plans

- [M0 foundation](M0-DOCS.md)
- [M1 Alpha baseline](M1-BASELINE.md)
- [M2 add-ons and media](M2-ADDONS-PLAYBACK.md)
- [M3 user-owned compute](M3-BYOC.md)
- [M4 paid hosted compute](M4-HOSTED.md)

## Coding agents

Codex/Claude reads AGENTS.md, picks one ready issue, adds a dedicated plan file named by issue number (e.g. issue-12.md), then implements in a reviewable PR. Every plan must be updated when real test results contradict assumptions.
