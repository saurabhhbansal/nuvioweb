# Issue #10: [M2][P0] Implement source descriptors and browser playback capability reporting

**Plan status:** In progress — reporting seam PR38 and owner-approved quality/failure PR39 merged; optional native-prediction ordering PR40 merged after full local/remote verification; reviewed development preview refreshed and verified. Broader device/quality gates remain unfinished.
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

Final first-unit verification: complete browser20/20 passed (1.6minutes), no failures/skips; latest configured build/lint/artifact12 and docs/governance15/15 pass. Six capability journeys include real declaration/prediction/original playback, visible header/expiry, body escaping, raw-provider descriptor normalization and desktop/narrow16px layout. Automated Standards/Spec follow-ups report no remaining actionable findings. Protected four-context CI passed on644fe92; final documentation-head checks remain required before first-unit merge. Issue10 remains open/in_progress, with realistic4K/adaptive/device/ranking work outstanding.

## Second integration unit: original quality/adaptive media fixtures — planned2026-10-18

First reporting unit PR38 merged atd9b32a8 after all four exact-head checks passed; #10 remains open. Continue this same issue on `m2/issue-10-media-fixtures`, preserving module/UI work and all previous evidence. Available local Chromium156 predicts MP4/H.264 recording/native support; this is exploratory API evidence only. Existing Playwright FFmpeg is limited to PNG/VP9/WebM, so do not assume it can mux HLS/DASH or add an unreviewed tool dependency.

Before generator/test edits, targets and bounded contract:

- `scripts/generate-quality-media.mjs`: use existing Playwright Chromium only, no external downloads/network. Original moving canvas geometry/text, video-only short recordings at1920x1080 and3840x2160, requested H.264/MP4 or record precise failure. Record output bytes/hash, generator/browser/source/license, requested-vs-observed dimensions and parsed codec initialization details. Never upscale the640x360 source or mislabel a rendition. Limit generation to a few seconds and one encoder at a time. Generator is test tooling, no user-media processing service or app recovery path.
- `tests/fixtures/media/quality/`: CC0 original media and provenance; original small #9 fixture unchanged. If Chromium emits fragmented MP4, use a small fixed-format test packager `scripts/quality-fixture-packaging.mjs` to split only bounded top-level ftyp/moov initialization and moof/mdat media, write static single-rendition video-only HLS/DASH manifests. Validate box lengths/required segments, fail closed on unsupported layout. No general media demux/transcode library, DRM or production parser. If this fails, retain evidence and choose a reasonable reviewed local-tool alternative rather than asserting adaptive playback.
- `tests/fixtures/addons/server.mjs` plus contract tests: explicit allowlisted original-quality media/manifests only, correct MIME/CORS/Range; legal manifest scenarios for1080p/4K/HLS/DASH and HTTP403/410 failure. No arbitrary path traversal/proxy/private URL or credentials. No fixture controls/media included in public deployment.
- `tests/browser/quality.spec.mjs`: actual bundled guest source→player journeys, original URL and observed video dimensions/error/time, seek where fixture duration permits. Use existing native/HLS.js/DASH.js engines untouched; report precise engine and failures. Include expired/restricted-source diagnostics without inventing cause from generic CORS. Runtime fixes affecting media processing/transport require their own plan and concrete human review, not a silent test workaround.
- Fixture packaging tests, docs/SOURCE_CAPABILITIES.md/FEATURE_SUPPORT/ledger/TRACKER as needed: prove original hashes, valid manifests/local references and actual browser assertions. Chromium-on-this-host remains the only observed device unless other browsers are explicitly installed/tested; WebKit on Linux is not Safari certification. Keep #10 open for missing supported-device/browser/ranking gates.

Required commands after fixture/test changes: generator with pinned Node/installed Chromium; focused packaging/fixture contracts; configured build only if source/build config changed or artifact stale; focused quality browser tests then complete browser suite; docs/governance/links/ledger/ancestry/whitespace. No inherited1085-suite rerun locally for fixture-only changes; mandatory remote application CI remains enforced. Security/cost/rollback: loopback-only, original bytes only, bounded parsing/encoding, no tokens/network/backend/paid commitment; protected revert removes fixtures/tests, not shared history. No codec/HDR claim without observed output and no automatic downscale/remote paid fallback.

### Observed source-element error gap — plan amendment before runtime edits

Actual bundled playback/seek passes for original1920x1080 MP4,3840x2160 MP4,3840x2160 HLS and3840x2160 DASH. Expired410/restricted403 cases fail the real UI regression: the overlay stays `aria-hidden=true` and empty. The minimized command `npx playwright test tests/browser/quality.spec.mjs --project chromium --grep 'quality-expired surfaces'` reproduced it twice (about16seconds). Browser-only capture confirms ERROR targets the child SOURCE, not VIDEO; video.error remains null, no handler rejection. Existing video error listener does not capture descendant events. [WHATWG media selection](https://html.spec.whatwg.org/multipage/media.html) permits this source-candidate failure path. Initial `toBeVisible` was too permissive for opacity0; the regression now checks actual aria-hidden=false plus content.

Extend targets to `app/alpha/js/ui/screens/player/playerScreen.js` and existing default strings. Capture errors on the current direct child SOURCE; preserve capture option for symmetric listener removal. Present generic source-load guidance without fabricating a MediaError code, HTTP status or unsupported codec. Do not invoke additional engine retries for this code-less child error; existing true VIDEO/custom error behavior stays intact. No request, authorization, URL, codec/media processing, sandbox or billing change. This is error presentation/listener cleanup only. Retain actual failed-source Go Back and successful native/adaptive/seek tests. After runtime edit require full1085 application tests/lint/configured build/artifact plus final full browser suite, relevant contracts and docs/governance checks. Record the red→green evidence and remove DEBUG-quality instrumentation before integration.

Second-unit CI targets before edits: add root `test:quality-fixtures` running packaging contracts and include it in `.github/workflows/browser.yml`. The new local original media/manifests are committed so CI decodes identical reviewed bytes; CI does not re-encode fixtures or fetch external media.

### HLS CORS fatal-manifest recovery — sensitive review amendment before code

Native410/403 regressions are now green2/2, including actual visible error and Go Back. Media-HLS CORS remains red: browser captures actual rejected manifest requests and HLS logs fatal `networkError/manifestLoadError`, but `PlayerController` calls `hls.startLoad()` and returns. With no loaded manifest this does not reload the manifest or emit another error, so the UI remains waiting. This is distinct from the native SOURCE-event gap; do not hide it or make the test accept a spinner.

Extend targets to `app/alpha/js/core/player/playerController.js` and its existing `.browser.test.mjs`. When HLS reports a fatal manifest load/error timeout, propagate the existing fatal network error to the UI instead of ineffective stream recovery. Preserve current segment/level recovery, transient level404 handling, terminal HTTP behavior, URLs/headers and no paid/backend fallback. Add a mocked HLS regression at the real callback seam proving fatal manifest failure tears down/emits code2, does not call startLoad; add explicit segment recovery and terminal-HTTP regression checks. Verify the actual bundled CORS case red→green with no fictitious HTTP status from opaque failures.

This changes remote-fetch recovery behavior, so AGENTS.md's required human review applies. Prepare the complete implementation/tests/docs/draft PR and passing required checks first, then request owner review of the concrete scoped change before merge. Automated review is not human approval. Keep this second unit unmerged until that checkpoint; do not bypass protections. Update patch inventory, exact results and #10 state; no ticket closure yet.

### Review correction — signed URL in alternate-engine warning (2026-10-19)

Automated Standards review found that the newly activated fatal-manifest fallback reaches an inherited switching-engine warning which logs the complete URL. Before runtime edits, extend the existing signed-query regression to the actual HLS CORS/fallback branch, require the switching warning to be observed, and verify its serialized arguments exclude the synthetic secret. Reuse the existing safe endpoint formatter for that warning, as already used in terminal startup reporting. No network/retry policy change is needed for this privacy correction. Record the regression red→green, rerun focused browser checks, and retain required final CI/human review.

Full second-unit local run completed before the privacy review correction:27/27 browser journeys,0fail/0skip/0flaky,2.3minutes, recorded in docs/evidence/quality-2026-10-18.json (source3297e09). Original-quality native/adaptive/seek and failure/return assertions passed. Signed-fallback-log regression then reproduced the Standards finding and the switching warning was redacted. Required focused correction checks and exact-head CI remain pending; owner review still gates merge. Previous Spec sub-agent attempt hit an account usage limit and is incomplete, not approval.

### Review correction — subtitle error capture scope (2026-10-19)

Automated Spec review found capture=true also observes child TRACK errors. Before edits, add a bundled-player regression proving a non-bubbling TRACK error cannot mark the healthy source failed, create sourcesError or alter playback. Restrict onError at entry, before any state mutation, to the VIDEO target or its current direct child SOURCE. Existing VIDEO/custom events and SOURCE regression must still pass; unrelated/removed descendant events must be ignored. This is a scope correction to the presentation listener, not a subtitle transport or codec change. Owner review of the separate HLS recovery policy still applies.

The minimized bundled regression reproduced `Playback failed … mediaErrorCode:0` after a synthetic non-bubbling TRACK error while video time continued advancing. The guard now rejects unrelated descendants before any mutation. A first UI assertion incorrectly targeted an IMG rather than the actual CSS-mask control; corrected to assert its pause mask. Final focused command `npx playwright test tests/browser/quality.spec.mjs --project chromium --grep 'quality-1080 preserves|surfaces playback failure'` passed4/4 (8.8seconds), including continued playback/no false warning/unchanged pause control and all three real failure/return cases. Inert build and lint passed on pinned Node22. Both automated review follow-ups found no remaining actionable issues; they are not owner approval. Full final browser/application checks and the concrete PR checkpoint follow.

Final local correction verification on7eb8147:27/27 full browser cases (54.4seconds),1089/1089 full application tests (18.7seconds),0fail/skip/flaky; packaging4,HTTP5,preview1,docs/governance15,artifact12 and links/ledger/ancestry/whitespace pass. Exact commands and structured observations are in PLAYBACK_QUALITY_MATRIX.md and docs/evidence/quality-2026-10-19.json. Draft PR39 is the concrete review artifact; owner review of HLS recovery and required exact-head CI still gate integration. Ledger remains in_progress, with compatible ranking, full device/browser and sustained-quality verification outstanding. No deployment or issue closure.

Final documentation rerun initially failed inside the restricted sandbox when governance fixtures attempted temporary Git operations. The same required command in the authorized execution context passed15/15, plus links/ledger/ancestry/whitespace. No tests were weakened or skipped.

## Third integration unit — optional native-prediction source ordering (planned2026-10-19)

Owner reviewed PR39's concrete HLS recovery behavior and approved it in the coding workspace (“Yes this fix works.”). Approval was recorded on PR39; after the normal ready-for-review integrity check passed, protected merge completed at0cf88767cc24c56e81a51f786baab77b64009286. This supersedes the prior second-unit pending-owner annotations, not the remaining #10 gates. No deployment occurred. Continue exactly this unblocked issue on `m2/issue-10-source-ranking` from that merge.

Before code edits, inspected existing add-on/debrid group ordering, StreamScreen's cached filtered list and auto-play selector, source descriptor/native-probe seam, browser source cards, desktop filter/refresh styles and M2 plan. Preserve default configured add-on ordering and all source objects/IDs/URLs/quality; never use title/filename/quality labels as codec evidence.

Targets and API contract:

- New `app/alpha/js/core/streams/sourcePreference.js` plus `.test.mjs`: synchronous `orderSourcesByNativePrediction(streams, {videoElement, now})` returns a stable new array containing the same objects. Normalize untrusted descriptors through the existing module. Rank explicit direct-source MIME+codec native predictions first; unknown/incomplete/bare-MIME/adaptive evidence next; native-not-reported or declared header/expired-link cautions last. Probably/maybe are advisory, not overall compatibility or observed playback. HLS/DASH cannot be declared unsupported from a native file probe; all sources remain selectable. Preserve prior order within buckets, including original4K choices. Per-call MIME memoization; no persistent report cache, I/O, timers, destination/header changes, processing authorization, provider reordering preference or quality conversion.
- `app/alpha/js/ui/screens/stream/streamScreen.js`: browser-only opt-in native button (“Native predictions first”), aria-pressed state, native Enter/Space/Tab handling, focus retained after toggle. Default off on a fresh route; preserve only the existing in-memory back-navigation snapshot. Existing provider filter and refresh remain usable. Cache key includes the choice; refresh re-evaluates declarations/predictions. Auto-play selection and invalid-ID fallback explicitly retain original provider order, independent of the display preference. No new persistent setting/account data or implicit playback.
- `app/alpha/css/desktop.css` and existing default `res/values/strings.xml`: narrowly scoped incumbent theme/16px wrapping/44px control/focus indication; no redesign, new assets/fonts/dependency or icon system. Keep the order control on its own row so the source filter/refresh fit narrow viewports. Impeccable Operate guidance applies to the local extension; inherited visual world remains authoritative. One batched desktop/narrow screenshot round, at most one corrective round.
- `tests/fixtures/addons/server.mjs`, its contract tests, and new `tests/browser/source-preference.spec.mjs`: fixed local mixed fixture with native-supported explicit MIME, unknown false4K title, unsupported native MIME, HLS/DASH/required-header/expired hints. Actual bundled guest source list must preserve default order, reorder only after opt-in/keyboard activation, retain every source and restore original order when toggled off. Toggling must produce zero media/provider requests. Explicitly selecting the moved original fixture must still play unchanged bytes/dimensions/time. Add actual imported StreamScreen/selector seam coverage proving enabled auto-play still selects provider-first and forged descriptor/unknown cases stay bounded. Do not call live services or change auth/plugin sandbox/remote fetch behavior.
- `docs/SOURCE_CAPABILITIES.md`, quality matrix/FEATURE_SUPPORT, `UPSTREAM_SOURCES.md`, ledger/TRACKER: record actual current-unit evidence, PR39 acceptance/merge and remaining cross-browser/device/sustained-quality gates. #10 remains open; no broader playback certification.

Required verification: pinned Node22; focused source preference/related capability/ordering/auto-play unit tests; inert build/lint/artifact; fixture contract tests; focused actual browser source-preference scenarios then the complete browser suite after the final stable implementation; docs/governance/links/ledger/ancestry/whitespace; protected full application install/test/audit CI. Run full local application suite only if a failure or wider implementation change warrants it; display-only seam has focused tests plus mandatory remote full regression. No fixture re-encoding needed.

Threats/non-goals: untrusted descriptors/title injection cannot forge confirmed compatibility; full MIME+codec prediction is still unverified for audio/HDR/CORS/session, and header/expiry is a provider warning. No hiding/disable, autoplay change, auto downscale, extra media probe/download, token logs, backend/compute/paid commitments or deployment. This unit changes display ordering and native capability calls only, so the prior HLS owner gate is satisfied and no new remote-fetch policy is proposed. Reassess if scope changes. Rollback: protected revert restores provider-only display ordering, preserving prior player fixes, licenses/history and all source URLs. Use a scoped draft PR, automated two-axis review labelled honestly, exact-head CI and normal protected integration.

Third-unit focused results:19 capability/preference/ordering/auto-play unit tests and6 HTTP contracts passed; inert build/lint passed; actual bundled UI and imported-screen selector2/2 passed (6.0seconds). Corrected test-driver assumptions about upstream-generated canonical IDs, Router-first source-module entry and actual player Back. One batched desktop/narrow visual correction added header wrapping; confirmation shows44px control/16px text, no collision/overflow. Full browser run and automated two-axis review follow; no new fetch/engine policy.

Third-unit final local run on5f4d0b4 passed29/29 browser cases (54.2seconds),0fail/skip/flaky, with artifact12/docs-governance15 and links/ledger/ancestry/whitespace passing. Exact commands/limits are in SOURCE_CAPABILITIES.md and docs/evidence/source-order-2026-10-19.json. Both automated reviewers report no unresolved actionable findings; an expiry-cache concern was withdrawn after verifying existing render invalidation, so no speculative fix was added. PR40 holds the normal protected exact-head CI checkpoint. #10 stays open.

After protected integration, refresh only the previously owner-authorized dedicated static DEVELOPMENT preview with the exact reviewed main artifact, using existing scripts/Cloudflare Pages/Wrangler and cached authorization. Before any upload: use a clean isolated worktree, validate public-only config, rebuild/inventory source/notices/license/hashes, confirm the existing dedicated project and CLI flags, and retain prior deployment/artifact for rollback. Do not modify DNS/billing/domains, create Functions/backends/compute, deploy an unreviewed feature branch, expose test fixtures/harnesses or call live identity/media providers. Record exact source/deployment and run existing real HTTPS hash/header/source/Chromium guest/PWA verification; no live auth/playback certification follows. Add sanitized deployment evidence through a documentation PR afterward. Existing owner authorization for this development preview persists; this does not authorize production infrastructure.


## Integration and preview results — 2026-10-19

PR40 merged at8edec42 with exact-head four-context checks passing: remote1094 application/29 browser tests,0fail/skip. The normal exact-head merge guard rejected one mistyped full SHA before any merge; retry used the locally/remote-verified full0743314c3fac8da9f68002a0fcbd8fea2f0615ca. No force/bypass was used and no test was weakened. Automated reviews remain explicitly automated.

Executed the already-written bounded preview plan: clean detached reviewed8edec42 worktree; pinned locked installs (zero reported vulnerabilities), self-rebuilding stage/public-config validation, independent124-file hash/GPL/no-test/backend check; existing authorized Pages project confirmed; deployment96f977f4 succeeded; actual HTTPS ten-asset/header/source checks and Chromium guest/worker/reload/alias passed, no page errors. Sanitized receipt: docs/evidence/preview-2026-10-19.json; exact commands/limits/rollback in STATIC_PREVIEW.md. No new auth/account/compute/billing/domain infrastructure or credentials. Third-party browser traffic remained blocked; no live account/media claim. #10 remains in_progress for named browser/device and sustained-quality gates.

## Bounded browser MVP journey — plan before test changes (2026-10-19)

Owner correction prioritizes a usable browser MVP over additional implementation units. Verify the current bundled application unchanged, using the existing CC0 `procedural-vp8-opus.webm` and original English VTT over the existing two loopback HTTP servers. Do not encode or download new media, use accounts, deploy, change authentication/remote-fetch policy, or claim high-bitrate/HDR/device support.

Target `tests/browser/mvp-playback.spec.mjs`: one user-facing guest journey starting with an empty add-on list, install the legal HTTP add-on through Settings, browse its catalog, save the item through detail UI, select the original source, observe decoded dimensions and progressing time, operate pause/seek/resume through actual player controls, select the supplied subtitle via UI and observe its cue where supported, inspect the real audio menu honestly, return to browsing, reload and verify the saved item/add-on survive. A second bounded failure journey may reuse the existing expired-source case instead of duplicating it. Required failure/CORS evidence comes from existing focused add-on and quality tests. Do not substitute direct media API writes for user control evidence. If a runtime bug blocks this sequence, record a minimal reproducer and inform the issue-owning parent before proposing runtime changes; do not loosen assertions to call failure success.

API/fixture contract: existing local add-on manifest/catalog/meta/stream/subtitles and byte-range media endpoints only; no fixture server contract or production code change anticipated. Provider and application remain distinct origins so real browser CORS is exercised. Allow only the application and local provider origins; block all external traffic. Existing CC0 provenance/hashes remain unchanged. Guest data is disposable browser-context storage, not real service records.

Run pinned Node22 `npx playwright test tests/browser/mvp-playback.spec.mjs --project=chromium`, then the relevant existing add-on/quality failure cases once after final stable test edits. Record exact commands, results, actual engine/version/OS, build artifact hash and source revision in `docs/evidence/browser-mvp-playback-2026-10-19.md`. Only Chromium headless is presently installed; actual Chrome/Edge, Firefox, Safari, real mobile, audible output and multi-audio switching are NOT TESTED unless independently observed. No full inherited application rerun for test-only edits; normal protected CI remains required at integration. Rollback removes this scoped test/evidence addition; runtime, history, licensing and account state are unaffected.

### Same-host legal demo for controlled hosted acceptance — before code

The root agent owns a narrowly scoped preview artifact extension in `scripts/prepare-static-preview.mjs`, a static demo helper/test, `docs/MVP_ACCEPTANCE.md` and preview documentation. Include optional static `/demo/manifest.json`, catalog/meta/stream/subtitles JSON, the existing 41KB CC0 WebM/VTT and attribution in the dedicated development preview artifact. Use the deployment's own public origin for static resource URLs. This is an explicitly installed demo add-on, not an automatic account/add-on change. No new service, proxy, remote origin, identity behavior, runtime media engine or paid commitment. Legal fixture bytes/provenance stay unchanged; prevent accidental fixture-control/harness/backend/private-config inclusion. Verify helper/stager contracts, artifact inventory/public-config/license/hashes, then the local candidate's real bundled guest install→catalog→source→playback→save/reload flow. Prepare exact commit/build/config/rollback evidence and request explicit owner approval before public upload. Rollback restores the previous reviewed Pages artifact; no DNS/billing/infrastructure change. Hosted evidence remains NOT TESTED until the specifically approved exact candidate is uploaded and exercised over HTTPS.

### Confirmed MVP navigation blocker — amendment before runtime changes

The combined journey passes install/catalog/save/decode, actual pause/seek/resume and native subtitle active-cue selection, but the next source Back does not leave Stream. A fresh-versus-return comparison with paused legal media passes before any panel Escape. The combined case closes subtitle/audio panels with Escape: `FocusEngine.handleBack` consumes the panel dismissal and sets a700ms global popstate suppression. The immediately following explicit player Back performs a real History API traversal which is swallowed. Player fallback consequently replaces Player index6 with a new Stream index6 (instead of revealing original Stream5), adding1500ms suppression/ignore. The next source Back is swallowed too. Existing button handler remains bound; no network/auth root cause. Evidence: `/tmp/nuvioweb-mvp-navigation-comparison.json` and `/tmp/nuvioweb-mvp-navigation-diagnosis.json`, sanitized route/index attachments.

Scoped targets: `app/alpha/js/ui/navigation/router.js` and its existing `router.browser.test.mjs`, plus `tests/browser/mvp-playback.spec.mjs`. An explicit app-requested History API Back must supersede stale duplicate-event suppression/ignore guards immediately before issuing `history.back()` in the existing proven-parent and ordinary Back paths. Preserve suppression for unsolicited duplicate/native popstates, existing provenance checks, route consumption, layering, fallback, browser history ownership and all media/auth/fetch behavior. Add focused regression tests using the real Router seam with suppression/ignore pre-set; keep the combined bundled Escape→player Back→source Back user regression. No arbitrary wait or second click may hide the failure.

Run focused Router/focus-engine tests, configured build/lint/artifact checks, then the focused actual guest journey and fresh-versus-return regression. Parent runs broader protected CI/inventory and records integration. Threats: stale/double popstate and incorrect parent traversal; prove existing native suppression tests still pass and require provenance checks unchanged. No service, account mutation, backend, sandbox, payment, new dependency or deployment. Rollback is a protected revert of these explicit navigation changes, retaining prior session/library work.

Integration detail: root `package.json`'s existing `test:preview` command includes the new static-demo contract test, so required browser CI executes resource/CC0 checks before clean staging. No new workflow or dependency. The old Router settlement controls are retained with suppression/ignore applied after dispatch, distinguishing a newly discarded event from stale overlay flags that an explicit Back now supersedes. Initial focused real-module2/2 regression cases fail as predicted before runtime; after six added runtime lines all66 Router tests pass. Full guest journey2/2 passes in9.0s, including actual subtitle cue and save/reload; no arbitrary sleep/second Back was used to hide the symptom. Broader final regression and review remain required.


Final current-unit local verification:70/70 Router/focus cases pass (622ms); `npm test --prefix app/alpha`1173/1173pass,0skip (21.387s); `npx playwright test`42/42pass,0skip (1.7min), including the complete guest journey and retained source403/410/CORS, account fixtures and real PWA replacement. Inert build1f6602975d2f/worker4cf247398dd9,12-asset check and lint pass. `node --test scripts/stage-legal-demo.test.mjs scripts/prepare-static-preview.test.mjs`3/3pass (169ms), original media hash unchanged. The exact Router/focus command is `node --test app/alpha/js/ui/navigation/router.browser.test.mjs app/alpha/js/ui/navigation/focusEngine.browser.test.mjs`; an earlier command's wrong focus directory covered Router only (66), not the focus seam. No failed/sandboxed result is counted as a pass.

Additional root target `scripts/verify-mvp-preview.mjs` is the prepared read-only-host/disposable-guest post-upload driver, fixed to the dedicated HTTPS preview and source SHA; it drives actual UI installation/playback/subtitle/back/save/reload and blocks third parties. Syntax check passes; actual hosted invocation awaits exact owner upload approval. It reads no account file, changes only ephemeral guest browser storage, does not auto-install for other users and introduces no runtime fetch behavior. Final candidate must include navigation+demo rather than uploading the superseded25ce335 preflight. No public upload has occurred in this unit. Docs/governance/provenance/ancestry and two-axis automated review precede protected integration; owner-sensitive auth/fetch changes are absent from this navigation/static-content scope.


MVP PR49 at9736b7d: automated Standards/Spec review found the same stale subtitle acceptance sentence (P2 Standards/P3 Spec), no other actionable runtime/static-demo findings. Corrected it to local PASS after Router correction, with hosted/named-browser NOT TESTED. These are automated reviews, not independent approval. Final docs/governance/static-preview18/18pass (284ms), links/ledger/ancestry/whitespace pass. Clean public-only staging9736b7d succeeds, assetd7e557436091/worker20625c5468ac; all134 inventory hashes independently match, including10 optional static demo files, original CC0/GPL hashes. No test-control endpoints, fixtures directories, backend, private config or upload. A later docs-only correction does not change the tested runtime; final-head CI/review and then exact merged-main candidate preparation remain required.

Protected CI correction: source-equivalent heads9736b7d/fbf2ec3/0cbb41f all fail the complete guest source-Back assertion on Linux x64 Chromium (41/42pass on final0cbb41f); local ARM64 focused/full runs passed. Keep PR49 unmerged; six-line fix is not sufficient cross-environment evidence. New bounded diagnosis targets only test-side route/history entry events, avoiding account/network instrumentation. Ranked predictions: (1) early explicit second Back races asynchronous suspended-route restoration, so history target changes while visual restoration/settlement is incomplete; (2) panel/back fallback re-arms guards after explicit dispatch, visible as a swallowed target with replaced history; (3) a duplicate Stream entry remains despite healthy routing, visible as two sequential Stream targets. Capture sanitized route/index sequence before/after the same real clicks and run a bounded repeated local fixture replay. Do not weaken the full-journey assertion, add arbitrary waits/second clicks, rerun equivalent live mutations or merge failing CI. Amend the smallest actual Router seam only once the sequence distinguishes the cause; repeat relevant tests/review after any runtime correction.


The five-run bounded replay reproduced4fail/1pass locally (1.2min), so the prior single42-case pass was insufficient. One temporary fixed-category Router trace then reproduced: no suppression/ignore at the Player→Stream popstate, but current Player consumes it (overlay/controls), settlementfalse triggers fallback Stream at index6 instead of original Stream5; next Back lands on Stream5. This falsifies restoration/handler guesses and proves a second cause beyond stale suppression. Remove all DEBUG probes before final build. No source/account/URL values were logged.

Amend only existing Router popstate consume decision: an outstanding explicit `backToPreviousNuvioRoute` with exact expected target route AND history index is already a proven parent traversal (the caller stopped playback), so skip screen-local consumption for that matching event. Do not skip unsolicited browser Back, unmatched/malformed targets or provenance checks. No new global/timing flag, dependency, network or player-engine change. Add actual-player-seam controls: explicit traversal with dismissable audio/controls reaches original Stream then detail; ordinary browser Back still dismisses the overlay and stays on Player. Run red before fix, then Router/focus, five complete local repeats, full application/browser/build/lint, review and final-head CI. Earlier reviewed six-line version/CI failure remains historical evidence; no passing or merge claim for that head.


Final consumption correction results so far: new actual-player2cases1pass/1fail before fix (561ms); after exact target bypass72/72 Router/focus pass. Original complete guest loop passes5/5 (34.6s), no extra waits/clicks. Tightened registered-target guard and original-parent browser history assertion then rebuilt773710e26262/workerb7f5924e6152,12-asset check pass;72/72focus (473ms),1175/1175application (23.631s),18/18governance/static-preview (581ms), lint pass. Automated Standards/Spec follow-up each0 actionable findings, not independent approval. Full final browser and final-head protected CI remain required. All earlier source-equivalent CI failures and bounded4/5 failure receipt remain documented; no blind rerun of their unchanged head.


Final full corrected-source `npx playwright test`42/42pass,0skip (1.7min), including the strengthened original Stream history entry assertion. Final source1175application/72Router-focus/18governance, build/assets/lint pass. Both automated reviewers inspected the CI-driven matching-parent change and found0 actionable findings; no independent human approval. Publish this changed runtime and await new protected CI; do not rerun/merge the failed source-equivalent0cbb41f head. Public preview remains8edec42.

## Governance supersession — development-preview refresh authority (2026-10-19)

The owner's standing autonomous delegation now recorded in [AGENTS.md](../../../AGENTS.md) supersedes this plan's earlier "request exact owner approval before public upload" checkpoint for the **existing dedicated development-only** `nuvioweb-preview` project only. A refresh still requires every pre-upload condition: exact source commit, passing required CI, clean reviewed rebuild, public-only configuration, source attribution and asset inventory, no private/test/control files, recorded rollback deployment, upload only to that project, staged-source equality, and hosted smoke/MVP verification with honest PASS/FAIL/NOT TESTED recording. Public production launch, custom domains, new billable infrastructure, backends, compute or payment remain owner-gated. At the time of this note the refresh is blocked by expired Cloudflare OAuth requiring interactive owner reauthentication; no upload occurred.

## Preview candidate revalidation and upload blocker (2026-10-19)

Current main `80f739cf18eef5dca6d9e0fa54899357032f88bd` (governance PR #50; runtime source identical to `a1629fe`) was staged cleanly with `npm run preview:stage`: asset `53a3ebbd44cc`, worker `nuvio-app-shell-0.1.5-134fd4f07f67`, 134 independently verified inventory hashes, GPL/notices matched, 10 optional demo files, no forbidden paths. A loopback server modelling the checked-in host rules passed 10 hash/header checks, 404 checks, demo resource reachability and Chromium guest navigation/reload/alias with zero page errors and all third-party origins blocked. Receipt: `docs/evidence/preview-candidate-2026-10-19.json`.

Cloudflare OAuth expired at `2026-10-19T10:05:01Z` and cannot refresh non-interactively; `wrangler pages project list --json` requires `CLOUDFLARE_API_TOKEN`. No upload occurred and no hosted cell of the MVP gate changed. Hosted playback and named Chrome/Edge/Firefox/Safari evidence therefore remain NOT TESTED; #10 stays open. Builds are not bit-reproducible because the inherited bundle embeds a build timestamp, so each rebuild yields new asset/worker ids and upload integrity must be checked against that build's own staged inventory.

## Cross-engine unit: stable add-on failure messages (planned 2026-10-19)

**Finding.** Running the existing browser suite in Playwright Firefox 157 revealed that the Settings add-on install form shows the browser's raw fetch text: Chromium throws `Failed to fetch`, Firefox throws `NetworkError when attempting to fetch resource.`. Parse/shape failures likewise surface engine-specific internals. The UI is safe (escaped, no injected markup) but not explainable or stable across browsers, and the existing browser assertion only matches Chromium text. Real Chrome for Testing 155 passes the same case as Chromium.

**Targets.**
1. `app/alpha/js/data/repository/addonRepository.js`: add one exported pure classifier and apply it only to `fetchAddon` failures that carry no HTTP status code (network/CORS, JSON parse, manifest-shape). HTTP errors that carry a provider status keep the provider's status text.
2. New `app/alpha/js/data/repository/addonRepository.test.mjs`: deterministic unit cases for Chromium, Firefox and Safari network phrasings, malformed JSON, manifest-shape TypeErrors, a provider HTTP error that must be preserved, and an unknown message that must not be swallowed.
3. `tests/browser/addons.spec.mjs`: replace the Chromium-only `/Failed to fetch/i` expectation with the stable user-facing message in the real install form.

**Contract.** Classification is pure, bounded, case-insensitive and returns fixed strings: network/CORS → a reachability message naming URL/CORS/connection; invalid JSON → an invalid-JSON message; manifest shape → an invalid-manifest message. No URL, header, token, response body or raw engine exception text is rendered. No request, retry, destination, auth, timeout, cache-key or install-policy change.

**Red evidence before runtime edits.** The new unit file imports the classifier, which does not exist yet, so the focused command must fail. Then implement and rerun.

**Verification.** Focused `node --test app/alpha/js/data/repository/addonRepository.test.mjs`; complete `npm test --prefix app/alpha`; lint; inert build/12-asset check; focused add-on browser cases and then the complete Chromium suite; also run the same add-on case in Playwright Firefox 157 and Chrome for Testing 155 to prove engine-independent text. Record engine versions and the fact that Playwright Firefox is not branded-Firefox certification and Chrome for Testing is not a user-profile Chrome installation.

**Threats.** Over-broad matching could mask a real provider error; therefore classification applies only when `code` is absent and HTTP statusText is always preserved. No secrets, no network, no deployment. **Rollback:** protected revert restores raw messages; tests revert with it.

### Cross-engine failure-normalization results (source `aff4f062`)

Red first: the new `addonFailure.test.mjs` failed because the classifier module did not exist. After implementing `js/data/remote/addonFailure.js` and wiring it into `addonRepository.fetchAddon` (transport failures and `mapManifest` shape throws, provider HTTP status text preserved), the focused unit suite passed6/6 and the real Settings case passed in Chromium, Chrome for Testing and Firefox.

Verification at `aff4f062d96c8bbcce57ffa042fb25fe98932a26` (inert build, 12 assets, no privileged fields):

- `npm test --prefix app/alpha` —1181/1181 pass,0 skipped,15.7s.
- `npm run lint --prefix app/alpha` — pass.
- `npx playwright test` (Chromium) —42/42 pass,0 skipped.
- Chrome for Testing155.0.8059.84 (linux-arm64, workspace HOME) —40/40 non-PWA plus2/2 PWA pass.
- Playwright Firefox157.0 (x86_64 build under this ARM64 host) —33/40 pass. The7 differences are capability/engine-event driven, not product regressions: five H.264 quality fixtures cannot decode because this Firefox build reports no H.264, two source-ordering tests hardcode Chromium's native-prediction order, and the HLS-CORS case's overlay/engine-switch assertions passed while only a Chromium-specific `requestfailed` observation differed. The complete guest journey (VP8/Opus playback, controls, subtitle, Back, save/reload) passed in Firefox.

Limits: no branded Edge/Safari/physical mobile, no Firefox PWA run, no hosted/live-service claim. Chrome for Testing is a real Chrome binary but not a user-profile installation; Playwright Firefox is not branded-Firefox certification. Evidence: `docs/evidence/cross-engine-2026-10-19.json`. Follow-up unit: make codec-dependent and prediction-order browser tests capability-aware while keeping Chromium assertions strict.

## Cross-engine test hardening: capability-aware assertions (planned 2026-10-19, after PR52)

**Finding.** At `aff4f062`, Playwright Firefox157 passed33/40 browser cases. The7 differences are not runtime regressions: this Firefox build reports no H.264, so five H.264 quality fixtures cannot decode (the app does show `Playback Error` with a nonempty reason), two source-ordering tests hardcode Chromium's native-prediction order, and one HLS-CORS case passes every overlay/engine-switch assertion but differs on a Chromium-specific `requestfailed` observation. Hardcoding one engine's codec set makes the suite lie in both directions: it reports false failures on capable engines with a different codec set, and it never asserts the required explicit-error path when a codec is genuinely unsupported.

**Targets (test-only; no runtime change expected).**
- `tests/browser/quality.spec.mjs`: probe `canPlayType` for the fixture codec in the page. Supported → keep the existing strict dimensions/seek assertions unchanged. Unsupported → require the visible startup-error overlay with `Playback Error`, nonempty message and a working Go Back; do not assert decoding. HLS-CORS: accept either a failed request or a failed response for the same denied manifest path while keeping overlay, engine-switch and no-secret-log assertions.
- `tests/browser/source-preference.spec.mjs`: derive the expected preferred order from the measured H.264 capability (two documented variants), keep all eight sources, toggle-restore, focus and no-extra-request assertions, and for the 4K playback step use the same supported/unsupported split.

**Non-goals.** No application runtime change, no new media fixture or codec, no CI workflow change, no hosted/named-brand claim.

**Verification.** Focused Firefox quality/source-ordering cases red before, green after; then full Playwright Firefox (40/40 non-PWA), Chromium 42/42 and Chrome for Testing155 42/42 at the same commit. Record exact engines and retained limits. Chromium assertions are not relaxed: its `canPlayType` is nonempty, so the strict branch still runs there.

**Threats.** A capability probe could hide a real Chromium decode regression; mitigated because the unsupported branch requires an explicit user-visible error and Chromium never takes it. Probe only reads `canPlayType`, performs no I/O and changes no product behavior. **Rollback:** protected revert restores the Chromium-only assertions.

### Capability-aware hardening results (source `11ddfa3`)

The 7 Firefox differences from the previous unit were reproduced red, then resolved without relaxing Chromium: `quality.spec.mjs` now probes the engine's H.264 support and requires either strict decoding or an explicit `Playback Error` overlay with a working return; HLS-CORS accepts either a failed request or a failed response for the same denied manifest and either the switching-engine warning or a classified `mediaErrorCode 2`, retaining redaction checks; `source-preference.spec.mjs` derives the expected prediction order from measured codec support and still requires the 4K source to be selectable and to fail explicitly when undecodable.

Executed at `11ddfa3af9081101309c25425dea2ecc8042ecb7` with the inert build:

- Playwright Firefox157 (x86_64 under this ARM64 host) —40/40 non-PWA pass,0 failed/skipped.
- Chromium156.0.8078.4 —42/42 pass (strict branch unchanged).
- Chrome for Testing155.0.8059.84 —40/40 non-PWA plus2/2 PWA pass.
- Focused Firefox quality/source-preference9/9 and Chromium9/9 pass.

Limits: no branded Edge (no ARM64 Linux build or x64 device), Safari, iOS or physical mobile; Chrome for Testing is not a user-profile installation; Playwright Firefox is not branded-Firefox certification; Firefox PWA not run; no hosted/live-service/audible-audio/4K60/HDR claim. Evidence: `docs/evidence/cross-engine-capability-2026-10-19.json`. #10 stays open for hosted, branded-device and audio/quality gates.

## Hosted guest journey result (2026-10-19)

Current main `1f67867` was deployed to the dedicated development preview as `b48de821-9034-49cc-8e1f-ab5c50e7fa3a` after134/134 inventory verification and local preflight. Actual HTTPS verification passed artifact/header/source/worker checks, and the complete hosted guest journey passed: legal same-host demo install → catalog → VP8/Opus640×360 playback → pause/seek/resume → active subtitle cue → Back → save → reload,0 uncaught errors, third parties blocked. Receipt: `docs/evidence/preview-refresh-2026-10-19.json`.

This closes the hosted guest-media portion of #10's open gate, not the issue: branded Chrome/Edge/Safari, physical mobile, multitrack/audible audio, hosted external-provider CORS, 4K60/HDR and sustained-quality verification remain NOT TESTED, and real-account isolation belongs to #7.

## Owner-directed device scope — 2026-10-19

The owner clarified the browser/device requirement: Microsoft Edge is Chromium-based, so Chromium/Chrome engine coverage is accepted as sufficient for Edge; an exhaustive per-platform matrix is **not** a closure requirement. Users can report platform-specific issues later. This is an owner scope decision, not a measured branded-Edge pass: documentation must keep the distinction between tested Chromium/Chrome evidence and inferred Edge parity.

The owner can run manual spot checks on a Windows PC (Microsoft Edge) and an iPhone 17 Pro running iOS 27. Exact steps and the report template are in [DEVICE_VERIFICATION.md](../../DEVICE_VERIFICATION.md). iPhone/Safari is WebKit, so its observations are evidence for Safari/iOS behavior only; they do not replace Chromium tests.

Consequences for #10:

- Baseline engine coverage: Chromium156 and Chrome for Testing155 pass; Playwright Firefox157 passes its scoped suite. Branded Edge/Safari/mobile are **optional spot checks**, not required gates.
- Audible multitrack output and HDR rendering still require a real device observation before those specific claims are made; the iPhone is suitable for them, but a recorded observation is required.
- Hosted external-provider CORS still needs a legal external origin; same-host demo playback does not establish it.
- No claim changes without observed device results; the manual checklist results will be recorded in `docs/evidence/` with browser/OS versions and limits.


## Manual device results and next capability unit — 2026-10-19

Windows 11 25H2 + Edge155.0.4283.62/Chromium155.0.8059.85: owner completed the guest checklist (demo add-on install, catalog, VP8/Opus playback with audible sound, pause/seek, English subtitle, Back, save/reload) with all steps passing; account isolation was not attempted. iPhone 17 Pro/iOS27 Safari: the VP8/Opus demo played, but native 4K MKV/HEVC/Dolby Vision/HDR sources failed. One surfaced `startup-media-error` with media code4; the other surfaced `startup-stall` despite an unsupported Matroska/HEVC configuration. Multitrack audio was not testable (no multi-audio source); HDR rendering was not observed. Evidence: [device verification](../../evidence/device-verification-2026-10-19.md).

**Next unit — honest unsupported-container/codec classification (pre-code plan).**

Targets: the player startup classifier currently producing `startup-media-error`/`startup-stall` (`app/alpha/js/ui/screens/player/playerScreen.js`), existing source descriptor/capability helpers, its browser/unit tests and `PLAYBACK_QUALITY_MATRIX.md`. No transcoding, demuxer, proxy or new codec.

Behavior: when startup fails and the source descriptor or a definitive `canPlayType` check establishes that the container/codec/audio layout is unsupported on this engine (for example Matroska or HEVC/Dolby Vision on Safari without support), show a specific unsupported-container/codec reason and a clear “choose another source or go back” action instead of waiting for a generic stall. Preserve transient network/startup retry behavior; never relabel a network failure or an unknown source as unsupported. Keep clear unsupported messaging for encrypted/restricted sources.

Tests: synthetic source descriptors for MKV/HEVC/DV/DDP and supported H.264/HLS controls; simulate media error4/stall events in the bundled player fixture; assert reason, message and return path; no real provider media or live credentials. Manual iPhone re-check after integration on a supported source and, if available, an HDR/HLS source.

Non-goals: making Safari play MKV/HEVC/DV, converting media, claiming HDR or multitrack support, or changing source selection ordering. Rollback: protected revert; no remote state. Verification: focused player/capability tests, full application/browser suites, lint/build/docs checks, and a recorded manual iPhone observation.
