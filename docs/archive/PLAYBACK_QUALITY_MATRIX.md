# Original quality and media failure verification — issue #10

## Current owner acceptance — actual providers, DEFERRED / not verified

Issue #10 remains **OPEN / `in_progress`**, labelled `deferred`. The owner's actual installed-provider acceptance instruction overrides old fixture-based acceptance: every generated/loopback result below is **historical synthetic regression only**, not real-provider proof. [Actual-provider report](evidence/issue10-real-provider-2026-10-20.md) · [full privacy-checked receipt](evidence/issue10-real-streams-2026-10-20.json) · [current engine summary](ENGINE_CAPABILITY_MATRIX.md) · [plan](plans/issues/issue-10.md).

Actual Chromium156 delivered the [provider] AVC/AAC alternative at1920×1080 for30s, including pause, seek, a new post-seek frame, resume and Back. **No actual4K frame case passed.** WPE real MKV/control paths stalled; Gecko3840×2076 was metadata/resume-clock only, zero total frames/media advancement, observer exit2; actual4K MP4 failed on both WPE and Gecko. Unknown metadata is verified in actual cards, but original4K/error criteria stay unchecked. Real header-required guidance and Back do not cure generic startup-stall. Exact delivery/startup diagnostics remain [#137](https://github.com/saurabhhbansal/nuvioweb/issues/137); physical HDR output remains [#138](https://github.com/saurabhhbansal/nuvioweb/issues/138). No engine-wide ban or hardware diagnosis follows.

Chromium/WebKit/Gecko are engine cohorts, not duplicated brand certifications. The served preview stays pinned at `b5a8679`, distinct from base `45d59a16`; no deploy or actual-current-main UI claim. All240 returned-row observations, export checks and reconstructed Chromium default-headless-shell provenance (not runtime argv) are in the actual receipt.

## Historical fixture unit and engine regressions — not acceptance

Second unit on `m2/issue-10-media-fixtures`, continuing the reporting seam merged through PR38 atd9b32a8. [Source declaration/prediction contract](SOURCE_CAPABILITIES.md) · [fixture rights/hash manifest](../tests/fixtures/media/quality/provenance.json). Its pending-review/integration/preview/remaining notes below are historical and superseded by later dated receipts, not current acceptance status.

The [three-engine capability matrix](ENGINE_CAPABILITY_MATRIX.md) preserves earlier native/adaptive regressions separately from actual-provider outcomes. The [completed feasibility research](research/issue10-playback-feasibility-2026-10-20.md) and [offline reassessment](evidence/issue10-frame-reassessment-2026-10-20.json) identify only the callback-rate clause as failing in each old60fps row; this is not proof of inadequate decoding speed or an inherent engine ceiling. Historical strict60 exit3 and test criteria stay unchanged. The60fps input is SDR; the HDR controls are24fps, not a combined4K60HDR pass.

Native and adaptive current fixture containers are separately inventoried lossless normalizations, with exact ordered packet hashes and complete AVC payload equality. The legacy MediaRecorder native duration and adaptive buffered-gap failures are preserved, not claimed fixed in old files. [Native inventory](../tests/fixtures/media/quality/native-provenance.json) · [adaptive inventory](../tests/fixtures/media/quality/adaptive-provenance.json). No production remux, retry/engine change, downscale or new media recipient was introduced.

## Media and exact scope

The generator draws original geometry/text directly onto1920x1080 and3840x2160 canvases. No640x360 input was upscaled. Existing Chromium records video-only H.264 MP4; original files and packaged manifests/segments are CC0. No new dependency, downloaded sample, user media, backend, paid service or token is used. Generated on Linux ARM64 Chromium156.0.8078.4, requested5fps. Browser encoding changed requested profile levels; provenance distinguishes requested MIME, recorder-reported MIME and actual AVC initialization (`avc1.42c02a` / `avc1.640c34`). Decoded dimensions/time/error were independently observed, not copied from titles.

Final original1080p:41,209bytes, SHA256 `6ca4ff483d09902b23c305d028aed66c34e759ad30c28c83e6aecc341486ba12`;4K:52,293bytes, SHA256 `53b22203016da937bf4ed24af102fe8bd941c940f2869895a936b0076ca5e06a`. Exact generator/packager source hashes, requested settings, observed duration and all derived hashes are in provenance. Regeneration changes bytes/timing and must update that manifest.

The packager handles only this bounded original single-track/single-fragment layout. It validates box lengths/order, one AVC video entry, matching observed dimensions/duration and relative fragment addressing, then separates init/media bytes without transcoding. Recombined init+segment equals the original encoded file except the unused trailing random-access index. Static single-rendition HLS/DASH reference those same bytes. This establishes original encoded dimensions for these fixtures, not ABR switching, HDR, audio,4K60 or high-motion/high-bitrate performance. [W3C ISO BMFF](https://www.w3.org/TR/mse-byte-stream-format-isobmff/) and [HLS RFC8216](https://www.rfc-editor.org/rfc/rfc8216) informed packaging; this is test tooling, not a production media parser.

## Observed journeys

| Case | Actual evidence so far | Limit |
| --- | --- | --- |
| Original1080p MP4 | Bundled guest source→player, video1920x1080, no media error, advancing time and seek passed | Short local video-only fixture, this Chromium host |
| Original4K MP4 | Same journey reports3840x2160, original URL, advancing time/no error and seek passed | No downscaled rendition or processing service introduced; not a billing-service test |
| Original4K HLS | Actual manifest/init/segment requests, MSE blob playback3840x2160 and seek passed | Single rendition, not ABR; engine events are recorded separately where emitted |
| Original4K DASH | Actual MPD/init/segment requests, MSE blob playback3840x2160 and seek passed | Single video adaptation, no audio/subtitle selection |
| Native expired410/restricted403 | Actual HTTP failures; native child SOURCE error; after UI fix accessible generic failure and Go Back passed2/2 | Native video.error remains null; no invented HTTP/codec diagnosis in UI |
| HLS manifest CORS denied | Actual browser rejection/absent ACAO; fatal manifest error now reaches visible failure and Go Back, focused1/1 passed | Generic network/source cause, not a proxy or a fabricated HTTP status |
| Original bytes/transport | Packaging/hash/relative-addressing contracts and fixed allowlisted HTTP MIME/Range/status/CORS tests pass | Loopback fixtures only; no public HTTPS/PNA/provider certification |

All fixture servers remain127.0.0.1. Provider observations retain paths/credential-presence flags only, never queries/values. Browser routes abort every nonfixture origin. Fixtures and source harness are excluded from public artifacts. The public preview remains its separately recorded #6 revision; these changes are not deployed.

## Two actual regressions

Native failure first reproduced with an empty, `aria-hidden=true` error overlay. Two minimized red runs captured ERROR on SOURCE, no VIDEO error/MediaError and no handler exception. The normal video error listener missed a non-bubbling descendant event. Capture now handles the current direct child and removes listeners with the same capture option. Generic guidance preserves unknown cause and does not initiate another request for a code-less child failure. Existing VIDEO/custom error paths remain; startup logging uses the existing redacted endpoint helper. A synthetic private media query checks this application warning does not expose the marker. [WHATWG resource selection](https://html.spec.whatwg.org/multipage/media.html) describes source-candidate error events.

The separate CORS case exposed fatal `manifestLoadError`: calling startLoad without a loaded manifest did not reload it or report failure. Two HLS callback unit cases were red before the fix. Fatal manifest error/timeout now propagates the existing network error after the library's own load policy; segment recovery and terminal-status behavior remain. Four new callback regressions plus existing tests pass14/14. Because this changes remote-fetch recovery, AGENTS requires human review of the concrete PR before merge. No URLs, headers, authorization, media processing or paid fallback is added.

Temporary DEBUG-quality event/rejection instrumentation was removed after diagnosis. The regression retains actual aria-visible content and return actions; opacity-only visibility was insufficient. Initial failures remain recorded instead of being treated as completed journeys.

## Reproduction and executed checks

Use pinned Node22.23.1/npm10.9.8 and existing Playwright1.64.0 Chromium156:

```sh
node scripts/generate-quality-media.mjs
npm run test:quality-fixtures
npm run test:addon-fixtures
cd app/alpha
NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build
npm test
npm run lint
cd ../..
npm run test:browser
node scripts/check-alpha-build.mjs
node --test scripts/check-docs.test.mjs scripts/governance.test.mjs
node scripts/check-docs.mjs
node scripts/check-progress.mjs
```

Generator independently verified both original dimensions/time/error and produced the recorded hashes. Packaging4/4 and HTTP fixture5/5 pass, no skips. Final full application1089/1089 pass,0fail/0skip,48.0seconds; configured build/lint pass. Initial quality browser4pass/3fail exposed real error gaps; subsequent native failure2/2 and CORS1/1 focused runs passed after fixes. Final complete27browser journeys, artifact/docs/governance and protected exact-head checks remain integration requirements. Do not merge before owner review of the HLS recovery change.

Remaining #10 gates: compatible-source ranking/unknown policy; named Chrome/Edge/Firefox/Safari/device evidence; realistic sustained high-bitrate/4K60/HDR and broader failure fixtures. Real audio/subtitle selection and live identity/sync remain separate roadmap verification. No feature-complete beta or production readiness is claimed. Rollback is a protected revert of this fixture/error unit, preserving the already merged PR38 declarations and upstream history/licenses; no data/schema/payment migration.

## Completed full run and privacy review follow-up

The complete local run on source3297e09 passed **27/27**,0fail/0skip/0flaky,2.3minutes. [Structured observations](evidence/quality-2026-10-18.json) retain actual dimensions, duration, requests, error guidance and emitted engine events. DASH emitted dash.js events; HLS emitted no track event in this video-only fixture, so its evidence is MSE playback plus HLS manifest/init/segment requests rather than a fabricated engine event. Artifact12 and docs/governance15/15 checks passed, as did links/ledger/ancestry/whitespace. Original Alpha GPL and #9 media hashes remain unchanged.

Standards review found a second startup warning reachable through HLS fallback still logged the complete URL. A signed-query CORS regression reproduced the synthetic secret in serialized warning arguments (red); both startup warnings now use the existing redacted endpoint helper. The regression explicitly requires observing the switching-engine warning, avoiding an empty-log false pass. Focused native/HLS privacy results and final exact-head CI will be recorded on the PR. The first Spec review attempt was interrupted by an account usage limit and is not represented as completed review. Human remote-fetch review remains mandatory before merge.

## Final correction verification — 2026-10-19, draft PR39

[PR39](https://github.com/saurabhhbansal/nuvioweb/pull/39) remains a draft pending owner review of fatal HLS manifest recovery. Automated Spec review also identified that the capturing listener received unrelated TRACK errors. A bundled regression reproduced a false `Playback failed` warning with code0 while native video time advanced. Filtering VIDEO/current direct-child SOURCE at handler entry now preserves playback and the pause control without reporting a false source failure. This synthetic event verifies error isolation, not subtitle loading/selection. Both automated review follow-ups report no remaining actionable findings; neither is human approval.

Final local checks on source7eb8147, pinned Node22.23.1/npm10.9.8:

- `NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build --prefix app/alpha` and `npm run lint --prefix app/alpha`: pass.
- `npm test --prefix app/alpha`:1089/1089 pass,0fail/0skip,18.7seconds.
- `PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/nuvioweb-issue-10-browser-final-2026-10-19.json npx playwright test --reporter=list,json`:27/27 pass,0fail/0skip/0flaky,54.4seconds. [Structured actual observations](evidence/quality-2026-10-19.json) retain seven quality/failure cases, exact source SHA and limits. Includes the signed native/HLS fallback warning and subtitle-isolation assertions.
- `npm run test:quality-fixtures`, `npm run test:addon-fixtures`, `npm run test:preview`:4/4,5/5,1/1 pass.
- `node scripts/check-alpha-build.mjs`:12 assets/inert configuration pass.
- `node --test scripts/check-docs.test.mjs scripts/governance.test.mjs`:15/15 pass. `node scripts/check-docs.mjs`, `node scripts/check-progress.mjs`, `node scripts/check-commit-references.mjs origin/main HEAD`, `git diff --check`: pass.

Initial focused runs encountered sandbox loopback binding restrictions and incorrect test-driver assumptions (Sources navigates away; primary pause control uses a CSS mask, not IMG). The final regression directly dispatches TRACK error during playback and asserts no false warning, advancing time, actual pause mask and no media error. No failing assertion was weakened to accept a spinner or playback error. Required exact-head GitHub checks remain the PR's integration gate. #10 stays in progress; public preview is unchanged.

## Owner acceptance and integration

After reviewing the concrete HLS fix explanation and protected-merge implications, the owner explicitly approved PR39 in the coding workspace. [Approval receipt](https://github.com/saurabhhbansal/nuvioweb/pull/39#issuecomment-6258963843). All four required contexts passed again after marking ready; PR39 merged at0cf88767cc24c56e81a51f786baab77b64009286. This supersedes its earlier pending-owner/integration notes. No deployment or #10 closure followed. The third unit's optional native-prediction display order is documented in the [source contract](SOURCE_CAPABILITIES.md); it preserves the integrated player/quality behavior and adds no remote fetching or processing policy.

PR40's display-only ordering unit subsequently merged at8edec42 with all protected contexts passing, including1094 application and29 browser tests. The development preview was refreshed to that reviewed merge and its actual HTTPS/guest/worker receipt passed; see [preview evidence](STATIC_PREVIEW.md). This supersedes earlier unchanged/#6 preview-revision notes. Public media/auth/sync/device behavior remains unverified; legal original-quality playback evidence is still the explicitly local fixture matrix above. No additional engine/network policy was added by PR40.

## Startup-failure classification — 2026-10-19

The player reported one hard-coded reason per startup call site, so a header-restricted source and an unsupported Matroska source could both surface `startup-stall` with unrelated guidance. A bounded classifier (`app/alpha/js/core/player/startupFailure.js`) now decides the reason from evidence and the message builder consumes the same classification, so text and reason cannot disagree.

Reason set: `header-required`, `unsupported-container`, `unsupported-codec`, `invalid-content`, `network`, `aborted`, `decode-error`, `startup-stall`, `startup-media-error`, `startup-source-error`, `startup-unknown`. An unsupported reason requires a native engine (not `hls.js`/`dash.js`), a fully inspected runtime detail, descriptor evidence, and either a definitive "not reported" `canPlayType` answer or a media 3/4 rejection with no transport or parse evidence; a source the engine predicted as playable is never classified unsupported.

Chromium156.0.8078.4 evidence (real `canPlayType`): Matroska/HEVC → `unsupported-container`; MP4/HEVC → `unsupported-codec`; MP4/H.264 → `startup-stall`; HLS manifest → `startup-stall`; any of them with an HTTP status → `network`. The bundled player's header-restricted fixture now shows the header guidance with `Reason: header-required` and returns to the source list, where the previous build reported `startup-source-error`.

Exact commands, counts and limits are in the [classification evidence](evidence/startup-classification-2026-10-19.md). Chromium only: WebKit/Firefox/branded-device behavior is not claimed, the two new strings are untranslated, details over 1024 characters degrade to a generic reason, and multitrack/HDR remain unverified. #10 stays open for automated WebKit coverage, multitrack audio, a supported HDR observation and hosted external-provider CORS.

### Engine-family coverage after the WebKit unit — 2026-10-19

`tests/browser/engine-capabilities.spec.mjs` now runs on Chromium locally and inside the required browser job, and on Playwright WebKit 27.2 in CI via `NUVIO_PLAYWRIGHT_WEBKIT=1 npx playwright test --project=webkit`. Because the spec derives every expectation from the engine's own `canPlayType` answer, the two engines produce different but each-honest results: Chromium reports `not reported` for Matroska/HEVC and `probably` for H.264, while WebKit reports `probably` for all three and `not reported` for the HLS MIME type. The classifier therefore claims unsupported formats on Chromium and does not on WebKit, which is the intended behavior rather than a per-engine expectation baked into the test.

This is not a playback claim: the WebKit project decodes no media. iOS Safari behavior remains an owner observation, not a CI result. [Review record](agent-runs/2026-10-19-webkit-coverage-review.md) · [evidence](evidence/startup-classification-2026-10-19.md)

### Local audio/container recovery boundary (#12 unit 0) — 2026-10-19

Recorded before any recovery code, so later evidence is judged against a published boundary:

- **What the prototype will attempt:** (a) recovery by explicitly selecting a compatible alternate audio rendition while the selected video representation is pinned, and (b) demonstrating the existing hls.js MPEG-TS → fragmented-MP4 transmux with original H.264/AAC samples. [Plan and decisions](plans/issues/issue-12.md).
- **What it will not do:** decode AC-3/E-AC-3/DTS/TrueHD, add a WASM demuxer or remuxer, repair arbitrary MKV/AVI/standalone-TS files, re-encode or scale video, relay media through any operator service, or bypass DRM. A local decoder is unavailable by decision, not by accident: the audited permissive-WASM path has no eligible candidate, so container support stays engine-native.
- **What counts as evidence:** engine track identity plus requests attributed to the selected rendition's own fixture payload plus advancing video with no media error, and — where capture is available — a test-only Web Audio analyser tone check with a positive control and post-switch windows. An analyser signal proves decoded digital audio reached that point, not that speakers were audible; audible claims remain named human observations.
- **What stays unproven meanwhile:** multitrack selection, HDR preservation, surround/Atmos/lossless output, and every Safari/Edge/mobile row. Chromium coverage and the Playwright WebKit CI job are engine-family evidence only.

No support claim changes in this unit; #10's open gates and #12's acceptance remain outstanding.
