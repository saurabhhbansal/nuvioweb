# Issue10 engine matrix — review and scoped handoff, 2026-10-20

This handoff is separate from the issue120 checkpoint. **Do not rewrite issue7/120/128–130 acceptance, stop elapsed observers, navigate existing browser/CDP sessions, replace the pinned runtime or deploy the preview.** No such operation was performed by this unit.

## Assignment and proposed integration

Owner scope: test Chromium once (Chrome/Edge/Brave/Opera), WebKit once (Safari), Gecko once (Firefox), not duplicate brands. [Issue10](https://github.com/saurabhhbansal/nuvioweb/issues/10) remains open for real host certification gaps; [matrix](../ENGINE_CAPABILITY_MATRIX.md) records the exact layers, hardware needs and compute implications. [Plan](../plans/issues/issue-10.md) preceded runtime, native fixture and adaptive fixture changes.

Branch `m2/issue-10-engine-matrix`, base `7c6b8f9c75306b5d345a58b64f4e1c5ea0ae0572`, [PR134](https://github.com/saurabhhbansal/nuvioweb/pull/134). Commits:

- `2ecc95ebeb225813503e1cd16800771b2f9cdad3`: runtime codec consistency, engine tooling and initial CI coverage.
- `5eb75a31b1435fc8735c7f20a86f7893d60840f0`: bounded observations, frame/size validation, exact initialization codec strings, native packet-identical containers.
- `98b139f8ee4c1ba363d4d802c18b1c3afbfd3784`: stale seek-frame and missing-required-row rejection, adaptive plan amendment.
- `586092eafde0eea7c15b2b58eb58be6497c772e3`: lossless adaptive canonical timing, honest WebKit transport observations.
- `f5f15892d9078cb6e445cd01e529fade2b908c18`: actual post-seek presentation in bundled tests with measured sparse-callback handling. Sustained60 criteria unchanged.

No closing directive, force push, protection override or preview deployment. Protected exact-head and actual-merge checks remain mandatory; pending integration is not a pass.

## Separate technical review

Codex CLI was absent on PATH. The repository-approved substitute was two distinct read-only automated reviewers following the code-review Standards and Spec checklists. **These reviews are automated, not independent human approval.** They reviewed actual fixed commit ranges, not prose or assumed test outcomes.

| Pass | Findings | Resolution |
| --- | --- | --- |
| Standards, `7c6b8f9..2ecc95e` |3 actionable: late callback bursts could falsely pass60fps; unbounded browser operations; allocation before actual-size check | Full-wall-window/gap math and countertests; resume/fetch/case deadlines; opened-file stat/fixed capped reads. Follow-up `..5eb75a3`:0 unresolved. |
| Spec, `7c6b8f9..2ecc95e` |4 actionable: false zero exit for positive-probe decode failure; post-seek errors ignored; unbounded operations; NaN frame measurement fail-open | Explicit nonzero decode/performance exits, error guard, deadlines and finite measured count/FPS regressions. Follow-up confirms all4 resolved. |
| Spec follow-up `..5eb75a3` |2P2: pre-seek queued frame could satisfy proof; absent required stress/codec cases disappear into success | Callback registration after seeked, near-target/advancing-frame proof; independent9-case scope, explicit NOT_MEASURED and exit4. `..98b139f` follow-up:0 unresolved. |
| Standards `98b139f..586092e` |0 new actionable | Packet hashes/mdat equality, explicit serve allowlist and layered WebKit HTTP evidence accepted;12 pure tests passed. |
| Spec `98b139f..586092e` |1P2: bundled seek still lacked presented-frame evidence | Added actual post-seek callback data plus original-resolution/presentation-counter progression without replacing clock/error checks. |
| Final Standards and Spec `586092e..f5f1589` |**0 unresolved actionable findings** in both independent automated passes | Both inspected first-near-target/later-advancing frame proof, bounded waits and unchanged60fps acceptance. Each executed delivery regressions4/4,0skip. Actual browser/matrix runs remain separate evidence. |

Final evidence audit independently recomputed native predicates/exit3, checked all public source/helper hashes, counted27 bundled passes and inspected all12 actual-quality frame attachments. Standards found one documentation P2: replacing the old `remaining` array had dropped broader multitrack/audible and hosted-provider CORS limits. Those unresolved product entries were explicitly restored and exclusive handoff wording removed; no test evidence completed them. The matrix assignment itself remains engine-scoped.

The initial two-near-target-callback attempt correctly failed WebKit4/4. A same-fixture callback/no-callback differential showed advancing clock and actual presented frame counters5→11, but sparse notifications at0.600966→1.807266. Requiring notifications at an assumed fixed cadence was a test-driver bug. The final seek check requires the first new-timeline frame near target and a genuinely newer second presentation within the clip/deadline. This is not a60fps claim or relaxation of sustained delivery. [Preserved diagnosis records](../evidence/issue10-diagnoses-2026-10-20.json).

## Executed verification

Pinned Node22.23.1/npm10.9.8. All results below are actually executed, not inferred from imported tests.

- `npm run test:engine-media`:12/12,0skip, including stale8.5s frame, late callback bursts, missing/NaN counts/FPS, post-seek error, missing stress row, empty engine selection, deadline cleanup, exact codec box strings and bounded inventory/symlink/size rejection.
- `npm run test:quality-fixtures`:6/6,0skip. Original generator/provenance hashes retained; canonical source/output hashes, ordered packet receipts and complete AVC payload identity verified.
- `npm run test:addon-fixtures`:6/6,0skip. Explicit legacy/canonical route hashes/MIME/Range/CORS/status and private-file denial.
- Runtime focused declaration/order/card/startup regressions38/38,0skip; actual bundled contradictory descriptor and real API/cache regressions2/2 Chromium.
- `npm test --prefix app/alpha`: final rerun1452/1452,0skip,17.58s (earlier20.9s retained in historical PR notes); `npm run lint --prefix app/alpha`, configured inert build and `node scripts/check-alpha-build.mjs`:pass,12 assets. Later changes are test tooling/fixtures, not additional application runtime edits.
- Agent's clock/seek canonical WebKit suite9/9 and focused native/error3/3 passed before the subsequent presented-frame strengthening; those older passes do not certify that stronger seam.
- Final native stress matrix atf5f1589 returns exit3 (all strict sustained60 criteria unmet), with WebKit/Gecko9/9 and Chromium6/9 native decode/seek; it is not a passing acceptance test. Final raw receipt records the actual exit and API/decode/frame outcomes. Native stress runs never overlap other browser/encoder work.
- Final full Chromium suite (separate PWA project not selected by this command): `PLAYWRIGHT_BROWSERS_PATH=/home/saurabh/.cache/ms-playwright PLAYWRIGHT_JSON_OUTPUT_NAME="$PWD/.tmp/issue10/chromium-full-final.json" npx playwright test --project=chromium --reporter=list,json`:77/77,0fail/skip/flaky,157.9s. Raw report SHA256 `834069b45a9b69bbef74a93f571ca4723c7e162deded27ea423aed344a0609c7`.
- Separate final PWA command `PLAYWRIGHT_BROWSERS_PATH=/home/saurabh/.cache/ms-playwright PLAYWRIGHT_JSON_OUTPUT_NAME="$PWD/.tmp/issue10/pwa-final.json" npx playwright test --project=chromium-pwa --reporter=list,json`:2/2,0skip,7.7s. This is independent of the77 Chromium cases above. Final fixed-head audit caught and corrected the earlier misleading Chromium/PWA label; no evidence count was inferred.
- Final sourcef5f1589 all4 protected head contexts passed: [application](https://github.com/saurabhhbansal/nuvioweb/actions/runs/39461068770/job/118760357541), [browser](https://github.com/saurabhhbansal/nuvioweb/actions/runs/39461068602/job/118760356891), [docs](https://github.com/saurabhhbansal/nuvioweb/actions/runs/39461068667/job/118760357346), [integrity](https://github.com/saurabhhbansal/nuvioweb/actions/runs/39461068413/job/118760355129). Final documentation head and actual merge still require their own checks.
- Historical18-test bundle13pass5fail, historical first strict frame attempt27tests23pass4fail, legacy Gecko native duration failure and earlier environment/encoding failures remain explicitly retained as historical, not green final results.

### Reproducible isolated-host environment

The normal required CI uses stock installed browsers, not private launch overrides. This restricted ARM64 host uses the following child environment and private supported paths:

```sh
export PATH=/home/saurabh/.local/share/mise/installs/node/22.23.1/bin:$PATH
export PLAYWRIGHT_BROWSERS_PATH=/home/saurabh/.cache/ms-playwright
export NUVIO_ENGINE_TOOL_ROOT="$PWD/.tmp/issue10"
export NUVIO_WEBKIT_ROOT="$PWD/.pw-browsers/webkit-2370/minibrowser-wpe"
export NUVIO_WEBKIT_EXECUTABLE="$NUVIO_WEBKIT_ROOT/bin/MiniBrowser"
export NUVIO_FIREFOX_EXECUTABLE="$PWD/.tmp/issue10/native-browsers/firefox-1555/firefox/firefox"
export HOME="$PWD/.tmp/issue10/home" TMPDIR="$PWD/.tmp/issue10/tmp"
NUVIO_SOURCE_REVISION=$(git rev-parse HEAD) node scripts/verify-engine-media.mjs --media .tmp/issue10/media-final --out .tmp/issue10/engine-matrix-final-v2.json
NUVIO_PLAYWRIGHT_WEBKIT=1 NUVIO_PLAYWRIGHT_FIREFOX=1 PLAYWRIGHT_JSON_OUTPUT_NAME="$PWD/.tmp/issue10/bundled-final-v2.json" npx playwright test tests/browser/quality.spec.mjs tests/browser/engine-capabilities.spec.mjs --project=chromium --project=webkit --project=firefox --reporter=list,json
```

The helper uses merged existing host/private GStreamer plugins, private registry/profile/cache and supported WPE media-buffer directory. No explicit sandbox/security-disabling flag is added. Tool archive/license inventory is [published separately](../evidence/issue10-tool-inventory-2026-10-20.json); no binary becomes a production dependency.

Generator executed with private FFmpeg/FFprobe6.1.1 using child LD_LIBRARY_PATH for private ARM64/blas/lapack/pulseaudio libraries. Original generation provenance binds actual settings/bytes and historical dirty-source hashes; it must not be relabeled as generated by a later commit. Current generator adds validation hardening without changing those encoded bytes. HDR metadata is encoder-authored test metadata, not output certification.

## Security, privacy, cost and regression boundary

No new runtime origin, credentials, authorization recipient, proxy, provider fetch, recovery/retry policy, DRM path, payment or deployment. Test servers serve fixed hash-verified legal files on loopback; routes block nonfixture destinations. Credential flags remain false and synthetic signed-marker redaction is asserted. File reads, generated-file sizes, subprocesses and evaluation windows are bounded. Complete notices and original media provenance remain. Optional compute implications are analytical only: no hosted processing was launched and no billing changed.

The codec-conflict guard is advisory and cache-safe, preserving selectable original streams and header/network precedence. HLS/DASH changes are packet-identical test containers, not a runtime workaround for a real source. Full Chromium regression and all4 exact-head/merge workflows must be observed before integration. Hardware/output gaps remain open after integration; do not close #10 or pretend another browser brand supplies missing evidence.

## Next action / final integration record

Final native receipt exit3 and bundled classifier/quality27/27,0skip,1.8minutes are observed atf5f1589. Finish full Chromium and docs/ledger/ancestry gates, then publish exact head and protected merge receipts. Then retain #10 open for the concrete host/output gaps in this engine assignment; broader multitrack/audible-output and hosted-provider CORS evidence remains explicitly unresolved in the ledger rather than silently completed; no routine permission request is needed to integrate a reviewed passing reversible unit. Do not change the separate issue120 checkpoint or pinned runtime.
