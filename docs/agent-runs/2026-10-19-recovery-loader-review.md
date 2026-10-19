# Automated review record — recovery hls.js loader (#12 unit 3) — 2026-10-19

Reviewer: Codex CLI 0.163.0, `--sandbox read-only`. **Automated review, not independent human approval.** It read the pinned hls.js 1.5.20 bundle and the draft loader, ran the tests, and reproduced findings with its own in-memory probes.

**Outcome: the loader implementation was not integrated.** The review found seven P1 and nine P2 defects in the fetch layer. Rather than merge remote-fetch code with known failures, this unit was reduced to the pure budget layer, and the loader is deferred to a dedicated unit that starts from these findings.

## P1 findings (the reason the loader was held back)

| # | Finding |
| --- | --- |
| 1 | Custom `context.headers` were copied verbatim, so an `Authorization` or Nuvio session header could ride along; `credentials: "omit"` does not strip explicitly supplied headers. |
| 2 | Diagnostics appended arbitrary exception messages, so a provider URL containing a token appeared unchanged in `error.text`; truncation is not redaction. |
| 3 | Rejected chunks were not added to session accounting, so repeated oversized requests consumed bytes while reporting zero; requests also remained possible after exhaustion. |
| 4 | Init segments were classified from a boolean flag, while pinned hls.js uses `frag.sn === "initSegment"` and an object-valued `frag.initSegment`, so real init segments got the 8 MiB fragment budget. |
| 5 | `finish()` released a session slot even for a loader that never acquired one, so destroying a rejected loader decremented somebody else's slot. |
| 6 | The over-budget branch awaited `reader.cancel()` before settling and never rechecked ownership, allowing callbacks after destroy and double settlement (timeout followed by error). |
| 7 | The `stats` object was replaced per request after hls.js had retained the original reference (`frag.stats`/`part.stats`), and destroy marked completed requests `aborted`. |

## P2 findings (carried into the deferred design)

Unbounded `arrayBuffer()` fallback before any size check; HTTP status never checked, so a 403 reached `onSuccess`; overlapping loads leaked ownership and setup exceptions could strand a slot; `abort()` did not call `onAbort`, which pinned hls.js uses to reject its pending promise; `rangeStart`/`rangeEnd` were ignored instead of generating or rejecting `Range`; timing used epoch `Date.now()` instead of monotonic `performance.now()` and `bwEstimate` ignored elapsed time; `onProgress` ignored response-type conversion and `highWaterMark`; the factory default `Hls.Loader` does not exist in the pinned build (`Hls.DefaultConfig.loader` does); and several tests could not detect the corresponding code being removed.

## What was kept

The pure policy layer, rebuilt to the findings' standard: limits, context classification (including the pinned init-segment shapes), resource/remaining budgets, and a session whose `charge` accounts every observed byte, latches exhaustion, refuses new acquisitions once exhausted, and returns release handles bound to a successful acquisition. Ten tests cover exactly those properties, including the negative cases the review reproduced.

## Limits

This record is automated review of code that is **not wired into playback**. No security clearance, no compatibility claim and no recovery capability follows from it. The deferred loader must be reviewed again before it can be installed as `config.loader`.
