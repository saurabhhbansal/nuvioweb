# Local browser MVP playback — 2026-10-19

Result: **PASS locally on the corrected feature branch; not hosted or named-browser certification.** Source baseline main25ce335 plus the scoped Router Back correction in this evidence PR. Exact reviewed source SHA is the PR head; later documentation-only commits do not alter the runtime. Final inert build773710e26262, workerb7f5924e6152. Node22.23.1/npm10.9.8, Playwright1.64.0, Chromium headless156.0.8078.4 on Linux ARM64,1280×720. Actual Chrome/Edge/Firefox/Safari and physical mobile binaries/devices were not exercised.

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

The first complete journey failed at source Back after selecting subtitles/audio and closing a panel with Escape. Fresh source Back and paused player return without panel dismissal passed, narrowing the trigger. Existing FocusEngine overlay dismissal sets700ms popstate suppression; an immediate explicit History API Back was discarded, triggering player fallback and further suppression. Button handler/parent provenance remained valid. The two new real-Router tests each failed before runtime changes. The initial six-line stale-guard correction passed one local run but was insufficient: protected CI failed the source-Back assertion at three source-equivalent heads (final41/42pass), and a bounded local replay then failed4/5. A fixed-category temporary trace proved Player consumed the explicit traversal despite no suppression: dismissable UI triggered duplicate fallback Stream6 instead of original Stream5. A new actual-player regression failed while unsolicited native-Back overlay control passed. Final Router behavior additionally bypasses screen consumption only for an outstanding proven parent request with registered target and exact expected route/index. Native-event dismissal/guards and settlement controls remain. All DEBUG probes removed; no auth/fetch/player-engine change, dependency, delay or second-click workaround. The bundled journey asserts original parent history index as well as route.

Executed commands and final results:

- `node --test --test-name-pattern='explicit Player Back|explicit source Back' app/alpha/js/ui/navigation/router.browser.test.mjs`: exit1,2cases/0pass/2fail before correction (349ms). Initial sandboxed invocation could not run the child-process seam and is not the reproduction receipt; rerun with required execution permission produced the actual assertions.
- `node --test app/alpha/js/ui/navigation/router.browser.test.mjs app/alpha/js/ui/navigation/focusEngine.browser.test.mjs`: exit0,72/72pass,0skip,473ms.
- `NUVIO_LOCAL_PROPERTIES="$PWD/tests/fixtures/build.properties" npm run build --prefix app/alpha` and `node scripts/check-alpha-build.mjs`: pass,12assets/inert config.
- Initial `npx playwright test tests/browser/mvp-playback.spec.mjs --project=chromium`:2/2pass in9.0s, later superseded by failed CI/reproduction above. After the consumption fix, `npx playwright test tests/browser/mvp-playback.spec.mjs --project=chromium --grep 'guest installs' --repeat-each=5`:5/5pass,0skip,34.6s. The final strengthened original-parent assertion is also part of the full browser regression.
- `npm test --prefix app/alpha`: exit0,1175/1175pass,0skip,23.631s.
- `npm run lint --prefix app/alpha`: pass.
- Final `npx playwright test` after valid-target guard/original-parent assertion: exit0,42/42browser/PWA journeys,0skip,1.7min. Retained403/410/HLS-CORS failure/return, account fixtures and actual worker replacement pass. Protected new final-head CI is still required; the earlier single local pass did not establish cross-environment success.

Existing local403/410/HLS-CORS failure guidance and return journeys remain in the full browser suite. They must remain green; this receipt does not substitute them for hosted service errors. Rollback is a protected revert of the scoped Router change. #10 stays open for named Chrome/Edge first, then Firefox/Safari/mobile and separate sustained-quality gates.
