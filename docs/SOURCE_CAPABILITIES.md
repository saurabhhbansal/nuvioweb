# Source declarations and browser predictions — issue #10

This is the first implementation unit for [#10](https://github.com/saurabhhbansal/nuvioweb/issues/10), following verified [legal fixture journeys](ADDON_INTEROPERABILITY.md). The ticket remains open. No realistic4K/HDR/adaptive/cross-browser claim follows from this unit. [Plan and remaining gates](plans/issues/issue-10.md).

## Current owner engine scope — 2026-10-20

The [engine capability matrix](ENGINE_CAPABILITY_MATRIX.md) supersedes historical brand-by-brand remaining gates below: test Chromium once (Chrome/Edge/Brave/Opera), WebKit once (Safari), Gecko once (Firefox). It records actual native4K codec/seek/frame evidence separately from API predictions, bundled adaptive journeys and physical output. Strict sustained4K60 and HDR display output remain uncertified. [Feasibility research](research/issue10-playback-feasibility-2026-10-20.md) separates best-effort callback sampling from composition counters and actual output; the former alone failed each historical60fps predicate. Conditional upstream HEVC/HDR support is not proof of this installed binary/backend or physical display. No broader closure, preview refresh or paid fallback follows.

Contradictory MIME codec versus explicit video codec now produces unknown rather than mutually inconsistent native/MediaCapabilities answers. The shared guard runs before ordering/card MIME caches, preventing clean/conflicting same-MIME cross-contamination. It also prevents unsupported-codec/container blame from contradictory declarations while retaining header/network precedence. No guessed codec aliases, source hiding, source-byte/URL change, fetch/retry behavior or automatic media processing is introduced. The existing original640×360 source remains selectable and actually plays in the bundled regression.

## Contract

`core/streams/sourceCapabilities.js` produces a version1 descriptor from explicit optional provider fields: `mimeType`, `video.{codec,width,height,bitrate,framerate,hdr}`, `audioTracks`, `subtitles`, ISO `expiresAt` and existing `behaviorHints.proxyHeaders.request`. These extensions are optional internal projection inputs, not mandatory Stremio fields. Missing/invalid metadata is null; empty track lists mean no track metadata was supplied, not proof that media has no tracks. Only finite positive numeric declarations are accepted. Text is bounded, codec/language/format tokens restricted, arrays capped at32 and header-count output capped at256. Provider declarations remain unverified.

The descriptor records content type/container, video/audio/subtitle declarations, header count and declared expiry; it contains no media/provider URL, header name/value, raw title or subtitle query. URL scheme/path is inspected only for a transport hint; `.m3u8` does not prove a codec or working HLS. Filename/title/quality strings never populate codec, resolution or HDR evidence. Existing `4k` labels are now explicitly introduced as provider labels in browser cards.

Actual provider mapping attaches the descriptor; actual flattening carries it to the shared browser source card. Cards show unknown metadata, unverified provider declarations and a native-type browser prediction, with16px wrapping text in browser layouts. Header/expired-link declarations produce advisory guidance. They do not fetch, authorize, block, reorder, replace or downscale a source. Existing engine choice, source URLs, autoplay, transport/session and season-download actions remain unchanged.

## Browser evidence semantics

[WHATWG canPlayType](https://html.spec.whatwg.org/multipage/media.html) supplies an empty/maybe/probably type prediction. The UI labels positive results as predictions and negative native results as “another engine may work”; native rejection must not conceal an HLS.js/DASH.js option. No source GET/HEAD or new network destination is introduced by this probe.

The optional async report calls [W3C MediaCapabilities decodingInfo](https://www.w3.org/TR/media-capabilities/) only when explicit video MIME/codec/dimensions/bitrate/framerate are present. It reports video-only supported/smooth/powerEfficient predictions, with audio/HDR/display output explicitly unverified. It does not invent missing configuration, request DRM access or promise an actual playback result. Missing APIs/configuration, rejection or a bounded750ms default timeout produce unknown/unavailable. No report, URL or fingerprint is persisted or logged. This async report is exposed at the module seam and tested; the current card displays the synchronous native prediction only.

## Executed evidence and limitations

- Focused new descriptor tests initially5/5 passed: titles cannot invent metadata, secrets are absent, invalid declarations remain unknown, native outcomes remain distinct, exact declared3840x2160 dimensions survive a synthetic decoding report and unavailable/rejected/hanging probes are bounded. That4K case is a synthetic contract assertion, not observed4K playback.
- Initial four actual Chromium capability/browser journeys passed4/4 in22.7seconds: unsupported MIME reports remain advisory, unknown title-only4K metadata remains unknown, explicit original fixture metadata survives repository→flatten→card, actual MediaCapabilities returns a video prediction, and all three bundled journeys still play the original640x360 file with advancing time/no media error. Provider observations contain no Authorization/apikey.
- Four local HTTP fixture contracts passed4/4 with zero skips, including explicit declarations versus title-only claims and unchanged original media URL. Original CC0 media/hash remains unchanged.
- First lint run caught a control-character-regex rule violation. Replaced the regex with explicit character-code validation; existing lint rules remain intact. Subsequent configured build/lint passed. Full application suite passed1084/1084 (1079 inherited plus5 new), zero skips,49.2seconds before final reporting/format-only refinements. Final full browser/build/check results will be recorded before integration.

Remaining #10 work: compatible-source ranking with honest unknown handling; legal realistic1080p/4K/HLS/DASH playback, seek and expiry cases; named Chrome/Edge/Firefox/Safari and hardware/mobile evidence. Actual audio/subtitle switching, HDR output, public HTTPS/PNA/provider failures, live auth/cloud sync and paid/own compute are not established. One VP8 fixture and a browser prediction do not establish codec/device compatibility. Current public preview remains its separately recorded #6 revision; this branch is not deployed.

No new dependency, backend, financial commitment or media-processing/auth/remote-fetch policy change. The upstream pin/history/GPL/license files are preserved; local patch inventory is in [provenance](../UPSTREAM_SOURCES.md). Rollback is a protected revert of the descriptor/projection/card changes with no account/schema/data migration.

## Review correction and final verification checkpoint

Automated Standards review found a real gap: raw plugin results could supply an internal-looking descriptor, bypassing HTTP mapping. Flattening, direct card rendering and probe entry points now revalidate those declarations through the same bounded/token/redaction rules; no plugin execution/isolation or transport behavior changed. A dedicated forged-descriptor unit/browser regression covers URL-bearing codec/MIME, oversized HDR, excess tracks and direct-vs-flattened rendering. Metadata cannot grant support or processing authority. Automated review is not independent human approval.

An initial full browser run was18pass/1fail; GitHub draft CI reproduced the same failure. The header/expiry test incorrectly counted the fixture harness's existing head script when checking injected card markup. Its assertion now targets rendered body content, retaining no-img/script and no injected-marker assertions; no application escaping rule was weakened. Dedicated visible header/expiry/redaction checks and a forged-descriptor case are included in the forthcoming20-journey final run. Desktop1280x800 and narrow390x844 source-card screenshots were inspected once: evidence wraps at16px with no horizontal text overflow. Inherited icon-font fallback remains visible because external font requests are blocked.

After the metadata-boundary fix, `npm test` passed1085/1085 (1079 inherited plus6 new), zero failures/skips,47.3seconds; focused6/6 passed. Configured build/lint passed. Final complete browser and protected exact-head CI results remain required before integration. #10 remains open/in_progress after this first unit.

Final first-unit local verification: `npm run test:browser` **20/20 passed**,0fail/0skip,1.6minutes (eight add-on, six capability, four shell and two real-worker journeys). This includes actual header/expiry guidance, no rendered injection/secret URL, forged raw-provider descriptor normalization, original fixture playback, desktop/narrow16px wrapping and real MediaCapabilities predictions. `NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build`, `npm run lint`, `node scripts/check-alpha-build.mjs` and `node --test scripts/check-docs.test.mjs scripts/governance.test.mjs` passed (12 artifact checks,15 tests,0skips). Final runtime review follow-ups report zero actionable Standards and Spec findings; explicitly automated. All four protected contexts passed on644fe92; final documentation-head checks are required again before merge. These receipts validate this unit, not the remaining #10 milestone or a production release.

The second #10 unit records original1080p/4K and HLS/DASH/failure evidence in the [quality matrix](PLAYBACK_QUALITY_MATRIX.md); it remains unmerged pending required checks and human review of fatal manifest recovery. First-unit unknown/descriptor evidence remains unchanged.

## Optional native-prediction ordering — third unit, 2026-10-19

The owner approved PR39's explained HLS recovery behavior and it merged through protected checks at0cf8876; its player fixes and dated quality evidence are now integrated. This supersedes its historical pending-review notes. No public preview upload followed.

The next unit adds `orderSourcesByNativePrediction(streams, {videoElement, now})` and a browser-only **Native predictions first** toggle. It is off on fresh entry and restored only in the existing in-memory back snapshot. Default add-on/debrid/plugin order remains unchanged. Opt-in order is stable within three groups:

1. Direct sources with explicit video MIME+codec strings for which canPlayType reports probably/maybe, without a declared header/expiry caution.
2. Unknown evidence, including missing/bare-MIME/invalid/API-unavailable declarations and HLS/DASH whose engine support cannot be established by a native file probe.
3. Native support not reported, declared required headers, or a provider-declared expired link. These are cautions, not proof that no engine can play a source.

Titles, filenames, quality/HDR claims and resolution never create codec support or break ties. The same objects, IDs, URLs, original4K options and unknown sources remain selectable. Normalize descriptors again; raw header/expiry/transport evidence also prevents a supplied descriptor from hiding a caution or masquerading an adaptive URL as a direct file. MIME predictions are memoized only during a call. Expiry is re-evaluated on render/refresh, not a background timer that silently moves cards.

Changing the display order performs no provider/media requests and does not change native/HLS/DASH engine policy. Automatic selection and invalid-ID fallback explicitly use provider order even when the display preference is on. Choosing a source still plays that original source. No new persistent settings, login, backend, compute, processing, fees or deployment.

Local verification so far: focused capability/preference/ordering/auto-play unit tests19/19, HTTP fixture contracts6/6, actual browser UI/selector scenarios2/2, configured inert build/lint pass. The bundled test proves default/toggled order, every original canonical source ID retained, Enter/Space/Tab and focus, no toggle requests, actual original3840x2160 playback and retained preference on player Back. The imported screen/real selector test proves enabled FIRST_STREAM auto-play chooses provider-first despite a differently ranked display. All third-party traffic blocked. Initial test-driver assumptions about upstream-generated IDs, source-module entry order and the player's Sources panel were corrected; no application behavior or assertion was weakened to accept failure. One desktop/narrow visual round found a header row collision; one corrective round confirms separate44px/16px control, wrapping and no new horizontal overflow. Blocked external icon fonts still show inherited fallback text, not a newly certified icon/font release.

Final complete local browser run on5f4d0b4 passed29/29 (54.2seconds),0fail/skip/flaky; [structured receipt](evidence/source-order-2026-10-19.json). Automated Standards/Spec reviews have zero unresolved actionable findings; an initial expiry-cache concern was withdrawn after confirming inherited render invalidation. Artifact12 and docs/governance15/15 plus links/ledger/ancestry/whitespace pass. [PR40](https://github.com/saurabhhbansal/nuvioweb/pull/40) remains unmerged pending required exact-head CI. Named Chrome/Edge/Firefox/Safari/device, sustained high-bitrate/4K60/HDR and broader failure evidence remain outstanding; #10 is not complete. Prediction ordering is advisory, not automatic quality selection or compatibility certification.


Third-unit exact executed commands (pinned Node22):

```sh
node --test app/alpha/js/core/streams/sourcePreference.test.mjs app/alpha/js/core/streams/sourceCapabilities.test.mjs app/alpha/js/core/streams/streamOrdering.test.mjs app/alpha/js/core/streams/streamAutoPlaySelector.test.mjs
npm run test:addon-fixtures
NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build --prefix app/alpha
npm run lint --prefix app/alpha
npx playwright test tests/browser/source-preference.spec.mjs --project chromium
PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/nuvioweb-source-order-browser-2026-10-19.json npx playwright test --reporter=list,json
node scripts/check-alpha-build.mjs
node --test scripts/check-docs.test.mjs scripts/governance.test.mjs
node scripts/check-docs.mjs
node scripts/check-progress.mjs
node scripts/check-commit-references.mjs origin/main HEAD
git diff --check
```

The restricted sandbox summarized only test-file subprocesses; the authorized rerun produced19 actual unit and6 actual fixture results. The full local application suite was not rerun for this display-only unit: focused seam tests and mandatory remote full regression are the planned gates. The inherited1089 run remains PR39 evidence, not new-feature proof. No new browser/device, account or deployment result is inferred.

## Protected integration and preview receipt — 2026-10-19

PR40 merged at8edec4248405d59f5b8639085a1e779e6878911b after all four exact-head contexts passed, including the normally triggered ready-for-review integrity check. Full remote application regression1094/1094 passed,0fail/0skip; remote full browser29/29 passed. [Application](https://github.com/saurabhhbansal/nuvioweb/actions/runs/39195533730/job/117877374950), [browser](https://github.com/saurabhhbansal/nuvioweb/actions/runs/39195533796/job/117877375553), [docs](https://github.com/saurabhhbansal/nuvioweb/actions/runs/39195533814/job/117877375057), [integrity](https://github.com/saurabhhbansal/nuvioweb/actions/runs/39195640312/job/117877695113). These supersede the third-unit pending-integration notes, not the still-open #10 device/quality gates.

The already-authorized development preview now serves that reviewed merge. [Deployment/HTTPS/shell evidence](STATIC_PREVIEW.md) distinguishes public asset/guest verification from local legal-media playback tests. No live login/sync/provider, all-device playback, HDR/4K60 or production readiness is claimed. Next work remains expanded named-browser/media/device validation; Linux Chromium evidence cannot certify Chrome/Edge/Firefox/Safari/mobile or hardware HDR output.
