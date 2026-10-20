# Playback engine matrix — issue #10, 2026-10-20

## Current actual installed-provider acceptance — DEFERRED, not verified

The owner's actual installed-provider acceptance instruction supersedes fixture-based acceptance for [issue #10](https://github.com/saurabhhbansal/nuvioweb/issues/10). The parent remains **OPEN / `in_progress`**, labelled `deferred`: the original4K and explainable-error boxes remain unchecked; unknown metadata is verified in actual source cards. Chromium, WebKit and Gecko are engine cohorts, not duplicated browser-brand or physical-device certifications. [Actual-provider report](evidence/issue10-real-provider-2026-10-20.md) · [full privacy-checked receipt](evidence/issue10-real-streams-2026-10-20.json) · [plan](plans/issues/issue-10.md).

| Actual returned selection / engine | Observed outcome | Acceptance boundary |
| --- | --- | --- |
| AIOStreams AVC/AAC1080p MKV / Chromium156 | Actual1920×1080 frames for30.0003s wall /29.9841s media;720 total frames,2 dropped; pause, seek, new post-seek1920×1080 frame, resume and Back observed | Explicit1080p alternative, not a4K pass or silent downscale; no audible/multitrack or physical pacing claim |
| AIOStreams HEVC/AC3 HDR10/HFR-labelled4K MKV / Chromium156 | `startup-source-error`, no first frame | No actual4K delivery; no isolated container/audio/video/backend cause |
| Actual AIOStreams4K MKV and AVC/AAC control / WPE WebKit27.2 | `startup-stall`, readyState0, no frames; Back observed | Neither actual source passed; generic stall guidance remains insufficiently actionable |
| Actual AIOStreams4K MKV / Gecko157 | Metadata3840×2076 and requested resume clock only;30.028s with zero media advancement and zero total frames; isolated callback sample is not advancing playback; observer exit2 at controls | No decode/delivery/seek pass; metadata and resume position do not prove playback |
| Actual PenguPlay/2Peckle4K MP4 offer / WPE and Gecko | Both `startup-source-error`, zero dimensions/no first frame; Back observed | No4K pass;10bit SDR filename is not HDR evidence |
| Actual header-required HLS / Chromium | Actionable special-request-header guidance and Back | No bypass and no HLS decoding certification |

**No actual4K frame-delivery case passed.** [#137](https://github.com/saurabhhbansal/nuvioweb/issues/137) owns the exact real-source delivery/startup-stall diagnostics; [#138](https://github.com/saurabhhbansal/nuvioweb/issues/138) owns physical HDR output. No universal engine limitation, inadequate-host-throughput diagnosis or hardware purchase requirement follows from these opaque failures. Retained audio/device/DRM and optional-recovery scopes are not certified here.

The actual app path used the six installed providers and no custom/template source or altered media. The receipt retains all240 returned-row observations across six real-source runs, per-response count equality, actual unknown-card text and privacy/export checks (allowlist, configured-secret/unexpected-URL scans and in-memory secret-injection rejection). Exit0 means completed observation, not accepted playback. Chromium's nominal `executablePath()` was wrong: installed Playwright1.64 default-headless selection reconstructs `chrome-headless-shell` revision1248 /156.0.8078.4 with binary hash in the receipt; runtime argv was not captured. WPE/Gecko explicit binary provenance is separate.

The served runtime remains pinned at `b5a8679404b98649f9c742abc6aa5da00edc50a9`, distinct from repository base `45d59a16ef19f7bacd70232b98f08150c2081bf7`. No deployment or actual-current-main UI claim, runtime/observer change, media transformation or paid fallback follows. [Scoped handoff](agent-runs/2026-10-20-issue10-real-provider-handoff.md).

## Historical synthetic regression evidence — not real-provider acceptance

The remainder preserves the earlier generated/loopback regression unit and its receipts. Chromium maps to Chrome/Edge/Brave/Opera, WebKit to Safari and Gecko to Firefox; mappings never certify every branded platform. [Native raw receipt](evidence/issue10-engine-2026-10-20.json) · [input provenance](evidence/issue10-generated-media-2026-10-20.json). That earlier unit did not perform live-provider acceptance or deploy. All historical strict60 predicates, failures and exit3 remain unchanged; fixture successes do not override the current deferred outcome above.

### Historical evidence layers and native result

Native measurement source: `f5f15892d9078cb6e445cd01e529fade2b908c18`. Ubuntu24.04.5 ARM64, Node22.23.1, Playwright1.64.0; Chromium156.0.8078.4, WebKit27.2 (WPE revision2370), Gecko157.0 (revision1555). User agents falsely report x86/macOS; ELF architecture/provisioning, not UA strings, identifies the host. All tests use disposable browsers and loopback origins, not existing CDP sessions.

**D+S** means measured3840×2160, finite duration, advancing playback, an actual seek landing, error-free resumed clock and a near-target first original-resolution presented frame followed by a genuinely newer frame with increasing media timestamp and presentation counter. **Partial** means some frames/metadata decoded but that full criterion was not established. A positive canPlayType/MediaCapabilities prediction is not a D+S result.

| Native original-resolution input | Chromium | WebKit | Gecko |
| --- | --- | --- | --- |
| H.264 SDR,24fps | D+S | D+S | D+S |
| HEVC Main SDR,24fps | Not decoded; native negative, media error4 | D+S | D+S |
| VP9 Profile0 SDR,24fps | D+S | D+S | D+S |
| AV1 Main SDR,24fps | D+S | D+S; sparse callback sampling, not smoothness certification | D+S |
| H.26460fps source,12s/720frames | D+S; sustained criterion **not observed** | D+S; sustained criterion **not observed** | D+S; sustained criterion **not observed** |
| HEVC Main10 PQ/HDR10-tagged | Not decoded; media error4 | D+S, encoded input only | D+S, encoded input only |
| HEVC Main10 HLG-tagged | Not decoded; media error4 | D+S, encoded input only | D+S, encoded input only |
| VP9 Profile2 PQ-tagged | D+S, encoded input only | D+S, encoded input only | D+S, encoded input only |
| VP9 Profile2 HLG-tagged | D+S, encoded input only | D+S, encoded input only | D+S, encoded input only |
| Physical HDR luminance/gamut/tone mapping/output | **Not certified** | **Not certified** | **Not certified** |
| Browser fetch CORS allow/deny; fixed403/410 | Expected200/rejection/403/410 | Expected200/rejection/403/410 | Expected200/rejection/403/410 |

The complete native command returns **exit3**, not a pass: the strict sustained60 criterion is not observed in any engine. WebKit and Gecko establish all nine native decode/seek rows. Chromium HEVC negative prediction plus error4 is a tested build/host rejection, not proof that every Chromium platform inherently lacks HEVC. The nonzero receipt is published unchanged in meaning. Intermediate clock-only WebKit successes and an overconstrained two-callback timing attempt are superseded by actual first-near-target/later-advancing presentation evidence. Sparse callback notifications are not an invented frame-rate pass.

### Sustained delivery is not source encoding

The distinct moving test pattern is genuinely3840×2160,60fps,12seconds,720frames, measured25,835,960bit/s. No five-fps loop, upscale or title-derived metadata is used. Measurement starts before callback delivery and covers the full ~8.5s wall window; late bursts cannot pass.

| Engine | Callback fps | Presented-counter fps | Strict sustained60 |
| --- | --- | --- | --- |
| Chromium | 56.18 | 59.35 | Not observed |
| WebKit | 55.98 | 59.96 | Not observed |
| Gecko | 24.68 | 59.99 | Not observed |

Counters are not interchangeable. The historical predicate requires ≥8s, callback and presented rate≥58.5fps, media/wall≥0.98, positive frame timestamp progression, no callback gap>100ms and≤1% dropped frames. Its exit3 remains unchanged. The [offline, hash-bound reassessment](evidence/issue10-frame-reassessment-2026-10-20.json) establishes that **only callback frequency fails in each engine; all other recorded clauses meet their thresholds**. The API defines best-effort notifications and a composition counter that can advance across missed callbacks, so the lower callback rate does **not** establish lower video frame rate or inadequate decoding throughput. Neither near60 counters nor MediaCapabilities `smooth:true` certify physical display pacing. Validate the measurement method before assigning a host-performance cause or requiring new hardware. [Primary API proposal](https://wicg.github.io/video-rvfc/) · [first-party explanation](https://web.dev/articles/requestvideoframecallback-rvfc) · [feasibility research](research/issue10-playback-feasibility-2026-10-20.md). Gecko HEVC's `powerEfficient:true` remains an API prediction, not measured GPU usage.

HDR input tags are measured BT.2020/PQ or HLG,10bit. HEVC HDR10 has encoder-authored1000nit mastering/CLL1000/FALL400 metadata, not calibrated mastering or display proof. All three engines' recorded graphics-plane queries report no HDR/P3/Rec.2020 in this headless environment; that is not a measurement of a physical panel or necessarily every separate video plane. Successful tagged-frame decode proves neither preservation nor tone mapping. The stress source is H.264 SDR60fps; the HDR controls are24fps, so these separate observations do not establish combined4K60 HDR.

## Bundled player, adaptive and diagnostic journeys

The bundled quality tests exercise native original1080p/2160p and single-rendition4K HLS/DASH, actual manifest/init/segment requests, original dimensions, seek events/clock and two presented post-seek frames (first near target, later frame advancing both media time and presentation counter). The final suite passed27/27, nine per engine,0skip,1.8minutes. They also exercise403/410, browser-enforced manifest CORS rejection, visible actionable guidance, secret redaction and return to Sources. [Bundled observations](evidence/issue10-bundled-2026-10-20.json) record exact outcomes separately from native-codec stress results. Unsupported diagnostics are explicitly `NO_DECODE`, not decode passes.

The runtime change is limited to contradictory codec declarations: a descriptor with disagreeing MIME codec and video codec yields unknown rather than contradictory predictions or unsupported blame. The guard runs before MIME-only prediction caches in ordering and cards. Valid reports, original source selection/bytes, header/network precedence and fetch/recovery behavior remain intact. Real conflicting-declaration playback uses the existing original VP8/Opus bytes; focused regressions cover both cache orders.

### Preserved failures and lossless fixture corrections

1. Missing native ARM64 Gecko and private launch/profile dependencies were resolved with workspace-local tooling, not sandbox-disabling switches.
2. GStreamer private-only plugin search hid installed typefind/playbin/conversion plugins; merging the existing host plugin directory corrected that environment error.
3. WebKit's code4 was initially `Could not create temp file /var/tmp/WebKit-Media-XXXXXX`, not codec rejection. The supported child-only `WPE_SHELL_MEDIA_DISK_CACHE_PATH` redirects its download buffer to the existing private writable directory. [WebKit primary implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/gstreamer/MediaPlayerPrivateGStreamer.cpp#L2936-L2945).
4. Legacy MediaRecorder native MP4 gave Gecko ~0.37s duration rather than the measured full clip. A separate `-c copy -movflags +faststart` test container preserves every encoded packet; old inputs and failure evidence remain.
5. Direct WebKit MSE append of legacy fragments produced19 tiny ~16.7ms buffered islands with ~183ms gaps and no playback. Lossless fMP4 remux yields a single0–3.800866s range and actual playback, with identical19 packet hashes and complete AVC payload. Canonical adaptive paths are separate; legacy files, generator and provenance are unchanged. [Native provenance](../tests/fixtures/media/quality/native-provenance.json) · [adaptive provenance](../tests/fixtures/media/quality/adaptive-provenance.json) · [diagnosis receipts](evidence/issue10-diagnoses-2026-10-20.json).
6. WebKit's short-clip `play()` promise can resolve only at the end although seek and playback already occurred. Tests observe actual seek/frame/clock events and tracked rejection, not promise-resolution latency. WebKit native failures can expose no HTTP status; only an actual failed same-path browser request plus provider-recorded GET and a separately labeled fixture-control HEAD establish the negative boundary. Chromium/Gecko direct status assertions remain strict.

None is a production transcoding/recovery feature. Packet identity and committed hashes are independently tested. There is no new remote request recipient, proxy, paid fallback, quality reduction or DRM path.

## Limitations, classification and hardware to close them

| Remaining slot | Classification and evidence | Minimum useful next environment |
| --- | --- | --- |
| Strict sustained4K60, all three engines | **MEASUREMENT LIMITATION + UNVERIFIED PHYSICAL OUTPUT**: only best-effort JavaScript callback frequency fails; all other recorded clauses meet thresholds. The data establish neither inadequate host decode throughput nor inherent engine incapability. | First validate a frame-delivery measurement that distinguishes callback sampling, composition and screen output, preserving full-window/drop/timeline checks. Then use an evidenced60Hz-or-faster4K compositor/display path. Hardware decoding may improve efficiency but is not a universal prerequisite proved by these runs; record the actual backend, pacing, drops and thermals. |
| Physical HDR10/HLG, all three engines | **UNVERIFIED OUTPUT / PLATFORM-PORT GAP**: no physical HDR measurement; input tags, decoded frames and graphics-plane queries cannot certify or categorically exclude a separate HDR video path. Source feasibility is conditional on the platform, not proof of these binaries. | Choose a documented HDR-capable engine/OS/media-backend path with a compatible display/output mode, then measure preservation/PQ and HLG output separately. A monitor alone does not add unsupported port/compositor functionality. Combined4K60 HDR additionally needs its own appropriate source/run. |
| Chromium HEVC SDR/PQ/HLG | **TESTED BUILD/HOST REJECTION; ROOT CAUSE NOT ISOLATED**: native negative and error4. Exact156 upstream has conditional HEVC integration, but the receipt lacks resolved executable/build options and actual backend diagnostics. | Identify the actual binary/headless mode and decoder profiles, then replay unchanged SDR/Main10 sources on one known-capable Chromium-family backend. Installing command-line FFmpeg or repeating browser brands does not supply native HEVC. Source support is not a runtime pass; no obligatory purchase or universal engine ban is established. |

**Established inherent ENGINE LIMITATION: none from these opaque build/host failures.** The matrix deliberately does not invent one. Multitrack/audible output, DRM and external hosted-provider CORS are not certified by these video-only loopback tests; retain those broader product limits separately rather than inferring completion.

## Reproduction, resource and licensing notes

Use Node22.23.1, locked packages and Playwright1.64.0. On a normal provisioned test host:

```sh
npm run test:engine-media
npm run test:quality-fixtures
npm run test:addon-fixtures
node scripts/generate-engine-media.mjs --ffmpeg /path/to/ffmpeg --ffprobe /path/to/ffprobe --out .tmp/issue10/new-media
NUVIO_SOURCE_REVISION=$(git rev-parse HEAD) node scripts/verify-engine-media.mjs --media .tmp/issue10/new-media --out .tmp/issue10/new-receipt.json
NUVIO_PLAYWRIGHT_WEBKIT=1 NUVIO_PLAYWRIGHT_FIREFOX=1 npx playwright test tests/browser/quality.spec.mjs tests/browser/engine-capabilities.spec.mjs --project=chromium --project=webkit --project=firefox
```

The generator refuses nonempty output; native/adaptive normalization also refuses existing outputs. Regenerate only into verified fresh output paths, never delete computed paths blindly. The fixture generator's commands/settings, actual FFprobe properties, file sizes and SHA256 hashes are retained. Generation occurred before later verifier-validation hardening; historical source revision/hash fields are preserved, not rewritten to pretend the bytes were generated by the final commit. Sanitized evidence replaces local path prefixes but records raw-receipt SHA256.

This restricted ARM64 host used privately extracted Ubuntu24.04 packages and the official native Firefox archive, not system installation or sudo. [Tool inventory](evidence/issue10-tool-inventory-2026-10-20.json) records179 packages/versions/archive hashes/notice paths, extra GStreamer tool and Gecko hash. Archive+extracted estimate711,121,288bytes is below the authorized800MB tooling budget; nine generated video files add61,136,850bytes. Profiles/logs are separate. Original procedural video is CC0; FFmpeg GPL and Gecko MPL/component notices remain with local tools. No tool binary is shipped or made a runtime dependency. Generation uses at most two encoder threads, bounded duration/file size and subprocess deadlines; file reads, cases, resume and transport operations are bounded.

### Optional compute implications — not an implemented fallback

A failed native source does **not** authorize automatic transformation. Prefer a compatible free original-quality source where available; otherwise explain the limitation. Lossless container remux can preserve encoded quality and reduce work, but cannot fix an absent decoder or guarantee HDR output. Video re-encoding/tone mapping may alter quality/HDR and requires explicit user choice.

The measured25.84Mbit/s stress source is about11.63GB/hour before transport overhead; an operator relay therefore adds material bandwidth even without re-encoding. Software4K60 HDR decode/encode has substantial CPU, memory and latency cost and is not sized by these short encode controls. Future optional processing should prefer user-owned hardware (no operator processing fee), expose measured resource needs and hard caps, and require explicit price/credit authorization before hosted compute. No relay, billing, queue, purchase or hosted job was launched here.

## Integration and rollback

[PR134](https://github.com/saurabhhbansal/nuvioweb/pull/134) merged at `6f374174908c7619645f77d3ff110cb3ecf8c912`, reviewed head `abc746ae8e13bd8337800cbba39f642d9c3084c6`. All four required contexts passed at both exact head and actual merge; [immutable integration receipt](evidence/issue10-integration-2026-10-20.json). Separate automated Standards/Spec reviews substitute for absent Codex CLI and are **not independent human approval**. Review corrections include false late-burst60fps math, bounded file allocation/operations, invalid-frame fail-open, false zero exits, stale post-seek frames and missing required rows. The measured source is byte-identical to integrated app/tooling/tests. This separate documentation receipt does not change runtime or certification; its own protected checks remain required. [Review/handoff](agent-runs/2026-10-20-issue10-engine-matrix.md) records exact final state.

Rollback is a protected revert of this scoped PR; no schema/account/payment migration, preview update or runtime media processing was introduced. Do not close issue10 while the documented4K60 measurement/output, HDR preservation/output and Chromium-HEVC backend gaps remain unverified; broader unresolved audio/provider evidence is retained separately.
