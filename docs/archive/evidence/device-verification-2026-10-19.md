# Manual device verification — Windows Edge and iPhone 17 Pro (2026-10-19)

Owner-performed manual observations on the hosted preview (`1f67867` / deployment `b48de821`). These are device observations, not automated tests. No credentials, media URLs, account identifiers or copyrighted titles are recorded.

## Windows 11 — Microsoft Edge

| Field | Value |
| --- | --- |
| OS | Windows 11 Version 25H2 (Build 26200.9711) |
| Browser | Microsoft Edge 155.0.4283.62 (Official build) (64-bit) |
| Chromium | 155.0.8059.85 |
| Mode | Guest only; account A/B switch not attempted |
| Result | **All checklist steps PASS according to the owner** |

Steps reported as working: hosted preview load, guest entry, shell navigation, legal demo add-on install through Settings, catalog/detail render, original VP8/Opus demo playback with **audible sound**, pause/resume, seek, English subtitle caption, Back through player/stream/detail/Home, save to Library and persistence after reload.

Limits: single session, owner-reported; no account/isolation or Library-count check; no console-error capture; not an automated or video-recorded run.

## iPhone 17 Pro — iOS 27, Safari

| Check | Result |
| --- | --- |
| Hosted preview and app shell | Reached; guest flow used |
| VP8/Opus legal demo playback | **PASS** (owner reported no issue) |
| 4K MKV / HEVC / Dolby Vision / HDR source (~16.2 Mbps) | **FAIL** — `startup-media-error`, media code 4 “source not supported”, HTML media error 4, `readyState 0`, `networkState 3`, engine `native-file` |
| 4K MKV / HDR10+ / Dolby Vision / HEVC / DDP 5.1 source (~18.2 Mbps) | **FAIL** — `startup-stall`, `readyState 0`, `networkState 2`, engine `native-file` |
| Multitrack audio switching | **NOT TESTED** — no source with multiple audio tracks was available |
| HDR rendering | **NOT OBSERVED** — the HDR sources failed before playback |

Interpretation:

- The failures are consistent with iOS Safari not supporting the Matroska (`.mkv`) container and/or these HEVC/Dolby Vision/DDP configurations through the native-file path. This is a capability boundary, not evidence that the app shell is broken.
- The second failure is **misclassified**: an unsupported container/codec surfaced as `startup-stall` rather than an explicit “container/codec not supported in this browser” message. That is a product-quality defect in capability reporting under #10.
- The VP8/Opus demo does play on this iPhone, so the hosted legal demo journey is not blocked on iOS Safari.
- Audible multitrack output and HDR rendering remain unproven; a supported HDR source (for example HLS/fMP4 HEVC where Safari supports it) and a multi-audio source are still needed.

## Follow-ups

- Classify unsupported MKV/HEVC/DV/DDP sources before or at startup and show an honest capability message instead of `startup-stall` (see issue #10 plan amendment).
- Produce or obtain an original multi-audio fixture and a supported HDR/HLS fixture for device checks; do not use provider media URLs in reports.

## Additional iPhone Safari observations (owner, 2026-10-19)

After the MKV sources failed, the owner tried other formats:

| Source type | Result |
| --- | --- |
| MP4 (non-MKV) | `startup-stall`; playback did not start |
| WebDL source requiring request headers | Explicit message: the source is not compatible with this device's player because it requires special request headers; try a different source or contact the add-on provider. The reported reason was still `startup-stall`. |

Interpretation:

- The header-required capability message exists and is useful, but the machine-readable reason is still the generic `startup-stall`, so diagnostics and automated assertions cannot distinguish “unsupported headers” from a genuine stall.
- The MP4 failures mean the iOS playback gap is not limited to Matroska: without the source's container/codec/audio details and headers, a root cause cannot be claimed. Possibilities include an unsupported H.264 profile/level, an unsupported audio layout, a container variant, or an access/header constraint; none is established.
- These remain manual, single-session observations. No further manual checks are requested from the owner unless a specific high-value verification cannot be automated; the next step is engine-level automation with synthetic sources.

## Owner direction on further manual testing

The owner will not continue ad-hoc manual device checks. Future #7/#10 evidence should come from automated suites (including a WebKit engine fixture in CI) and synthetic source descriptors, with manual device runs reserved for a specific claim that cannot be automated.
