# Issue #12 — bounded loader foundation, 2026-10-21 UTC

**Partial implementation, not acceptance or closure.** [Issue12](https://github.com/saurabhhbansal/nuvioweb/issues/12) remains OPEN / `in_progress`. All original acceptance boxes remain unchecked. [Pre-code execution amendment](../plans/issues/issue-12.md#implementation-owner-execution-amendment--2026-10-21-before-source-changes). Base `0ea7c877d596c182a008df6040c8792cbec4469c`, branch `m2/issue-12-bounded-loader`.

## Decisions / assumptions for the owner's morning review

- The requested repository spelling returned repository-not-found; checkout origin and committed plan resolve the target to `saurabhhbansal/nuvioweb`. Only issue12 is changed. #1 is closed; #10 remains open and its existing decomposition permits this isolated unit without satisfying its gates.
- Finish the previously held-back unit3 loader rather than stop because native AAC generation is unavailable. No routine owner permission is pending. Do not add an unreviewed codec binary or weaken a fixture/acceptance guard.
- Owner acceptance requires lawful actual installed-provider streams. No fabricated media or generated stream provider is used as acceptance. Existing provider filenames/account access alone establish neither media rights nor recovered audio. No new live account/provider playback is performed by this isolated transport unit.
- The isolated loader must not be installed into the player until finite-VOD/encryption/media checks, SDK retry configuration, all request-path ownership, track confirmation, video pinning and profile/source invalidation are verified together. An isolated network test is not that integration.
- No production or development deployment, new privileges/recipient, paid compute, central relay, provider changes, observer interaction or unrelated issue update. No credentials or private account/browser state were read by this unit.

## What changed

New [boundedRecoveryLoader.js](../../app/alpha/js/core/player/boundedRecoveryLoader.js) exports an explicitly constructed class factory, not imported by playback. Contract inspected against installed hls.js1.5.20 types, FetchLoader and FragmentLoader:

- Stable LoaderStats reference; monotonic timings; bandwidth from measured elapsed time; no default `Hls.Loader` assumption or SDK inheritance.
- Single-use loader, fixed anonymous CORS GET with credentials omitted and redirects refused; caller authorization/cookies/headers, embedded URL credentials, non-HTTP(S), true byte ranges, key/encrypted contexts and partial-segment profiles rejected before fetch. hls.js zero/zero full-resource sentinel accepted.
- Streaming only, no unbounded `text`/`arrayBuffer` fallback. Four concurrent requests,256KiB playlist/1MiB init/8MiB fragment/64MiB session ceilings;5s manifest and10s fragment full-body deadlines. Tests may tighten, never relax, limits.
- Observed rejected bytes counted, cumulative per-resource exhaustion latched, ownership-safe release, fixed error enums; no retry or raw provider exception in diagnostics. Successful SDK response retains URL for relative playlist resolution; private SDK context is not a publishable diagnostic.
- One terminal callback; timeout/abort/destroy cancel reader/controller and clear timer/listener before callbacks; destroy silent like pinned FetchLoader; late outcomes ignored. Progressive ArrayBuffer data is not duplicated in final success; complete text progress converted once. Already-issued remote processing cannot be undone.
- Existing request policy now validates URL scheme/embedded credentials, refuses accessor-backed destinations/headers and returns a validated URL snapshot. Existing session limits are copied/frozen and cannot exceed defaults; exhaustion cannot be reopened by a later small charge.

No new dependency, codec, demuxer, remuxer, preference schema, UI behavior or media claims. Existing licenses/notices remain. Falcon's root GPL and libmedia LGPL are distinct; [pinned audit](../UPSTREAM_LICENSE_AUDIT.md#reuse-boundaries-for-the-reference-forks) remains the provenance source and no Falcon source/binary is imported.

## Actually observed capability gates

`npm run probe:audio-fixtures`, exit0: Chromium156.0.8078.4, headless Linux, native AAC **BLOCKED**. AudioEncoder absent, `audio/mp4;codecs=mp4a.40.2` unsupported; recording actually `audio/mp4;codecs=opus`,11,778bytes, parsed Opus75-byte sample entry, complete641-byte initialization, no AAC config. Exit0 means the probe completed, not AAC support.

Calling the same exported probe in a newly owned browser with installed Playwright Chromium1234 produced the same blocked observations at browser151.0.7922.34. Installed Chrome-for-Testing candidate152 failed launch: executable reported shell syntax error; no capability pass or universal browser conclusion follows. No browser downloaded or existing browser session/profile attached. The original toolchain gate is unchanged.

## Verification commands and results

Host architecture aarch64; pinned rerun uses Node22.23.1/npm10.9.8. Browser-reported user agents are recorded by the probe, not treated as host architecture evidence.

| Command actually executed | Layer / result |
| --- | --- |
| `node --test app/alpha/js/core/player/boundedRecoveryLoader.test.mjs app/alpha/js/core/player/boundedRecoveryLoader.http.test.mjs app/alpha/js/core/player/recoveryRequestPolicy.test.mjs app/alpha/js/core/player/recoveryHlsLoader.test.mjs` |45/45 pass, exit0 on Node24 and pinned Node22; synthetic unit contracts plus real loopback HTTP, no media decode |
| `NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build --prefix app/alpha` | Inert local build exit0 on Node24 and pinned Node22; not deployed |
| `npm test --prefix app/alpha` | Node24 initial run:1506 pass/1 fail, exit1. Existing #11 child-process assertion expected TAP `# tests 1`, actual default reporter produced `ℹ tests 1`; no test weakened. Pinned Node22 rerun1507/1507 pass, exit0 |
| `npm run lint --prefix app/alpha` | Initial exit1: two new negative-test getters lacked explicit throw/return recognized by getter-return. Fixed tests to throw if invoked and assert invocation count0; final rerun pending below |

Remaining required verification and protected exact-head/actual-merge integration are **pending**, not claimed here yet. Final results will be appended before protected integration.

### Negative/control coverage and layer limits

Unit controls: headers/credentials/invalid URLs;403/410 and other status rejection; redirect/opaque rejection; no unbounded body fallback; declared/chunked and aggregate overflow; init classification; four-slot cap and rejected ownership; setup error; overlapping/reused loader; body/header deadline; unresolved cancellation; delayed response; pre-cancelled session; abort/destroy/session signal; stable stats; progressive/text conversion; reentrant onProgress abort; limits immutability and enum-only diagnostics.

Actual ephemeral `127.0.0.1` HTTP controls: full text response/cache age;403/410 exactly one request;302 target never requested; declared/chunked oversized responses; stalled body after headers times out and server observes transport close; session cancel closes response; rejected caller auth/range produces no request; every observed request lacks caller authorization/cookie/range. These bytes are text transport fixtures, **not hand-made stand-ins for provider media**. Node fetch does not enforce browser CORS or certify cookie handling in a real browser.

## Deferred acceptance — exact causes, not an owner-permission block

1. Native AAC synthetic fixture generation: current two runnable Chromium versions emit Opus, no AAC. Keep only this subchain blocked; the independent loader work proceeds.
2. Real supported-audio failure → alternate → decoded-audio recovery, successful/failed return, original video compressed-sample preservation and HLS-TS transmux: loader is not wired, no lawful actual provider recovery source/complete journey verified. Unit/HTTP tests cannot close AC1/AC2.
3. Embedded text subtitles, seek/resume through recovery and mobile memory: no integrated recovery/browser-device journey tested. Browser heap or emulation would not substitute for a physical mobile result.
4. HDR/output/device claims: no named physical display/output path measured. Dimensions, metadata, software decode predictions or headless browser results cannot pass this.
5. AC3 honest unsupported behavior in the integrated recovery UI: existing copy remains, but this loader has no user-facing rollout and its rejection enums are not UI acceptance.

**Exact next implementation step:** provide a provenance-verified lawful stream returned by an actually installed provider, with separate selectable audio and eligible header-free finite VOD; then integrate the loader behind the planned default-off recovery session with all-path budgets/cancellation, SDK retries disabled, actual track confirmation and video representation pinning. Verify failure→alternate decoded signal, return/seek/subtitle continuity and sample preservation before any acceptance box changes. Obtain eligible physical mobile/HDR observations for those claims, not a question about routine authorization.

**Rollback:** protected revert of this isolated source/policy/docs unit; no persisted state or deployed artifact to undo. Provider traffic would cost bandwidth/local CPU/battery if later wired; no operator processing fee or hosted compute introduced. Separate automated review is required; it is not independent human approval. Branch protection requires four strict up-to-date contexts, admins included, with zero independent approvals as an explicit repository limitation.
