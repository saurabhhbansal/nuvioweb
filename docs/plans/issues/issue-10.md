# Issue #10: [M2][P0] Implement source descriptors and browser playback capability reporting

**Plan status:** Proposed for agent review — no implementation/test evidence recorded.  
**Milestone:** M2 · **Priority:** P0  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/10  
**Workstream:** [M2 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Implement source descriptors and browser playback capability reporting

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

M2-01; M1-02

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Planned interfaces and deliverables

packages/source-capabilities or existing equivalent source descriptor; player compatibility probes and diagnostics

The issue-owning agent must convert this initial artifact inventory into precise file paths, types/interfaces, test fixture IDs and API contracts after checking the imported codebase. Avoid introducing extra auth systems or central media relay as implicit dependencies.

## Detailed implementation sequence

1. Specify normalized source descriptor for container, codec, HDR, tracks, subtitles, headers and URL expiry
2. Probe capabilities and original-quality native/HLS/DASH playback
3. Rank compatible sources without inventing codec metadata
4. Provide friendly unsupported-format diagnostics

**Integration sequencing:** land the smallest verifiable unit first; update the plan if tests reveal a wrong assumption, then create separate follow-up issues for work outside scope.

## Functional acceptance criteria

- [ ] A supported 4K source is not charged for or silently downscaled
- [ ] Unknown metadata is identified as unknown
- [ ] Source and browser errors are explainable

## Verification design

Legal 1080p/4K/HLS/DASH fixtures on Chrome/Edge/Firefox/Safari; CORS, seek and expired source cases.

**Evidence that must be attached before closure:** commands actually run, exit codes and assertions, tested browser/device versions if applicable, failures and workarounds. Do not mark a box checked based on static inspection alone.

## Threat, cost, privacy and licensing review

Treat manifest/plugin/media as untrusted. Guard XSS, CORS, SSRF, browser codec incompatibility, unsafe plugin API exposure, huge inputs and quality downgrades.

Confirm no secrets are introduced, provider/API costs are bounded, third-party source licenses are preserved and users receive no unexpected paid action. Escalate platform authorization or payment-policy uncertainties instead of guessing.

## Telemetry, rollback and ownership

Capture bounded, redacted failure counters and trace IDs without exposing access tokens, media URL queries or personal playback metadata.

**Rollback:** Disable experimental add-on/engine via feature flag, restore native playback and keep clear unsupported messaging.

## Definition of done

- [ ] Dependency assumptions and interface/API contract verified against code or published upstream evidence.
- [ ] All issue acceptance criteria tested and documented.
- [ ] Negative/security/budget cases covered as relevant.
- [ ] Docs, compatibility notes and source provenance updated.
- [ ] Reviewed pull request linked to issue, with rollout and rollback evidence.

## Inspected implementation and first integration unit — 2026-10-18

Selected after #9 evidence PR37 merged at5e70000; #5 and #9 are verified. Current upstream pin remains5624da2. Existing `streamRepository.mapStream` drops explicit MIME/codec metadata, `streamList.flattenStreams` retains only selected fields, and browser cards derive decorative quality labels from titles. `PlayerController.getPlaybackCapabilities` has generic MIME probes (including HDR/Atmos likelihood heuristics); these are not fixture/device proof. Existing player already offers native/HLS.js/DASH.js and detailed media/HTTP/header errors. Reuse those engines; do not rewrite playback or authentication.

This first small PR implements the descriptor/reporting seam and browser-card evidence wording. It deliberately leaves #10 open until realistic original1080p/4K/adaptive/seek/expiry and browser/device verification plus compatible-source ordering are completed. #9's640x360 fixture alone cannot satisfy #10. No acceptance criterion is marked complete by a build.

### Precise files and contract before code changes

- New `app/alpha/js/core/streams/sourceCapabilities.js` and `.test.mjs`: version1 normalized descriptor from explicit provider fields only; no filename/title-derived codec, resolution or HDR. Fields: contentType (explicit MIME), container, video {codec,width,height,bitrate,framerate,hdr}, audio tracks {codec,language,channels}, subtitle tracks {language,format}, required-request-header presence/count (never values/names), declared ISO expiry, transport hint. Missing/invalid fields are null/unknown, provider declarations remain unverified. Descriptor contains no media/provider URL, raw metadata, credentials or title. Arrays/text bounded; descriptor normalization is pure and performs no I/O.
- Supported input extension fields are `mimeType`, `video` object, `audioTracks` array, `subtitles` array, `expiresAt` ISO timestamp and existing `behaviorHints.proxyHeaders.request`; these are a documented internal projection of optional explicit provider fields, not an invented Stremio-required schema. Transport hint may inspect URL scheme/path without retaining/query logging or treating extension as codec proof.
- `probeSourceCapabilities(descriptor, environment)` returns explicit native canPlayType report and optional MediaCapabilities decodingInfo report only when required finite video configuration/contentType exists. No source GET/HEAD, DRM request, server processing, stream mutation, credentials, persistence or telemetry. Missing/throwing APIs yield unknown; a probe reports browser prediction, never observed playback/HDR output. Bounded timeout if async API hangs; no invented bitrate/frame-rate/channel defaults to coerce a probe.
- `app/alpha/js/data/repository/streamRepository.js`: attach normalized descriptor when mapping provider payload; no fetch/header/session/timeout/destination change. `app/alpha/js/core/streams/streamList.js`: carry descriptor through actual flattening, preserving original URLs/quality/order and raw source behavior.
- `app/alpha/js/ui/components/browserStreamSourceCard.js` and default strings in `res/values/strings.xml`: browser-card line distinguishes explicit provider metadata from unknown and native browser prediction from verified playback. Reuse existing secondary wrapping typography, escape all text. Do not change clickable card actions, engine selection, autoplay, source ranking or season-download actions. Existing decorative title badges are provider labels, not the new capability evidence.
- Before style edits: inherited browser secondary lines shrink to12px on narrow layouts and clamp to two lines. Extend the existing `css/components.css`/`desktop.css` with a narrowly scoped source-evidence rule: wrapping/unclamped text and16px browser type. Inspect one desktop/narrow screenshot pair after tests; no unrelated style changes.
- `tests/fixtures/addons/server.mjs`, contract tests and `tests/browser/capabilities.spec.mjs` as needed: unknown/false4K-title metadata, explicit originalVP8 fixture metadata, malformed/injection fields and unsupported-MIME reporting. Actual repository→flatten→card→playback must keep original fixture URL/dimensions/time/error and provider requests remain credential-free. Test actual browser MIME/MediaCapabilities reporting without pretending it proves4K/HDR support. No fixture source/harness is deployed.
- `docs/SOURCE_CAPABILITIES.md`, `docs/FEATURE_SUPPORT.md`, ledger/TRACKER and `UPSTREAM_SOURCES.md`: document contract, exact evidence, patch inventory and remaining browser/device/adaptive/quality gates. Ledger remains in_progress; #10 must not close after this first unit.

### Verification, threats and rollback

Automated Standards review found plugin results can supply their own `sourceDescriptor` while bypassing HTTP `mapStream`. Before follow-up code edits, normalize every existing descriptor at flatten/card entry through the same bounded/redacted declaration rules; never trust object presence as validation. Keep plugin execution/transport untouched. Add a forged-descriptor browser regression through actual flattening and card rendering (oversized/URL-bearing codec/HDR, malicious MIME and excess tracks) and focused normalizer assertions. Re-run relevant focused tests, rebuild/lint/full browser checks and record the earlier review failure honestly.

Primary technical references inspected2026-10-18: [WHATWG media canPlayType](https://html.spec.whatwg.org/multipage/media.html) returns an empty/maybe/probably prediction, not a playback observation; [W3C Media Capabilities](https://www.w3.org/TR/media-capabilities/) reports supported/smooth/powerEfficient for the supplied configuration, not tested output quality. Use no DRM configuration and no inferred HDR/Atmos conclusions.

Run focused descriptor tests including hostile/missing metadata and API absence/rejection/hang; configured inert Alpha build, full application tests/lint/artifact checks after runtime changes; complete browser suite with existing shell/PWA/add-on regressions plus new actual capability/card fixture; fixture contracts if provider changes; docs/governance15tests, links/ledger/ancestry/whitespace. Record command results and failures honestly. Do not broaden repeats after final unchanged passing checks.

Threats: metadata/HTML injection, provider secrets in URL/header/expiry text, false codec/4K/HDR promises, hanging or unavailable browser APIs, accidental adaptive-engine exclusion and original-quality regression. Keep normalized report bounded/redacted, independent of transport/authorization and source choice. No paid fallback, backend, compute, new dependency or deployment. No sensitive implementation change under AGENTS human-review categories; any later network/processing change requires its own concrete checkpoint. Rollback this module/projection/card addition through a protected revert; no account/data/schema migration.

### First-unit execution checkpoint

Draft PR38: normalized source projection, native/optional bounded video-only prediction, browser evidence wording, optional header/expiry guidance; no source choice/engine/auth/network policy changes. Focused6/6, full1085/1085 (47.3seconds), lint/configured build/artifact12 and4fixture/15docs-governance passed with zero skips. Initial complete browser18pass/1fail was an overbroad injection selector counting the harness head script; corrected to rendered body while retaining marker assertions. Automated review found the raw-plugin descriptor gap; fixed at flatten/card/probe boundaries with forged-metadata regressions. Full20browser run and exact-head protected CI remain required. See SOURCE_CAPABILITIES for observed screenshot/layout limits and actual API/playback boundaries. No #10 acceptance/completion claim yet.
