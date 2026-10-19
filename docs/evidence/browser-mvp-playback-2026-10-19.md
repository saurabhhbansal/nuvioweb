# Local browser MVP playback — 2026-10-19

Result: **PASS locally on the corrected feature branch; not hosted or named-browser certification.** Source baseline main25ce335 plus the scoped Router Back correction in this evidence PR. Exact reviewed source SHA is the PR head; later documentation-only commits do not alter the runtime. Inert build1f6602975d2f, worker4cf247398dd9. Node22.23.1/npm10.9.8, Playwright1.64.0, Chromium headless156.0.8078.4 on Linux ARM64,1280×720. Actual Chrome/Edge/Firefox/Safari and physical mobile binaries/devices were not exercised.

The actual bundled guest UI installs the existing legal HTTP add-on, browses its catalog/details, saves the original item, chooses the VP8/Opus source, decodes640×360 and advances time without a media error. Real controls pause, seek to25%, resume and pause again. English subtitle selection produces a showing native TextTrack with an active original caption; screenshot was visually inspected. The audio menu correctly reports “No audio tracks available.” This fixture has one Opus track, so multitrack selection and audible device output remain NOT TESTED. Player Back → source Back → detail Back returns to Home. The saved card and installed add-on survive actual reload/profile selection.

| User journey | Result |
| --- | --- |
| Guest → Settings → install manifest → catalog/detail | PASS |
| Detail Save → source selection → actual video decode | PASS |
| Pause → progress-bar seek → resume | PASS |
| English subtitle selection/visible native cue | PASS |
| Audio-track switching | NOT TESTED; no selectable tracks on this fixture |
| Close panel → player Back → source Back → browse | PASS after correction |
| Saved Library/add-on survive reload | PASS guest-local only |
| Live service, hosted HTTPS, external provider CORS | NOT TESTED by this run |

Provider and app use real separate loopback HTTP origins4373/4371. All external browser requests blocked; no credentials, API accounts or live Library changes. CC0 bytes/provenance unchanged: `procedural-vp8-opus.webm`,41129bytes, SHA256ddc53c6aaf0e76e6852cecf7ffa33ccd449a71245e58963b0fbf87d3f4f097de; original generated pattern/tone and English VTT, no external film/music. A short low-frame-rate fixture is not sustained4K60/HDR/codec/device support.

## Failure and correction

The first complete journey failed at source Back after selecting subtitles/audio and closing a panel with Escape. Fresh source Back and paused player return without panel dismissal passed, narrowing the trigger. Existing FocusEngine overlay dismissal sets700ms popstate suppression; an immediate explicit History API Back was discarded, triggering player fallback and further suppression. Button handler/parent provenance remained valid. The two new real-Router tests each failed before runtime changes. Six runtime lines clear stale suppression/ignore only immediately before an explicit app History Back. Unsolicited native-event guards and settlement controls remain; no auth/fetch/player-engine change, new dependency, delay or second-click workaround.

Executed commands and final results:

- `node --test --test-name-pattern='explicit Player Back|explicit source Back' app/alpha/js/ui/navigation/router.browser.test.mjs`: exit1,2cases/0pass/2fail before correction (349ms). Initial sandboxed invocation could not run the child-process seam and is not the reproduction receipt; rerun with required execution permission produced the actual assertions.
- `node --test app/alpha/js/ui/navigation/router.browser.test.mjs app/alpha/js/ui/navigation/focusEngine.browser.test.mjs`: exit0,70/70pass,0skip,622ms.
- `NUVIO_LOCAL_PROPERTIES="$PWD/tests/fixtures/build.properties" npm run build --prefix app/alpha` and `node scripts/check-alpha-build.mjs`: pass,12assets/inert config.
- `npx playwright test tests/browser/mvp-playback.spec.mjs --project=chromium`: exit0,2/2pass,0skip,9.0s.
- `npm test --prefix app/alpha`: exit0,1173/1173pass,0skip,21.387s.
- `npm run lint --prefix app/alpha`: pass.
- `npx playwright test`: exit0,42/42browser/PWA journeys,0skip,1.7min; retained403/410/HLS-CORS failure/return and session/PWA cases pass. Protected final-head CI remains required.

Existing local403/410/HLS-CORS failure guidance and return journeys remain in the full browser suite. They must remain green; this receipt does not substitute them for hosted service errors. Rollback is a protected revert of the scoped Router change. #10 stays open for named Chrome/Edge first, then Firefox/Safari/mobile and separate sustained-quality gates.
