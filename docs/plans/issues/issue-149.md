# Issue #149 — device-aware, explainable source ranking

## Scope and plan recorded before implementation (2026-10-21)
- Scope of record: [#149](https://github.com/saurabhhbansal/nuvioweb/issues/149); base `c10e75f`, branch `m2/issue-149-source-ranking`. Origin owner is `saurabhhbansal`, correcting the request's spelling.
- Reuse #10's version1 descriptor/normalization/native probes, #147's browser environment, #148's complete header/URL handoff assessment, and existing stable add-on ordering. No parallel device profile/schema.
- Targets: `sourcePreference.js` + tests; shared browser source card; stream screen and existing component CSS; source-order browser regression; support contract, tracker and ledger; compact JSON receipt.
- API/seams: `assessSourceForDevice(stream, {environment, now})` returns only route/rank/reason/explanation, no URLs/headers; stable ordering returns the identical original objects. Unit fixtures inject browser capability APIs. Browser assertions exercise rendered source ordering/labels, correction, filter, keyboard/manual playback and Back. Owner explicitly authorized these seams; autonomous decisions replace routine confirmation.
- Default device order: browser-predicted complete direct configurations, external-player candidates, unknown, header/proxy-required, blocked delivery/expiry. Preserve provider order within each tier; labels/resolution never break ties. Provider-order toggle remains available; autoplay retains its existing provider-order contract.
- Browser tier requires explicit compatible container and exact video/audio codec declarations, with a positive native prediction for the complete configuration. HEVC aliases/absent profiles stay unknown; exact Main10 configuration uses this browser's probe, not UA or sample extrapolation. Only exact DV profile5 is eligible for prediction; other/unspecified profiles are not promised. Physical HDR remains unverified.
- MKV demux and TrueHD decoding are unavailable in the shipped in-page path, regardless of an optimistic generic MIME response. Adaptive HLS/DASH remain unknown rather than misusing a native-file probe. Audio absence means unknown, not silence. Required headers override all positive predictions and URL-only player candidates: needs own proxy, not an implemented proxy offer. Expired/invalid deliveries are blocked guidance but remain selectable.
- Manual failure correction: memory-only weak references to original raw source objects, reversible, survives in-memory Back but not reload/provider refresh. No URL, credential, device fingerprint or persistent correction key. A reported failure demotes the prediction; never claims a successful observation or codec diagnosis.
- Threats: forged descriptors hiding raw headers, codec contradictions, malformed metadata, title marketing, stale/platform-global probe caches, credential leakage, accidental auto-launch/substitution/compute dispatch. Re-normalize, reuse full raw handoff assessment, escape copy and do no media/provider requests for ranking.
- Non-goals: provider integrations, engine/demux/transcode changes, physical-device certification, new persistence/backend/proxy/privileges, account/auth changes, hosted compute or commerce. No deploy; pinned previews/elapsed observers untouched.
- Required commands: focused Node tests; inert app build/lint and artifact check; focused Chromium browser tests; docs/progress/governance and whitespace/reference checks; all four protected workflows on exact PR head. Existing locked dependencies reused locally; remote application workflow supplies clean install/full suite. Only known WebKit quality DASH dimension-timeout smoke flake may be rerun once; retain run IDs.
- Review: distinct direct read-only diff/security/spec review after tests; Codex CLI unavailable on PATH. Automated same-agent substitution, not independent human approval; record here only, no reviewer agents/files.
- Rollback: protected revert of this issue's commits; no migration or remote state to undo.

## Decisions, executed evidence and review
- Final focused unit gates: **50/50**, zero failures/skips; ranking-specific **11/11**. Includes container/TrueHD/Main10/DV subsets, missing metadata/audio, complete MIME, headers/raw-forgery/credential rejection, adaptive/expiry, platform changes/cache isolation and reversible correction.
- Local affected browser gates: **24/24**, zero failures/skips (42.2s): three source-order journeys, twelve capability/redaction/startup journeys and nine external-player journeys. Original generated4K remains manually selectable; playback/Back asserts original bytes/dimensions, not real-device4K/HDR certification. Injected format predictions are explicitly synthetic.
- Initial browser22pass/2fail retained: native Enter also reached legacy TV navigation on correction; fixed native-button key ownership. Synthetic row names had unescaped spaces in URLs; transfer guard correctly rejected them, so fixture query encoding was fixed. No guard/assertion was weakened. Initial missing-export red and malformed-profile red also retained.
- Build/lint and12 inert artifact checks pass. Docs/governance/issue7 gate tests **50/50**; links/progress/whitespace/schema pass. Existing A8 remains unmet; no issue7/preview/observer change.
- Distinct automated direct review over actual diff (Codex CLI absent; no reviewer agents): raw projection contradictions now remain unknown; raw TrueHD cannot be erased; DV7 layer handling is external-candidate, DV8/other unverified profiles unknown, only exact DV5 eligible. Removed optimistic type-only lines beneath incompatible/header/blocked routes. No unresolved security/spec finding after corrections; not independent human approval.
- Security/privacy/cost/licensing: no network/storage/auth/engine change, URL/header export, capability upload, new dependency/licence or operator compute. Existing #148 assessment gained reason codes without changing allow/deny behavior. Weak corrections hold no credential/URL key. Signed originals, requirements and stable provider identities are unmodified; autoplay remains provider-order.
- One batched desktop1280x800/narrow390x844 inspection found correction buttons stretching alongside cards. Fixed to sibling below full-width cards; final3/3 geometry/screenshot confirmation passes. Inherited blocked icon-font fallback remains visible. Design detector exit2 reports only pre-existing bounce/layout animation warnings outside the diff; no style cleanup outside scope.
- Assumption: unknown/adaptive sources stay eligible for manual browser attempts; external support is only a candidate, never installed-player success. Conservative audio metadata requirements intentionally prevent video-only probes from advertising playable sound. Corrections are session-local, not durable codec diagnoses.

Executed commands (Node22.23.1 PATH prefix; browser cache `/home/saurabh/.cache/ms-playwright`):
```sh
node --test app/alpha/js/core/streams/sourcePreference.test.mjs app/alpha/js/core/streams/sourceCapabilities.test.mjs app/alpha/js/core/streams/deviceCapabilities.test.mjs app/alpha/js/core/streams/streamOrdering.test.mjs app/alpha/js/ui/components/browserExternalPlayer.test.mjs
NUVIO_LOCAL_PROPERTIES="$PWD/tests/fixtures/build.properties" npm --prefix app/alpha run build
npm --prefix app/alpha run lint
node scripts/check-alpha-build.mjs
npx playwright test tests/browser/source-preference.spec.mjs tests/browser/capabilities.spec.mjs tests/browser/external-player.spec.mjs --project=chromium
node --test scripts/check-docs.test.mjs scripts/governance.test.mjs scripts/check-issue7-acceptance.test.mjs
node scripts/check-docs.mjs
node scripts/check-progress.mjs
node scripts/check-issue7-acceptance.mjs docs/evidence/issue7-acceptance.json --validate
git diff --check
```
Full clean-install/audit/application/engine regression is required remotely, not claimed locally. No physical device, installed player, real-provider delivery, HDR/audio output or adaptive-engine ranking certification; no deploy.

## Integration
[PR158](https://github.com/saurabhhbansal/nuvioweb/pull/158) is the protected integration authority. All four unchanged required contexts must be green at its exact final head before merge; final head, run URLs, any known-flake attempt and merge commit are recorded in its integration conversation (avoids a self-referential documentation-head hash). This ledger completion is proposed until that evidence PR merges, not permission to skip CI. Strict/up-to-date checks and admin enforcement remain enabled; zero independent approvals is a documented repository limitation.

All five #149 acceptance boxes are addressed by the descriptor/native/audio/profile/header assessment, truthful external-candidate/unknown labels, preserved objects/IDs/requirements and manual playback, reversible memory-only failure report, negative/platform fixtures and rendered browser journeys. No physical-device success is required or claimed for this ranking-only issue. Close explicitly only after green protected integration. No deploy, pinned-preview read/write or observer interference.

Next issue is [#150](https://github.com/saurabhhbansal/nuvioweb/issues/150), not started here: begin with existing `core/player/startupFailure.js`, #137 observations and #10 descriptors; define redacted observed-fields/confidence/candidate-causes/next-action vocabulary and limitation-ledger contract before implementation. Keep opaque transport/startup unknown; source headers are not codec blame.
