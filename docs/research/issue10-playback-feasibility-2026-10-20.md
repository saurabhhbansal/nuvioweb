# Issue #10: are the open playback gaps possible, or engine limitations?

Research date: 2026-10-20. Repository starting revision: `c3620e1e053f5a3a2a46a5e94e9de0c5caf481a3`. **Research/evidence reconciliation only:** no application, test criterion, acceptance checkbox, deployment, browser session or observer was changed. The issue10 ledger/support wording is corrected to match the verified layer; this does not complete acceptance. Existing measurements remain historical and are not relabelled passing.

## Plain-language answer

**These results do not establish that browser engines fundamentally cannot do the job.** However, not every browser build, operating system, codec backend or display path supports the same features. Some limitations are real for a particular combination and cannot be repaired by ordinary website JavaScript.

| Open item | Research verdict | What our failure actually establishes |
| --- | --- | --- |
| Sustained original-resolution 4K60 | No inherent engine-wide impossibility demonstrated. Crucially, the existing strict failure is caused solely by a best-effort JavaScript callback-rate requirement. | The historical test did not satisfy its callback criterion; it does **not** establish that decoding or composition ran at that lower callback rate. No physical-display certification follows. |
| Chromium HEVC/H.265 | Implemented conditionally in the exact tested engine version. Availability depends on build options and a supported platform decoder. | The tested binary/host rejected the files. The missing cause has not been uniquely isolated between build/runtime/backend conditions. |
| Real HDR output | Possible on supported browser/platform/display combinations; support is not uniform across ports. Decode, tone mapping and HDR screen output are separate capabilities. | No verified physical HDR output was measured. Adding an HDR monitor alone is not a guarantee that the tested Linux/headless/port path supports HDR. |

Sources and qualifications follow. For detailed primary-source investigation, see the [frame/HDR note](issue10-frame-hdr-feasibility-2026-10-20.md) and [HEVC note](issue10-hevc-feasibility-2026-10-20.md).

## 1. The 4K60 result needs a more careful interpretation

The [historical delivery helper](../../scripts/engine-delivery.mjs) requires all of the following: an eight-second window, callback rate and composition-counter rate at least58.5fps, no callback gap over100ms, advancing media timestamps, media/wall-clock ratio at least0.98, and at most1% dropped frames. Offline re-evaluation of the existing [native receipt](../evidence/issue10-engine-2026-10-20.json), without launching browsers, found that **only the callback-rate clause fails, for each engine**. The [hash-bound reassessment](../evidence/issue10-frame-reassessment-2026-10-20.json) records each recalculated boolean and the unchanged source/helper SHA256:

| Engine | JS callbacks/s | `presentedFrames` counter/s | Dropped/total frames | Media/wall ratio | Other recorded clauses |
| --- | ---: | ---: | ---: | ---: | --- |
| Chromium | 56.18 | 59.35 | 3/512 (0.59%) | 0.9912 | Meet thresholds |
| WebKit | 55.98 | 59.96 | 0/513 (0%) | 1.0000 | Meet thresholds |
| Gecko | 24.68 | 59.99 | 4/513 (0.78%) | 0.9990 | Meet thresholds |

This is particularly important for Gecko: **24.68 callbacks/s is not evidence of24.68fps video.** The API proposal explicitly describes best-effort callbacks, missing callbacks, and the `presentedFrames` field as a way to detect missed callbacks. That counter counts frames submitted for composition, not proof that a physical screen displayed every frame. [Primary API proposal](https://wicg.github.io/video-rvfc/); [Chrome-team explanation of best-effort callbacks and separate compositor/main threads](https://web.dev/articles/requestvideoframecallback-rvfc).

`totalVideoFrames` includes displayed **and dropped** frames, and dropped-frame counters include predecode and display-deadline drops; none is an independent measurement of a physical panel. [Media Playback Quality specification](https://w3c.github.io/media-playback-quality/).

**Correction to the earlier explanation:** the claim that these runs demonstrate inadequate host decoding speed was too strong. They demonstrate failure of the strict callback-observation criterion. The roughly60fps composition counters and low drops are encouraging evidence against an obvious decoding-throughput shortfall, but do not certify sustained physical4K60, long-duration stability or every codec at60fps.

A future test should keep original resolution, real60fps moving content, bounded full-wall windows and dropped-frame/timeline checks; distinguish callback sampling from actual frame delivery and use independent compositor/display evidence for smoothness. Record startup separately from a specified steady-state window rather than hiding stalls or computing a late burst. This is a **proposal for a better test**, not permission to silently loosen the existing criterion or rewrite its exit3 result.

A GPU is not a universal logical requirement for decoding4K60: software throughput depends on the content and CPU. Hardware decode can improve efficiency and suitability, but absence of `/dev/dri` alone does not prove CPU decode cannot keep up. Our own recorded counters do not establish such inability. Also, the stress case is H.264 SDR at60fps; the HDR codec controls are24fps. Passing either separately would not establish a combined4K60 HDR path. Device-specific Media Capabilities predictions are useful preflight information, not a performance/display benchmark. [Media Capabilities](https://www.w3.org/TR/media-capabilities/).

## 2. Chromium HEVC: a conditional backend capability, not a blanket engine ban

The exact tested Chromium tag `156.0.8078.4` contains HEVC platform-decoder configuration and support logic. HEVC handling is conditional on proprietary-codec/parser/platform support and available decoder profiles. Therefore, “Chromium cannot play HEVC” is not a valid engine-wide conclusion. Conversely, source code containing a decoder path does not prove the installed binary enabled it or that the host exposes a suitable backend. [Exact-version media options](https://raw.githubusercontent.com/chromium/chromium/156.0.8078.4/media/media_options.gni), [exact-version supported types](https://raw.githubusercontent.com/chromium/chromium/156.0.8078.4/media/base/supported_types.cc).

There is an important practical restriction: this version's `FFmpegVideoDecoder::IsCodecSupported` explicitly accepts only H.264, not HEVC. **Installing a system FFmpeg with HEVC support does not add a native HEVC decoder to the browser.** The privately installed FFmpeg used to generate our test files is a separate program, not Chromium's decoder. [Exact-version FFmpeg decoder implementation](https://raw.githubusercontent.com/chromium/chromium/156.0.8078.4/media/filters/ffmpeg_video_decoder.cc).

The tested Linux ARM64 headless environment, with no exposed GPU device, is not enough to validate the conditional platform path. Inspect actual build identity and decoder diagnostics, then test the same legal HEVC files on one known-capable Chromium-engine/platform setup. Do not assume that changing only browser brand, installing a codec pack, changing MIME text, or enabling a runtime flag repairs missing compiled support. Detailed platform/build/licensing caveats are in the [HEVC research note](issue10-hevc-feasibility-2026-10-20.md). Playwright's own documentation warns that browser distributions and codec availability differ; generic documentation alone does not identify this exact installed binary's build options. The installed1.64.0 package metadata identifies a Chrome-for-Testing distribution, so the blanket explanation “Playwright strips the proprietary codecs” is particularly unjustified here. However, a package label does not establish whether the measured run resolved to a full browser, headless shell or executable override; the receipt did not store the resolved executable or GN build options. Future diagnosis should capture the actual executable and decoder backend. [Playwright browser documentation](https://playwright.dev/docs/browsers#media-codecs); exact local/upstream registry evidence is in the [HEVC note](issue10-hevc-feasibility-2026-10-20.md).

## 3. HDR: possible, but the complete output path matters

A concrete counterexample to “Gecko fundamentally cannot display HDR” is Mozilla's official Firefox100 release note: HDR video support on compatible Macs, with macOS11+, an HDR-compatible screen and the required preference/state described there. This historical support statement proves a real supported platform path exists; it does **not** prove present Linux, Windows, every HDR transfer function, or our tested Firefox157 binary's output. [Official Firefox100 release notes](https://www.firefox.com/en-US/firefox/100.0/releasenotes/).

The engine/platform investigation in the [frame/HDR note](issue10-frame-hdr-feasibility-2026-10-20.md) distinguishes Apple WebKit's media pipeline from Linux WPE/GStreamer, and current upstream platform work from the exact measured binaries. Those distinctions matter: an engine can support HDR on one platform while a particular port/backend cannot provide the necessary output path.

For our app, the relevant questions are separate:

1. Can the decoder read the codec/profile/bit depth and PQ or HLG input?
2. Does the player preserve the color information through its rendering path?
3. Does the browser/OS/compositor negotiate a suitable output format and HDR mode?
4. Does the connected display actually produce the intended HDR result?

A successful decode establishes only the first layer (and some playback evidence), not all four. An SDR image or successful tone mapping is not preserved HDR output. Display capability queries are useful hints, not a measurement of the actual video's luminance, transfer function or metadata. The Media Queries specification distinguishes the ordinary graphics plane from the video plane, so generic `dynamic-range` observations alone should not be overread. [Media Queries Level5](https://www.w3.org/TR/mediaqueries-5/#dynamic-range).

**Practical consequence:** neither “just fix JavaScript” nor “just buy an HDR screen” is sufficient in every environment. Choose a documented engine/platform output path first; verify codec, driver, OS/compositor state and real display output, testing PQ/HDR10 and HLG separately. No hardware purchase is justified solely by the old headless test failure.

## 4. What is and is not under the application's control

- The app can report unknown/unsupported honestly, select a compatible original source when available, preserve encoded dimensions and make failures explainable. Source preferences cannot create an absent native codec or unsupported HDR compositor path.
- Lossless container remux can address packaging/timing problems without re-encoding, but does not change the codec or add HDR output. The already merged canonical fixture work is not evidence that arbitrary provider files are now compatible.
- Existing CORS-denial tests intentionally reject unauthorized cross-origin reads. A provider must supply appropriate CORS permission or a legitimate authorized delivery arrangement; website JavaScript cannot simply waive the browser's CORS enforcement. This is a security boundary, not a codec-performance defect. [Fetch Standard CORS protocol](https://fetch.spec.whatwg.org/#http-cors-protocol).
- Transcoding/tone mapping is a separate optional architecture with compute, quality, licensing and possible cost implications—not a required conclusion from this research, and not authorized or launched here.

## Recommended next steps, in order

1. Correct the interpretation of the60fps test and separately design/verify its measurement method before blaming engines or purchasing hardware. Preserve historical receipts.
2. Identify the tested Chromium binary and actual HEVC decoder availability, then perform one controlled same-source comparison on a known-capable engine/platform backend. Do not repeat the same Chromium engine under multiple brand labels.
3. Use a known-supported HDR engine/OS/display path for actual output validation; do not substitute headless decode or an unverified Linux port for physical HDR evidence.
4. Report results per **engine + version + platform/backend + codec/profile + output path**, not brand stereotypes. A different backend is relevant when it changes the actual media implementation, not because it has a different browser logo.

No app changes, new measurements, acceptance changes, paid services or deployments are included in this research. Search-service credentials were unavailable, so the investigation used direct retrieval of primary specifications, official documentation and source code instead. Source findings must not be misrepresented as a fresh test of the installed binaries.
