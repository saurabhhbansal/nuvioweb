# Source declarations and browser predictions — issue #10

This is the first implementation unit for [#10](https://github.com/saurabhhbansal/nuvioweb/issues/10), following verified [legal fixture journeys](ADDON_INTEROPERABILITY.md). The ticket remains open. No realistic4K/HDR/adaptive/cross-browser claim follows from this unit. [Plan and remaining gates](plans/issues/issue-10.md).

## Contract

`core/streams/sourceCapabilities.js` produces a version1 descriptor from explicit optional provider fields: `mimeType`, `video.{codec,width,height,bitrate,framerate,hdr}`, `audioTracks`, `subtitles`, ISO `expiresAt` and existing `behaviorHints.proxyHeaders.request`. These extensions are optional internal projection inputs, not mandatory Stremio fields. Missing/invalid metadata is null; empty track lists mean no track metadata was supplied, not proof that media has no tracks. Only finite positive numeric declarations are accepted. Text is bounded, codec/language/format tokens restricted, arrays capped at32. Provider declarations remain unverified.

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

Remaining #10 work: compatible-source ranking with honest unknown handling; legal realistic1080p/4K/HLS/DASH playback, seek and expiry cases; named Chrome/Edge/Firefox/Safari and hardware/mobile evidence. Header and expired-link card guidance still need dedicated browser assertions. Actual audio/subtitle switching, HDR output, public HTTPS/PNA/provider failures, live auth/cloud sync and paid/own compute are not established. One VP8 fixture and a browser prediction do not establish codec/device compatibility. Current public preview remains its separately recorded #6 revision; this branch is not deployed.

No new dependency, backend, financial commitment or media-processing/auth/remote-fetch policy change. The upstream pin/history/GPL/license files are preserved; local patch inventory is in [provenance](../UPSTREAM_SOURCES.md). Rollback is a protected revert of the descriptor/projection/card changes with no account/schema/data migration.
