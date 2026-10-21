# Startup-failure classification — automated evidence, 2026-10-19

Issue: [#10](https://github.com/saurabhhbansal/nuvioweb/issues/10). Plan: [issue-10 plan](../plans/issues/issue-10.md) (pre-code amendment "bounded startup-failure classification").
Scope: a bounded, evidence-gated classifier for browser playback startup failures plus its wiring into the three startup failure sites. No transcoding, no remuxing, no new codec support, no source ordering change, no new overlay action, no claim about HDR, multitrack or per-iOS behavior.

## What changed

- New pure module `app/alpha/js/core/player/startupFailure.js`: `classifyStartupFailure(input)` returns a bounded `{reason, category, evidence, container, codec}`. Reasons: `header-required`, `unsupported-container`, `unsupported-codec`, `invalid-content`, `network`, `aborted`, `decode-error`, `startup-stall`, `startup-media-error`, `startup-source-error`, `startup-unknown`.
- `app/alpha/js/core/streams/sourceCapabilities.js`: new `selectSourceContentType(values)` so a provider alias (`mkv`, `hls`) cannot shadow a validated MIME type that carries the container declaration.
- `app/alpha/js/ui/screens/player/playerScreen.js`: `classifyStartupFailureForSource` / `resolveStartupFailure` gather descriptor, engine prediction, header evidence, HTTP status and timeout; the play-promise rejection, the media/`error` startup path and the startup stall guard now report the resolved reason instead of a hard-coded literal. `mediaErrorMessage` gains classified branches and puts `header-required` above the HTTP status branch. `normalizeStreamCandidates` keeps the repository `sourceDescriptor`, which the player's narrow candidate list previously dropped.
- `app/alpha/js/ui/screens/player/playbackDisplayText.js`: `ensureSentenceEnding` removes the doubled full stop on composed messages.
- `app/alpha/res/values/strings.xml`: `player_error_container_unsupported`, `player_error_codec_unsupported`.

## Evidence gates (why an unsupported claim is allowed)

1. `header-required` — the source was never requested correctly: `notWebReady` true and at least one required request header.
2. `network` — an HTTP status, a transport media error (code 2), a transport marker in the runtime detail ("Failed to fetch", "net::ERR_*", "Load failed", timeouts), or an abort (code 1).
3. `invalid-content` — an error page or unparsable manifest in the runtime detail.
4. `unsupported-container` / `unsupported-codec` — only when the engine handles the container natively (not `hls.js`/`dash.js`), the detail was fully inspected, a descriptor exists, and the engine gave a positive signal (`canPlayType` returned the definitive "not reported", or a media 3/4 rejection with no transport or parse evidence). A source the engine predicted as `probably`/`maybe` is never classified unsupported.
5. `startup-stall` — a genuine timeout with no contrary evidence.

## Chromium engine evidence (real `HTMLVideoElement.canPlayType`)

Chromium 156.0.8078.4 / Playwright 1.64 / Linux ARM64, from `tests/browser/capabilities.spec.mjs`:

| Declared source | Engine prediction | Stall reason | Verdict evidence |
| --- | --- | --- | --- |
| `video/x-matroska; codecs="hvc1"` | not reported | `unsupported-container` | native-not-reported |
| `video/mp4; codecs="hvc1"` | not reported | `unsupported-codec` | native-not-reported |
| `video/mp4; codecs="avc1.640028"` | probably | `startup-stall` | startup-timeout |
| `application/vnd.apple.mpegurl` | maybe | `startup-stall` | startup-timeout |
| any of the above + HTTP 403 | — | `network` | http-status |

## End-to-end evidence in the bundled player (Chromium 156)

New fixture scenario `startup-header-required` serves a stream with `notWebReady: true` and a required request header; the fixture media route answers `403` when that header is absent, which the browser cannot send on a media element. Clicking the source in the real bundled UI produced:

- startup overlay shown with "requires special request headers" text;
- detail lines containing `Reason: header-required` and not `Reason: startup-stall`;
- the composed message ending exactly once at "contact the add-on provider.";
- `Go Back` returning to the `stream` route.

Before this change that path reported the generic `startup-source-error` reason, so the reason assertion fails against the previous behaviour.

## Runtime reason/message parity

`tests/browser/capabilities.spec.mjs` drives the real `PlayerScreen` methods (router-first import resolves the module cycle) with synthetic descriptors and a `403` detail:

- header-required + `HTTP 403` → header message, not the HTTP message (classified path);
- unclassified `HTTP 403` → unchanged HTTP message (legacy ordering preserved);
- unsupported container/codec → message names `matroska`/`hvc1` and ends with one full stop;
- network → HTTP message, never the container message;
- stall → generic message with one full stop.

## WebKit engine-family evidence (CI, first automatic execution)

Playwright WebKit 27.2 (build v2370) on the ubuntu CI runner, run inside the required browser job via `NUVIO_PLAYWRIGHT_WEBKIT=1 npx playwright test --project=webkit` against `tests/browser/engine-capabilities.spec.mjs`. The spec asserts invariants against the engine's own answer, so it is honest on either engine. Observed predictions:

| Engine | Matroska+HEVC | MP4+HEVC | MP4+H.264 | HLS manifest |
| --- | --- | --- | --- | --- |
| Chromium 156.0.8078.4 | not reported | not reported | probably | maybe |
| Playwright WebKit 27.2 | probably | probably | probably | not reported |

Consequences actually asserted in CI:

- On WebKit every declared container/codec was predicted playable, so the classifier did **not** claim unsupported for them — a Matroska stall stays `startup-stall`. A classifier that ignored the engine and always claimed unsupported would fail this.
- On WebKit the HLS MIME type is "not reported"; the adaptive-transport rule keeps it out of container classification, so no unsupported claim is made from a native prediction for an `hls.js`/native-HLS source.
- `HTTP 403` → `network` and `notWebReady`+headers → `header-required` held on both engines.
- The startup overlay showed header guidance (not an HTTP verdict) and ended with one full stop on both engines.

This is engine-family evidence. It is not a claim about iOS Safari's media stack, any iOS version, or any device, and the WebKit run does not play media.

## Tests and checks (exact commands)

| Command | Result |
| --- | --- |
| `node --test app/alpha/js/core/player/startupFailure.test.mjs` | 21 pass, 0 fail |
| `node --test app/alpha/js/core/streams/sourceCapabilities.test.mjs` | 7 pass, 0 fail |
| `node --test app/alpha/js/ui/screens/player/playerScreen.browser.test.mjs` | 8 pass, 0 fail |
| `npm test --prefix app/alpha` | 1262 pass, 0 fail (baseline 1238) |
| `NUVIO_LOCAL_PROPERTIES=<repo>/tests/fixtures/build.properties npm run build --prefix app/alpha` | success |
| `npm run lint --prefix app/alpha` | pass |
| `node scripts/check-alpha-build.mjs` | 12 assets, inert config, no privileged fields |
| `npx playwright test tests/browser/capabilities.spec.mjs --project=chromium` | 9 pass, 0 fail |
| `npx playwright test` (local, Chromium only) | 56 pass, 0 fail (baseline 51; +2 engine-agreement tests) |
| `NUVIO_PLAYWRIGHT_WEBKIT=1 npx playwright test --project=webkit` (CI) | 2 pass, 0 fail on WebKit 27.2 |
| `node scripts/check-docs.mjs` | pass |
| `node --test scripts/check-docs.test.mjs scripts/governance.test.mjs scripts/prepare-static-preview.test.mjs` | 19 pass, 0 fail |
| `node scripts/check-progress.mjs` | pass |

## Limits

- Synthetic and local evidence only. Chromium/Chrome-family only: no WebKit, Firefox, branded Edge, iOS or Android run is claimed by this unit. The Playwright WebKit project is the next unit.
- The classifier can only classify what the engine and the provider declaration expose. Sources with no MIME type and no engine rejection stay `startup-stall`/`startup-media-error`; the iPhone MP4 and Dolby Vision stalls in [device verification](device-verification-2026-10-19.md) therefore remain honestly generic.
- Detail text longer than 1024 characters is treated as uninspected, so it cannot produce an unsupported verdict; the reason then degrades to `startup-stall`/`startup-media-error`.
- Translating the two new strings is not done; other locales fall back to the inline English text.
- Builds are not bit-reproducible (embedded build timestamp); this unit changes no hosted artifact by itself.

## Integration

Merged through the protected workflow as [PR #77](https://github.com/saurabhhbansal/nuvioweb/pull/77) at `d2a6acd`, after all four required contexts passed at head `9a2edff` with a clean merge state (no override, no force push). The merged tree is identical to the tested head. This unit did not deploy anything; the hosted preview still serves revision `1f67867` and its retained rollback remains valid.

## Review

Automated read-only review with Codex CLI (0.163.0), not independent human approval. The first pass reported two P1 findings (a transport detail or an HTTP status could still produce a wrong verdict; the inspection bound could be bypassed) and two P2 findings (source-type aliases masking a declared MIME type; MIME-only codec declarations missed) plus one P3 (doubled full stop). A verification pass confirmed those and reported two further edges: non-string details counted as inspected, and the generic marker "load failed" producing a false `network` verdict next to a real codec rejection. All seven were fixed with regression tests before integration. The full record is in `docs/agent-runs/2026-10-19-startup-classification-review.md`.
