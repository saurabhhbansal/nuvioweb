# Automated review record — recovery operation record (#12) — 2026-10-19

Reviewer: Codex CLI 0.163.0, `--sandbox read-only`. **Automated review, not independent human approval.** It ran the module tests and in-memory mutant suites to show which guards were unprotected.

## Findings and resolutions

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | P2 | `offerRestore` succeeded before `begin`, so a fresh operation could record a restore and then a failed track. | Restore and alternate now share a `not-started` guard until `begin` records the failed track. |
| 2 | P2 | Generation validation was inconsistent: numeric strings were accepted by `isCurrent`/`invalidate` but rejected at construction, an invalid operation could claim to be current, and `1e100` was accepted. | One shared validator requires a positive **safe integer number**; `isCurrent`, `invalidate` and every action compare strictly with no coercion, and an invalid operation refuses all of them. |
| 3 | P2 | `canOffer` reported permission for actions the offer would refuse (before `begin`, for the failed track, after exhaustion). | `canOffer(kind, key)` now runs the same eligibility function as the offer methods, takes the action kind, and consumes nothing. |
| 4 | P2 | `invalidate` could return a non-string or freshly supplied reason for a closure that never happened. | Reasons are a fixed enum: an unknown value normalizes to `operation-closed`, a successful call returns the stored reason, and an already-closed operation returns `operation-closed` rather than echoing the new input. |
| 5 | P2 | The one-alternate/one-restore invariant could be widened by passing `maxAlternate: 2`. | Limits are no longer configurable; the plan's invariant is fixed at one per kind. |
| 6 | P2 | Action methods took no generation, so a stale holder could still offer after a refused `invalidate`. | `begin`/`offerAlternate`/`offerRestore`/`canOffer` accept the caller generation and refuse a mismatch as `stale-generation`. |
| 7 | P3 | Several guards were unprotected by tests (pre-`begin` alternate guard, `canOffer` duplicate guard, snapshot entry copying, empty-key masking, replay reason). | The suite now covers: fresh-operation empty key, nothing offerable before `begin`, `canOffer` parity including `unknown-action`, a stale caller attempting every action, a known-enum navigation close, deep-copy mutation of both the counter and an attempt entry, and the exact `already-attempted` reason for replay. 14/14. |

## Confirmed by the reviewer

Caps and duplicate checks held after `begin`, snapshots copied internal state correctly, and there was no input mutation, logging, time or randomness dependence.

## Limits

Automated review of an unwired pure module. It establishes the operation record only; no controller, loader, timers or browser evidence exists.
