# Automated review record — WebKit engine coverage in CI (2026-10-19)

Reviewer: Codex CLI 0.163.0, `--sandbox read-only`. **Automated review, not independent human approval.** The reviewer inspected `fcaec71...cabca52` (the plan amendment, the new spec, the Playwright project gate and the workflow change) and stated that it did not execute browsers or CI itself.

## Finding

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | P2 | In the startup-overlay test, the expected guidance was decided by the production classification (`output.container.classification.category === "unsupported"`), so a regression that forced `not-reported` would have produced matching classification *and* messaging and still passed. | The test now measures `canPlayType` for the Matroska descriptor outside the classification, returns that prediction separately, and derives the expectation in the test body: `not-reported` must give `unsupported-container` with the `(matroska)` label; any predicted-playable answer must give a non-`unsupported` category without the label. Verified on Chromium (matroska `not-reported` → labelled message) and by CI on WebKit (matroska `probably` → generic message). |

## Confirmed properties

- The first test uses an independent capability oracle and stays valid under different engine codec sets (the reviewer checked Matroska `maybe`, HEVC `probably`, H.264 `not-reported`).
- No tautological assertions remain; no `expect(x).toBe(x)` patterns.
- The default configuration registers only the Chromium projects; exactly `NUVIO_PLAYWRIGHT_WEBKIT=1` enables WebKit. Gate-off `--project=webkit --list` exits 1 with `Project(s) "webkit" not found`, so a silent skip is impossible.
- The required job key `smoke` and context `Chromium application smoke` are unchanged; permissions, pinned actions and secret exposure are unchanged; a WebKit failure fails the required job.
- The router-first import ordering is documented and awaited without a catch, so a TDZ failure rejects the evaluation visibly.
- No new flakiness source: loopback fixtures only, no media playback or fetch, no sleeps, no font/layout assertions, service workers blocked.

## Limits

Automated review of a test/CI change; it is not a substitute for executing the suite, which is why the PR's CI run (Chromium plus WebKit) is the integration gate for this unit.
