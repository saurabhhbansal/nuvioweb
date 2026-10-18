# Original quality and media failure verification — issue #10

Second unit on `m2/issue-10-media-fixtures`, continuing the reporting seam merged through PR38 atd9b32a8. [Plan](plans/issues/issue-10.md), [source declaration/prediction contract](SOURCE_CAPABILITIES.md), [fixture rights/hash manifest](../tests/fixtures/media/quality/provenance.json). Issue10 remains in progress. This unit contains a remote-fetch recovery correction requiring owner review before merge; automated review and passing CI are not that approval.

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
