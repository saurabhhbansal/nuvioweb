# Automated review record — startup-failure classification (2026-10-19)

Reviewer: Codex CLI 0.163.0, `--sandbox read-only`, run from this workspace with `CODEX_HOME` inside it. **Automated review, not independent human approval.** The sole-maintainer repository still requires zero independent approvals; that limitation is unchanged by this record.

Scope reviewed: the diff for the startup-failure classifier unit in issue #10 — `app/alpha/js/core/player/startupFailure.js`, `startupFailure.test.mjs`, `app/alpha/js/core/streams/sourceCapabilities.js` (+ test), `app/alpha/js/ui/screens/player/playerScreen.js`, `playbackDisplayText.js`, `res/values/strings.xml`, and the browser/fixture tests. No credentials, account state or private receipts were sent to the reviewer.

## Pass 1 — findings

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | P1 | Matroska + `not-reported` + media error 4 became `unsupported-container` for transport details ("Failed to fetch", "network error"), and for a detail longer than the 240-character inspection bound. | Transport wording is now an explicit rule before any unsupported verdict; detail inspection is bounded at 1024 characters and a longer detail can never produce an unsupported reason. Regression tests added. |
| 2 | P1 | `mediaErrorMessage` returned the HTTP message before checking `header-required`, so a restricted source with an HTTP status showed HTTP guidance. | The classified `header-required` branch now precedes the HTTP branch, while callers without a classification keep the previous ordering. Runtime parity test added. |
| 3 | P2 | A short source-type alias (`mkv`) could mask a valid declared MIME type in `getStartupSourceDescriptor`. | New `selectSourceContentType` picks the first value that passes the same validator `describeSource` uses; aliases are skipped. Unit-tested. |
| 4 | P2 | MIME-only codec declarations (`video/mp4; codecs="hvc1"` with no `video.codec`) were not codec evidence. | `codecEvidence` falls back to the validated `codecs=` parameter. Unit-tested. |
| 5 | P3 | Classified messages gained a second full stop. | `ensureSentenceEnding` adds punctuation only when absent. Runtime parity test asserts single punctuation. |

## Pass 2 — verification

The first verification attempt ended without a verdict (the process was terminated after a long read-only exploration) and is recorded as incomplete, not as a pass. A second managed run verified findings 2–5 as resolved and reported two remaining edges:

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 6 | P2 | Non-string details (an `Error`, a boxed `String`) were treated as empty and "fully inspected", so they could still produce an unsupported verdict. | Only a primitive string counts as fully inspected; other values are still scanned for markers but never authorize an unsupported reason. Unit-tested with `new Error(...)` and a boxed 1100-character string. |
| 7 | P2 | The generic transport marker `"load failed"` produced a false `network` verdict next to a genuine codec rejection. | Removed; only transport-specific wording counts. Unit test asserts `"Unsupported codec hvc1; load failed"` stays `unsupported-codec`. |

## Limits stated by the reviewer

Browser journeys were not run by the reviewer; it executed the targeted Node suites (27/27 at pass 2) and read-only probes. Its verdicts concern the diff, the classifier contract and the message mapping, not the end-to-end player journey — those are covered by the repository's own Chromium evidence recorded in `docs/evidence/startup-classification-2026-10-19.md`.

## Outcome

All seven findings were fixed with regression tests before integration. No finding was waived, and no test assertion was weakened to make a failure pass.
