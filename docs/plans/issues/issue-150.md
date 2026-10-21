# Issue #150 — evidence-based failure diagnostics

## Plan and observed-field contract (before code, 2026-10-21)
- Scope: [#150](https://github.com/saurabhhbansal/nuvioweb/issues/150) only; base `f42ac18`, branch `m2/issue-150-failure-diagnostics`. Read issue first; repository spelling corrected after initial lookup failure. Preserve unrelated untracked research.
- Reuse `startupFailure.js`, #10 normalized descriptors, #147 platform hints and existing #148 external-player constraints. #137 owner laptop/iPhone difference remains owner-reported, never an isolated codec cause.
- Targets: new pure `core/player/failureDiagnostics.js` and injected unit fixtures; player failure overlay/export seam; browser rendering regression; committed browser-limitation ledger; support matrix/tracker/progress; compact JSON receipt. This is the sole plan/evidence/review document, capped at200 lines.
- Contract version1: observed player engine, coarse platform/engine hints (not verified OS/browser versions), readyState0–4, networkState0–3, media code1–4, HTTP status100–599 only when available, response content-type and range capability only when observed, declared content-type/container/audio/codecs and required-header boolean separately, phase startup/seek/playback, candidate causes with evidence keys, confidence observed/predicted/unknown, offered next action. Unavailable fields are null/unknown, never inferred from a filename or opaque fetch.
- Export is an allowlisted reconstruction, not raw error serialization: no URLs, titles, IDs, header names/values, UA strings, error text or tokens. Browser/platform hints are labelled hints. No persistence, upload, probes, extra requests or extension enumeration.
- Taxonomy: required headers; observed access/expiry HTTP; provider/transport; invalid response; unsupported-container candidate (MKV); unsupported-audio candidate (TrueHD); codec/config prediction rejection (never generic code3/4 alone); activation rejection; observed range rejection; aborted/decode error; bounded unknown-at-transport/startup/seek. CORS/resource/interference are candidates only without discriminating evidence, not diagnoses.
- Precedence: headers/access/transport outrank format predictions. Positive/unknown/contradictory predictions cannot prove an unsupported codec. MKV/TrueHD declarations identify candidate limitations, not verified bytes or universal engine bans. No new playback limitation or source blocking is introduced.
- Actions: refresh/select another original source first for unknown/delivery, explicit retry for activation, existing feasible external-player action only under its unchanged guard. Own proxy/repack/transcode are explained remedies, not implemented/launched routes. No processing or commercial trigger.
- Ledger entries bind historical named engines/OS/versions and immutable receipts/digests, declaration vs probe vs playback, native-player difference, remedy and retest; no signed source material. Unknown access provenance/digest stays unknown.
- Non-goals: remux/transcode/proxy/player-launch implementation, auth/fetch policy, physical-device/native-output certification, #137 remeasurement, deployment, preview/observer changes, other issues.
- Threats: provider metadata injection, opaque error overclaim, raw credential export, stale evidence, accidental route dispatch. Bound/enumerate all fields; negative fixtures enforce no unsupported codec/provider blame and no secret export.
- Required commands: focused Node diagnostics/startup tests; configured inert app build/lint/artifact check; affected Chromium failure/capability browser tests; docs/governance/links/progress/ancestry/whitespace; four unchanged protected workflows at exact head. Remote clean install/full regressions remain mandatory. Known WebKit DASH dimension timeout allows one rerun only with run IDs recorded.
- Review: distinct direct actual-diff standards/spec/security pass, same-agent automated substitution if Codex unavailable; no reviewer agents, no independent-human-review claim.
- Rollback: protected revert of scoped commits; no data migration or remote operation.

## Execution, review and integration
- Focused classifier/startup tests:45/45 pass (23 new diagnostics,22 retained startup);0skip. Injected MKV/TrueHD/config, headers/access/410/ranges/activation/delivery,206 success, decode ambiguity, conflicts, opaque CORS/resource/interference and secret-metadata negatives. No device result inferred.
- Final configured inert build, lint and12-asset check pass. Local Chromium affected-suite rerun20/20 passes in31.5s,0fail/skip; initial17pass/3fail were stale exact-copy expectations, corrected to assert bounded unknown/header guidance and retained Back. No media assertion was weakened; original1080/2160/HLS/DASH dimensions/seek remain required.
- Full local application1571/1572 passed under Node24.21.0: unrelated `pluginSandboxLifecycle` expects TAP `# tests1` but its subprocess emits spec `ℹ tests1`. Not treated as a pass or changed here. Required remote Node22 clean install/full regression is the integration gate. Local docs/governance15/15, links/progress/whitespace pass.
- First lint found an unused raw-detail helper and unused legacy message argument after removing unsafe output; corrected without relaxing rules. Subsequent lint passes.
- Distinct direct automated actual-diff Standards/Spec/security review, same-agent substitute because Codex absent on PATH; no reviewer agents and NOT independent human approval. Found syntactically valid metadata could carry private strings: replaced permissive MIME/token exports with recognized media/codec vocabulary and added a negative test. Found transport wording could lose precedence: added bounded boolean signal before predictions, no raw text export. Mixed audio does not claim all tracks are TrueHD. No unresolved material review finding.
- Privacy/security: only allowlisted primitives exported; no URLs/title/IDs/header names/values/UA/raw errors, persistence/upload/new requests/extension enumeration. Actual rendered download works with native keyboard activation. Existing header-blocked external route and original sources/engine behavior remain unchanged. No auth/remote-fetch/processing/privilege/dependency/license change or operator compute. Existing GPL provenance preserved.
- Decisions: browser predictions are only candidates; no new MKV/TrueHD engine ban. Response MIME/range/version remain unavailable when the existing engine has not exposed them.410 is gone, not proven expiry;403 is refusal, not proven provider fault. Unknown resource/interference/CORS never triggers processing or global protection advice. Explicit missing-URL copy retained; arbitrary caller messages/details are not published.
- No deployment or real-provider/native/iPhone/laptop/audible/HDR result. Historical receipts stay immutable. Ledger distinguishes source-byte digest unavailable from immutable access-provenance receipts; synthetic inputs have no media bytes.

Executed commands:
```sh
node --test app/alpha/js/core/player/failureDiagnostics.test.mjs app/alpha/js/core/player/startupFailure.test.mjs
NUVIO_LOCAL_PROPERTIES="$PWD/tests/fixtures/build.properties" npm --prefix app/alpha run build
npm --prefix app/alpha run lint
node scripts/check-alpha-build.mjs
npx playwright test tests/browser/failure-diagnostics.spec.mjs tests/browser/capabilities.spec.mjs tests/browser/quality.spec.mjs --project=chromium
npm --prefix app/alpha test
node --test scripts/check-docs.test.mjs scripts/governance.test.mjs
node scripts/check-docs.mjs
node scripts/check-progress.mjs
node scripts/check-commit-references.mjs origin/main HEAD
git diff --check
```

Protected PR conversation is the exact-head/check-run/merge authority, avoiding a self-referential documentation-head hash. Four unchanged required contexts must pass before protected merge; strict/up-to-date/admin enforcement remain enabled, zero independent approvals is a repository limitation. Known WebKit DASH dimension timeout: at most one rerun, recorded with original/rerun IDs in the PR; no such rerun used locally. Proposed completion only after green protected integration.

## Handoff
Next issue starts from #137's original-source/device observations and this vocabulary; no new work on that issue here.

Integration authority: [PR159](https://github.com/saurabhhbansal/nuvioweb/pull/159). All #150 diagnostic-only acceptance boxes are addressed; no device acceptance is inferred. Dependency147 supplies already-merged vocabulary only, not its outstanding processing-consent scope.
