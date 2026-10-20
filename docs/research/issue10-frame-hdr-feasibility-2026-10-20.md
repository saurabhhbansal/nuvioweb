# Issue #10 — frame delivery and HDR feasibility, 2026-10-20

## Scope and verdict

**Research, not a binary test or output certification.** Read the existing [playback note](<issue10-playback-feasibility-2026-10-20.md>) and [HEVC note](<issue10-hevc-feasibility-2026-10-20.md>); independently fetched the primary sources below rather than trusting unpublished earlier research. Only this note was created: no tests, browsers, existing sessions/observers, installs, git mutations, deployments or acceptance changes. Direct public-source retrieval replaced unavailable search; this is deliberately not an all-OS audit.

**Bounded conclusion:** the historical callback failure does not establish an engine-wide 4K60 throughput ceiling. HDR video has documented supported platform paths, but input decoding, tone mapping and real HDR output are different claims. Neither the receipt nor source inspection certifies sustained physical 4K60 HDR. Supporting evidence and limits follow.

## 1. What the old 60fps receipt actually establishes

The existing [delivery predicate](<../../scripts/engine-delivery.mjs#L3-L15>) requires an ≥8s window, callback and composition-counter rates ≥58.5fps, maximum callback gap ≤100ms, advancing timestamps, media/wall ratio ≥0.98 and drops ≤1% with valid positive totals. Reading the three `h264-2160-60` rows against that predicate establishes that **only `callbackFps >= 58.5` fails; every other recorded clause passes**:

| Historical engine row | Window (s) | Callbacks/s | Composition counter/s | Dropped/total | Media/wall ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| [Chromium](<../evidence/issue10-engine-2026-10-20.json#L472-L556>) | 8.5088 | 56.18 | 59.35 | 3/512 (0.59%) | 0.9912 |
| [WebKit](<../evidence/issue10-engine-2026-10-20.json#L1610-L1694>) | 8.5390 | 55.98 | 59.96 | 0/513 (0%) | 1.0000 |
| [Gecko](<../evidence/issue10-engine-2026-10-20.json#L2881-L2965>) | 8.5510 | 24.68 | 59.99 | 4/513 (0.78%) | 0.9990 |

Maximum callback gaps are respectively 51.36, 51 and 57.16ms, and `advancingFrames` is true in each linked row. These are historical headless pipeline observations, not new measurements.

The [WICG API proposal, §§1, 2.2 and 4.2](<https://wicg.github.io/video-rvfc/>) explicitly describes **best-effort callbacks**, possible missed callbacks under main-thread load, no strict timing guarantees, and a callback rate limited by the lesser of video rate and browser rendering rate. Its `presentedFrames` is a monotonically increasing count of frames **submitted for composition**, permitting detection of callbacks missed between observations. `expectedDisplayTime` is an expectation, not a physical display sensor. The [browser-team explanation](<https://web.dev/articles/requestvideoframecallback-rvfc>) likewise distinguishes main-thread callbacks from compositor-thread video work and possible one-vsync lateness.

**Inference:** Gecko's 24.68 callbacks/s does not mean 24.68fps video. Near-60 composition counters and low drops argue against diagnosing the recorded failure simply as inadequate decoding speed; they still do not prove panel scanout, perfect pacing or the cause of missing callbacks. The [Media Playback Quality specification](<https://w3c.github.io/media-playback-quality/>) counts displayed **and dropped** frames in its total, including predecode and missed-deadline drops; those software counters are not independent optical verification.

Every window above is **under 8.6 seconds**, not long-duration stability evidence. The stress input is 3840×2160 H.264 **SDR at 60fps**, whereas the [PQ/HLG HEVC controls](<../evidence/issue10-engine-2026-10-20.json#L729-L816>) and [VP9 controls](<../evidence/issue10-engine-2026-10-20.json#L837-L984>) are **24fps**. Separate results do not establish combined 4K60 HDR.

**Do not relax acceptance or relabel historical exit 3.** The [exit-code contract](<../../scripts/engine-delivery.mjs#L34-L40>) explicitly treats a failed sustained-60 criterion as exit 3, not pass. A revised measurement design must be separately reviewed and produce new evidence, preserving the old receipt.

## 2. HDR is a pipeline, not one boolean

The [Media Capabilities Working Draft, introduction and VideoConfiguration](<https://www.w3.org/TR/media-capabilities/#videoconfiguration>) distinguishes expected decode smoothness from display properties. `transferFunction` describes rendering interpretation **independent of the display**; `hdrMetadataType` concerns interpretation for tone mapping to the output device; gamut mapping can target a device that lacks the source gamut. Accordingly:

1. **HDR input decode:** codec/profile/bit depth and PQ/HLG bytes can be decoded, with original encoded dimensions and playback/seek observed.
2. **Color handling / tone mapping:** transfer functions and metadata are interpreted and mapped to the available output volume; an SDR rendition can be a valid tone-mapped result, not preserved HDR output.
3. **Real HDR output:** the selected browser build/port, decoder/render backend, OS/compositor state and connected display must actually deliver HDR. A successful decode or capability prediction does not measure this final stage.

These are diagnostic distinctions, not three newly tested features. A website cannot certify missing native/backend/display behavior merely by changing a capability label. Codec feasibility remains separately scoped in the [HEVC note](<issue10-hevc-feasibility-2026-10-20.md>).

### Verified positive examples and their limits

- **Gecko historical counterexample:** Mozilla's [Firefox 100 official release notes, May 3, 2022](<https://www.firefox.com/en-US/firefox/100.0/releasenotes/>) explicitly announce HDR video on Mac, starting with YouTube, on **macOS 11+ with HDR-compatible screens**. No manual Firefox preference flip is required; battery preferences must **not** enable “optimize video streaming while on battery.” This refutes “Gecko fundamentally cannot output HDR,” but proves neither all current platforms nor our tested Linux Firefox binary, every codec, PQ and HLG, or 4K60 HDR.
- **Apple WebKit historical counterexample:** the first-party [Safari 14 WebKit release article, “Media Enhancements,” November 16, 2020](<https://webkit.org/blog/11340/new-webkit-features-in-safari-14/>) explicitly says macOS gains HDR video playback support. This establishes an Apple-platform path, **not certification of the tested Linux WebKit/WPE port** or identical behavior across ports. No WPE implementation audit or blanket Firefox/Linux impossibility claim is made here.
- **Exact Chromium source, not installed-output proof:** [tag 156.0.8078.4 supported-types implementation](<https://raw.githubusercontent.com/chromium/chromium/156.0.8078.4/media/base/supported_types.cc>) lists PQ (`SMPTEST2084`) and HLG (`ARIB_STD_B67`) among color-managed transfer functions. `IsDecoderSupportedHdrMetadata` accepts no metadata, accepts ST2086 only with PQ, and rejects the listed ST2094-10/-40 metadata types. Codec-specific build/profile gates remain separate. This establishes support logic exists, **not enabled binary flags, successful decode, HDR10+/Dolby Vision certification or actual HDR output**.

### Why CSS queries are hints, not certification

[Media Queries Level 5 §6.5](<https://www.w3.org/TR/mediaqueries-5/#dynamic-range>) defines `dynamic-range` from UA/output brightness, depth and contrast. It explicitly says this tests HDR **capability, not whether an HDR mode is active**. [§8](<https://www.w3.org/TR/mediaqueries-5/#video-prefixed-features>) separates graphics and video planes: bi-plane implementations use `video-dynamic-range` for video and ordinary `dynamic-range` for graphics; non-bi-plane implementations return corresponding equal values.

An unimplemented/unrecognized single feature query such as `(video-dynamic-range: high)` can evaluate false through [§3.2 unknown-feature handling](<https://www.w3.org/TR/mediaqueries-5/#error-handling>). Thus false alone is not a universal hardware diagnosis; true alone is not a measurement of this video's HDR luminance or active mode. These are Working Draft definitions, not proof every browser implements the queries. The published draft was retrieved; where its displayed fetch was truncated, the relevant text was verified in the [CSSWG primary source](<https://raw.githubusercontent.com/w3c/csswg-drafts/main/mediaqueries-5/Overview.bs>).

## 3. Minimal useful next evidence — recommended, not executed

1. **Choose one known-supported output path**, not another exhaustive brand/OS matrix. Record exact engine/version/build/port, OS, native decoder and render backend, GPU/driver, compositor/HDR settings, display model, connection and refresh mode. An HDR monitor alone does not attest the rest of the path; historical Apple/Mozilla support statements are starting points, not current device certificates.
2. **Validate measurement before changing criteria.** Keep callback counts and `presentedFrames` deltas distinct, preserve dimensions, advancing media/wall timelines, drops and full bounded windows; correlate with independent compositor/output evidence. Define startup separately from a longer steady-state moving-content interval, without hiding stalls or substituting a late short burst.
3. **Validate physical output on that path.** Use rights-cleared, verified PQ/HDR10 and HLG controls separately, with known expected luminance/color patches and an appropriate calibrated measurement instrument; correlate OS/display HDR state and output diagnostics. Software logs, screenshots and CSS queries may corroborate but are not the physical-output measurement. Preserve original-resolution delivery and add a genuinely combined 4K60 HDR case only after the simpler decode/output controls work.
4. **Report conditional results**, separating input decode, tone mapping, actual measured HDR output and sustained frame pacing. Leave unknowns explicit and preserve the historical exit-3 receipt. No purchases, paid services, new infrastructure or deployment are justified or authorized by this note.

This bounded source evidence supports improving the measurement and selecting a documented platform path; it does not close issue #10 or claim a fresh pass of any installed binary.
