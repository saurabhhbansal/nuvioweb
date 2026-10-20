# Playback engine matrix — issue #10, 2026-10-20

This unit implements the owner's **engine, not browser-brand** scope for [issue #10](https://github.com/saurabhhbansal/nuvioweb/issues/10). Chromium maps to Chrome/Edge/Brave/Opera, WebKit to Safari and Gecko to Firefox. Each engine runs once; these mappings do not imply physical-device or branded-release certification. [Plan](plans/issues/issue-10.md) · [native raw receipt](evidence/issue10-engine-2026-10-20.json) · [input provenance](evidence/issue10-generated-media-2026-10-20.json).

**Issue #10 stays open.** No physical HDR output or strict sustained4K60 pass is claimed. No preview deployment, live provider/account check, production compute, runtime engine fallback or media transformation was introduced. The other issue7/120/128–130 work, runtime, existing browser sessions and elapsed observers are outside this unit.

## Evidence layers and native result

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

Counters are not interchangeable. The predicate requires ≥8s, callback and presented rate≥58.5fps, media/wall≥0.98, positive frame timestamp progression, no callback gap>100ms and≤1% dropped frames. Near60 counters or MediaCapabilities `smooth:true` do not waive it. Gecko HEVC's `powerEfficient:true` is an API prediction; it does not override the missing GPU-device evidence.

HDR input tags are measured BT.2020/PQ or HLG,10bit. HEVC HDR10 has encoder-authored1000nit mastering/CLL1000/FALL400 metadata, not calibrated mastering or display proof. All three engines report no HDR/P3/Rec.2020 screen in this headless environment. Successful tagged-frame decode proves neither preservation nor tone mapping.

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
| Strict sustained4K60, all three engines | **HOST/ENVIRONMENT LIMITATION**: observed rates miss the published criterion; headless timing/software stack, four exposed logical CPUs and no `/dev/dri` device. Not an inherent engine conclusion. | Hardware-accelerated decode on a supported GPU/driver with an actual60Hz-or-faster4K display/compositor; rerun the identical source and full-window predicate separately per engine. Record decoder backend, frame pacing, drops and thermals. |
| Physical HDR10/HLG, all three engines | **HOST/ENVIRONMENT LIMITATION**: no evidenced HDR display/compositor or high-dynamic-range screen; tags and software decode cannot certify output. | Verified10bit HDR10/HLG display and OS HDR pipeline, supported GPU/driver and engine media backend; inspect actual output mode and use a calibrated pattern/capture or meter. A current HDR-capable Mac is a practical WebKit host, not a new browser-brand acceptance matrix. |
| Chromium HEVC SDR/PQ/HLG | **HOST/ENVIRONMENT LIMITATION / tested-build codec integration gap**: native negative and error4; no inherent cross-platform engine limitation established. | A licensed/OS-integrated HEVC-capable Chromium build and accessible decode backend; preserve exact codec/profile inputs and report actual decode/seek separately from API predictions. |

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

Rollback is a protected revert of this scoped PR; no schema/account/payment migration, preview update or runtime media processing was introduced. Do not close issue10 while the documented4K60/HDR-output/Chromium-HEVC host gaps remain uncertifiable; broader unresolved audio/provider evidence is retained separately.
