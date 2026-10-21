# Plugin engine browser-bundle evaluation — 2026-10-19

Status: **measurement and decision only; no engine is bundled, served or wired into the application.** Related: [plugin compatibility contract](PLUGIN_COMPATIBILITY.md), [security model](SECURITY_PRIVACY.md).

## Method

`app/alpha/scripts/measurePluginEngineBundle.mjs` bundles each QuickJS/WASM variant with esbuild 0.28.2 (minified ESM, browser platform, `es2022`, `.wasm` as a file asset), then reports JavaScript, the package's `emscripten-module.wasm`, and an inlined-base64 alternative. Run with pinned Node 22.23.1:

```sh
cd app/alpha
NUVIO_ENGINE_REPORT="$PWD/dist/plugin-engine-measure/report.json" \
  node scripts/measurePluginEngineBundle.mjs
```

`quickjs-emscripten` 0.32.0 and QuickJS are MIT. Results are for `@jitl/quickjs-wasmfile-release-sync` and `@jitl/quickjs-wasmfile-release-asyncify` at that version.

## Measured cost

| Variant | JavaScript | JS gzip | WASM | WASM gzip | Total raw | Gzip parts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| sync | 51,474 B | 14,258 B | 503,134 B | 233,588 B | 554,608 B | 247,846 B |
| async (asyncify) | 56,365 B | 15,510 B | 1,027,523 B | 362,445 B | 1,083,888 B | 377,955 B |

Inlining the WASM as base64 instead of shipping an asset: sync 670,848 B (292,211 B gzip), async 1,370,032 B (464,960 B gzip). Both bundles reference `emscripten-module.wasm` as an external file (`new URL(..., import.meta.url)`).

## Decision

1. **Async variant for the current prototype binding.** Our `api.fetch` uses an asyncified host function, accounting for the extra ~500KiB of measured WASM. This is an implementation choice, not an API requirement: [pinned GYK inspection](agent-runs/2026-10-21-issue11-upstream-review.md) confirms sync QuickJS with deferred guest promises and worker messaging also supports asynchronous I/O. No dependency/engine swap or saving is claimed without new implementation, teardown tests and measurement.
2. **External WASM asset, not base64.** The external asset is smaller compressed (≈378 KiB vs ≈465 KiB for async) and supports streaming instantiation and normal caching. Base64 would also inflate the main bundle and defeat cache separation.
3. **Lazy, explicit opt-in only.** The engine must not be part of the initial browser bundle or first paint. It is fetched only when a user explicitly enables JavaScript plugins (default off), so the preview's baseline remains 12 assets. The current measurement shows the incremental opt-in cost honestly rather than hiding it in the main payload.
4. **No shipping yet.** Unit 6a now proves in-browser execution of the built async engine (Chromium156) with the broker, contract and quota failures asserted; Node tests still exercise the package directly elsewhere. Emission into the staged app under the default-off seam, a CSP decision, broader browser coverage and independent security/dependency review are required first.

## Requirements before a shipping unit

- Build emits `emscripten-module.wasm` (or a hashed equivalent) with `application/wasm`, correct `Content-Type`/cache headers, and a recorded hash in the staging inventory; `check-alpha-build` must account for the new asset instead of assuming exactly 12.
- The engine loads from the same origin only, under the existing strict transport/header rules; no CDN or third-party origin.
- If a Content-Security-Policy is added later, it must explicitly allow `wasm-unsafe-eval` for this feature only; the current preview sets no CSP.
- A real Chromium/Chrome/Firefox browser test executes the representative fixture through the bundled engine, with quotas and cancellation asserted in-browser.
- Per-execution context lifecycle, memory limit, deadline, broker request/response caps and teardown are wired to the default-off setting, with an explicit user-facing warning about untrusted plugin code.
- Independent security and dependency review, plus recorded rollback and kill-switch behavior.

## Limits

- Numbers are raw/gzip sums of parts, not a transfer estimate for a specific network or cache state.
- They reflect `quickjs-emscripten` 0.32.0; a version change requires re-measurement.
- No claim is made about Safari/WKWebView memory behavior, mobile budgets or sustained multi-plugin execution.

## Rollback

This unit adds only tooling, tests and documentation. A protected revert removes them; the shipped artifact, quotas and user data are unchanged.

## Browser execution verification — unit 6a (2026-10-19)

Added an explicit opt-in asset builder (`app/alpha/scripts/pluginEngineAssets.mjs` + `buildPluginEngineAssets.mjs`), a browser fixture entry and `tests/browser/plugin-engine.spec.mjs`. The builder bundles the asyncify variant, copies the external `emscripten-module.wasm` beside it, verifies the JS references that file, and writes `plugin-engine.json` with package/version/license, MIME types, sizes and SHA-256. Output goes only under ignored `app/alpha/dist/`; the normal build, stager and preview remain 12 assets with no engine files.

Measured built assets (deterministic, no timestamps):

| File | Bytes | SHA-256 | MIME |
| --- | --- | --- | --- |
| `plugin-engine.js` | 64,698 | `02f871f4df2bb4d92a054402a752e4a51862a3a415841d2466707abe3cefb21f` | `text/javascript` |
| `emscripten-module.wasm` | 1,027,523 | `b790f3842eef48d154984cea48d35303b5c3c3696fedab4dc79f314bde005dba` | `application/wasm` |

Total JS+WASM 1,092,221 B. The manifest declares `loadPolicy:"explicit-opt-in-lazy"` and `defaultEnabled:false`.

Chromium `156.0.8078.4` on Linux ARM64: `npx playwright test tests/browser/plugin-engine.spec.mjs --project=chromium` — **9/9 pass**, 0 skipped (4.2s). The page loads the built ES module and WASM from an ephemeral loopback origin with exact MIME types; the representative test awaits the browser's actual `/emscripten-module.wasm` response and asserts200 `application/wasm`, and every request outside the fixture origin is aborted and fails the test. Scenarios: representative fixture returns one normalized group with one stream and drops its `javascript:` URL; `fetch`/`require`/`process`/`XMLHttpRequest`/`WebSocket`/`importScripts` are `undefined` inside the VM; an allowed synthetic `api.fetch` returns200/body through the broker with one transport call; a denied host is rejected (`host`) before any dispatch; an infinite loop yields `timeout`; a 64 MiB allocation under a 1 MiB budget yields `memory`; an oversized result yields `output-size`; an unexpected external request is blocked and recorded; no page errors.

The browser run surfaced one classifier gap: an in-VM allocation overshoot arrives as a catchable plugin rejection, which was reported as `plugin`. `pluginSandboxNetworkPrototype.mjs` now applies the same word-bounded OOM classification to rejections, with a retained control that a plain `"boom"` error stays `plugin`. Focused Node prototype/abuse suites: 18/18 and 12/12 pass.

A read-only Codex review found two P1s (symlink output escape, missing cross-origin test guard) and three P2s; all were fixed, with symlink-escape and external-request regressions added and the recorded JS hash refreshed (see [the review record](agent-runs/2026-10-19-unit6a-review.md)). Full verification: `npm test --prefix app/alpha` 1237/1237 pass (0 skipped, 15.1s); `npm run lint --prefix app/alpha` pass; inert build + `node scripts/check-alpha-build.mjs` pass with **12 assets and no engine files**; full `npx playwright test` 51/51 pass (1.6min). These are test-only assets: no application import, feature flag exposure, stager emission or preview change. Shipping still requires the unit 6b seam, CSP decision, independent security/dependency review and owner-gated rollout.
