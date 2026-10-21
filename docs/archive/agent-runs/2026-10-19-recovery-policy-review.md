# Automated review record — audio-recovery planner (#12) — 2026-10-19

Reviewer: Codex CLI 0.163.0, `--sandbox read-only`. **Automated review, not independent human approval.** It ran the planner tests and reproduced violations of the recovery constraints with its own probes.

## Findings and resolutions

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | P1 | An explicit `userChoice` bypassed attribution, container rejection and the attempt caps, so a generic failure could still produce an offer. | `userChoice` was **removed from the planner**. Explicit selection is not automatic recovery; it belongs to the selection path (`resolveAudioSelectionRequest`), may cross language and role, and is already capped by its own pending-selection state. Attribution, format and generation gates therefore cannot be bypassed by a choice. |
| 2 | P1 | Stale snapshots were accepted: with both top-level generations at 7, a candidate carrying generation 6 was still offered. | The failed track and every candidate must match the validated generation, otherwise no action. |
| 3 | P1 | Candidate ambiguity was ignored: duplicate keys were selected, a flagged `ambiguous` failed track was accepted, and truncating to 32 could hide duplicates beyond the boundary. | Lists longer than 32, duplicate failed identities, flagged ambiguity, and duplicate alternate/restore keys now fail closed (`ambiguous-failed-track`, `ambiguous-candidate`, `invalid-state`). |
| 4 | P1 | Key truncation could offer the actual failed track and alias an oversized user choice to a shorter key. | Keys are validated without truncation; an empty or over-160-character failed/restore key returns `invalid-key`. |
| 5 | P2 | An automatic restore bypassed rendition compatibility (French commentary after an English main failure). | Playback-failure restores must also be compatible. Restoring the previous **user-selected** rendition after a *selection* failure remains the one documented exception, because it restores what the user was already listening to and is capped at one attempt. |
| 6 | P2 | Malformed counters were coerced to zero, re-opening the budget (`true`, `0.5`, `NaN`, `"1"`, negative). | Counters must be own non-negative integers ≤ 1000; a present-but-malformed counter is `invalid-state`, never zero. An absent counter means "not tried". |
| 7 | P2 | Counters alone cannot prevent replay of an identical plan. | Documented explicitly: replay protection and operation identity belong to the caller (the recovery session). The planner is pure and says so in its header; a pure function cannot stop a caller from re-planning. |
| 8 | P2 | Hostile objects could throw or supply inherited evidence: throwing getters, accessor-backed fields, and an inherited `audioAttributable: true`. | All fields the planner relies on are read as own data properties; accessors, invalid shapes and inherited values fail closed (`invalid-state`) instead of being trusted or thrown. |
| 9 | P2 | Tests still passed under four independent rule removals (track bound, ambiguity rejection, unknown-language matching, restore priority). | The suite was rebuilt with discriminating cases: a valid unknown→unknown match, simultaneous alternate/restore eligibility, a colliding 160/168-character prefix pair, duplicate-candidate and duplicate-restore cases, accessor/inherited-input cases, and malformed-counter cases. |

## Confirmed by the reviewer

No input mutation, logging, network access, hidden mutable state, or time/random dependence was found for plain-data input, and there is no prototype-writing sink.

## Limits

Automated review of an unwired pure function. No player integration exists, so no playback, audible-output or AC1 claim follows. The deferred loader rebuild and the blocked AAC fixtures remain the gates for browser evidence.
