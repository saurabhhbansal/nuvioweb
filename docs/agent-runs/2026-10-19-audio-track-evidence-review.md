# Automated review record — normalized audio-track evidence (#12 unit 2) — 2026-10-19

Reviewer: Codex CLI 0.163.0, `--sandbox read-only`. **Automated review, not independent human approval.** Reviewed the unit-2 observation diff; the reviewer executed the focused Node tests and reproduced findings with its own probes.

## Findings and resolutions

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | P2 | Sanitizing identities by replacing invalid characters made `A/B` and `A B` both `A_B`, so distinct renditions collided (falsely ambiguous, and one key could mean different tracks across lists). | Identities are percent-encoded, which is collision free, and duplicate detection runs on the original identity. A test asserts `A/B` and `A B` produce different keys and zero ambiguity. |
| 2 | P2 | The index fallback left unidentified tracks selectable, so reversing two unnamed tracks silently changed what `index-0` meant. | Tracks without a stable declared identity (numeric engine id, generated wrapper id) are marked `identityStable: false` and are `unavailable`; a selection request for one is rejected as `not-selectable`. |
| 3 | P2 | A track snapshot from an older generation was accepted when the request and current generation matched. | `resolveAudioSelectionRequest` now compares the matched track's own generation and rejects as `stale-generation`; covered by a test where request/current are both 2 and the track is generation 1. |
| 4 | P2 | Every nonempty native `kind`, including `commentary` and garbage, mapped to `main`. | Known kinds map explicitly (`main`, `alternative/alternate/translation/dub`, `commentary`, `descriptions/description`), anything else stays `unknown`; native-HLS `kind` is inspected as well. |
| 5 | P2 | The engine fallback made an unrecognised engine look selectable. | Selectability requires a recognised engine (`native-file`, `native-hls`, `hls.js`, `dash.js`); otherwise it is `unknown`. Tested for empty and unknown engine names. |
| 6 | P2 | Tracker settlement accepted arbitrary reason strings, so a provider URL could survive as a reason. | Reasons are validated against the fixed enum with per-status fallbacks; `reject`, `cancel` and `invalidate` are covered by tests with URL and markup input. |
| 7 | P2 | Unbounded role metadata crashed normalization (`"x,".repeat(150000)`). | Characteristics are length- and token-bounded, role/label arrays are traversal-bounded, and the split is no longer spread. Reproduced cases now return `unknown`/`commentary` without throwing. |
| 8 | P3 | The control-character assertion inspected `JSON.stringify` output, which already escapes controls, and the ambiguity test could pass through other guards. | The assertion now inspects the normalized strings directly, and a new case rejects a unique-key track flagged `ambiguous: true`. |

## Confirmed by the reviewer

Normal tracker ordering, double settlement and reused timer handles behaved correctly; no legacy `|| []` regression and no prototype-pollution write was found.

## Limits

Automated review of the observation half of unit 2. Selection confirmation, presentation copy and the audio-recovery browser spec remain unimplemented and are blocked on the AAC fixtures, so no playback or AC1 claim follows from this record.
