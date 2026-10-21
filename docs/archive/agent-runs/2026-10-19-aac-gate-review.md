# Automated review record — native AAC fixture gate (2026-10-19)

Reviewer: Codex CLI 0.163.0, `--sandbox read-only`. **Automated review, not independent human approval.** Reviewed the unit-1a diff (probe script, parser tests, npm/CI wiring, records). The reviewer executed the parser tests and constructed its own byte layouts to demonstrate the defects below; it did not run the browser probe.

## Findings and resolutions

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | P2 | Audio sample-entry children were read from offset 16 instead of 36. A real version-0 entry stores 28 further fixed bytes (reserved8, channels2, sample_size2, pre_defined2, reserved2, sample_rate4) before `esds`/`dOps`, so real AAC files would have been reported BLOCKED. | `AUDIO_ENTRY_CHILD_OFFSET = 36` with a comment describing the layout, and the test fixtures now build a realistic 36-byte entry header instead of a shortened one. |
| 2 | P2 | `readDecoderConfig` kept only the first 12 `esds` bytes, so a normal `03/04/05` descriptor chain lost its AudioSpecificConfig. | Replaced with a bounded MPEG-4 descriptor walk (`readDescriptor`, `readEsdsDecoderConfig`) that follows ES_Descriptor and DecoderConfigDescriptor nesting, handles variable-length sizes, and extracts the DecoderSpecificInfo payload. |
| 3 | P2 | A crafted `esds` with a one-byte payload reported SUPPORTED with a reserved object type. | `describeAacConfig` now reads the AudioSpecificConfig bit field by bit field and rejects reserved/escaped object types, invalid frequencies, channel configuration 0, and truncated configurations. Covered by negative tests. |
| 4 | P2 | The 4 KB transfer could truncate `moov` and turn a genuine AAC recording into BLOCKED, with truncation unreported. | The page now transfers only `ftyp`+`moov` (up to 1 MiB) and reports `{transferred, totalBytes, complete}`; an incomplete inspection forces BLOCKED and is stated as a reason. |
| 5 | P2 | WebCodecs AAC support was queried but never exercised, and recording always used generic `audio/mp4`, so "unavailable" could describe an untested path. | The probe now performs a real `AudioEncoder` encode (20 ms synthetic frame) when AAC is reported supported, prefers an explicitly AAC-typed recording when `isTypeSupported` says so, and scopes the blocked wording to "this browser … on the tested path". |
| 6 | P2 | The 30-second deadline only set `process.exitCode`; work continued. | The probe races a `ProbeDeadlineError` against the page evaluation and closes the browser in `finally`; the recording has its own bounded duration and a `finally` stop/close. |
| 7 | P2 | The retained-byte limit was checked after materialising the whole recording. | Chunks are counted as they arrive; exceeding the bound stops the recorder and is reported as `byteLimitExceeded` instead of being silently truncated. |
| 8 | P2 | Unexpected recording exceptions were folded into a normal BLOCKED result with exit 0. | Expected capability errors (`NotSupportedError`, `InvalidStateError`, `AbortError`) stay BLOCKED; anything else is marked `capability: "error"` and `probe()` throws, failing the script and the CI step. |
| 9 | P3 | Recursive box parsing could overflow the stack on deeply nested input. | Explicit depth (8) and total-box (2048) budgets; a 40-level nesting test asserts no throw. |

## Confirmed by the reviewer

`mdat` text does not trigger detection; size-zero and 64-bit sizes worked; the browser workflow accepts BLOCKED and rejects uncaught failures; the receipt contains no media or personal identifiers and records browser version, UA, emitted MIME, sample entry and byte count; documentation claims were scoped to the pinned Chromium.

## Limits

Automated review of test tooling; the probe result itself is the recorded evidence, and the reviewer did not execute the browser probe. The gate's conclusion (BLOCKED on this Chromium) is unchanged by the corrections, but the corrected parser now actually reads a real `Opus` sample entry (size 75) rather than failing on a wrong offset.
