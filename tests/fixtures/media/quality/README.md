# Original quality fixtures

These original canvas recordings, initialization/media segments and manifests are dedicated under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No provider or downloaded media, audio or HDR is included. Generator/packager source follows the project source license.

[Provenance](provenance.json) records requested encoding separately from actual parsed AVC initialization, decoded dimensions/time/error and hashes of every media/manifest output. Generated on local Linux ARM64 Chromium156, requested5fps. These short low-complexity files are not4K60/HDR, high-bitrate performance or universal-device evidence.

Reproduce with pinned Node22 and existing installed Playwright Chromium: `node scripts/generate-quality-media.mjs` from repository root. This uses [the generator](../../../../scripts/generate-quality-media.mjs) and [fixed-format test packager](../../../../scripts/quality-fixture-packaging.mjs), no internet/media service. Bytes/timing vary on regeneration. CI uses the committed hashed files instead of re-encoding. [Observed application journeys and limits](../../../../docs/archive/PLAYBACK_QUALITY_MATRIX.md).
