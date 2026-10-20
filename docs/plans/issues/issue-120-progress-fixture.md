# Issue #120 — lawful long-duration progress fixture

Baseline0d771735, current parent #7 verification run. The existing same-host CC0 demo is about2seconds, while actual watch-progress sync excludes known durations below60seconds. Do not alter that product guard or claim synthetic/backend insertion as application playback proof.

Target: a new original generated120-second VP8/Opus rectangle/tone fixture, standalone generator with real ffprobe validation and SHA-256 provenance; a separate optional static same-host addon staged under demo/identity-progress; packaging and bounded browser-duration checks; verification/support documentation. Keep the existing short demo unchanged. Two clearly named fixture items share the generated lawful media, allowing independent watched-history and in-progress observations without contradictory state for one title.

Contract: explicit optional installation only, no auto-install/backend/new service; static catalog/meta/stream files point only to existing dedicated preview origin without credentials/query strings. CC0 original generated content, ffmpeg tools only for local generation (no new application dependency). Stored binary duration must be119–121s, below2MiB, finite/seekable in actual browser and hash-equal to provenance. No title string as playback evidence. No account/API traffic during fixture generation/tests. Playback progress still requires subsequent real application write and independent receiving application against live Nuvio, not this packaging test.

Non-goals: authentication/sync implementation changes, short-demo changes, conflict/durability guarantees, named physical/device/QR claims, production/compute/payment launch or third-party media.

Threats: illegal media import, credential-bearing stream URLs, fixture below sync threshold, stale hash/provenance, accidentally overwriting existing files, size/cost increase. Generator refuses existing targets; staged artifact inventory covers every file and retains GPL/source notices. Cap encoding90s and output2MiB; static hosting only. Existing preview rollback retained.

Tests: node --check scripts/generate-progress-media.mjs; generate new asset once with real ffmpeg/ffprobe; node --test scripts/stage-identity-progress-demo.test.mjs scripts/stage-legal-demo.test.mjs scripts/prepare-static-preview.test.mjs; actual local browser finite duration/seek/advancing playback; required four protected CI workflows and independent actual-diff automated review before merge. Update support and evidence with exact commands/results; no tests-as-live-proof. Protected merge then dedicated development-preview inventory/source readback before live journey.

Rollback: protected revert packaging addition and previous preview deployment rollback; no account data modified by this change. Live verification cleanup uses only separately proven unused disposable scope and reviewed guarded driver.

Generation observed ffmpeg9.0.1:344925bytes, measured120.008seconds, codecsVP8/Opus. Initial local browser seek fixture failed because its server omitted byte Range handling. With actual206 byte serving,7 packaging/browser/preparation tests pass; existing short demo is unchanged. Server/test correction is fixture engineering, not a product regression or live-service proof.
