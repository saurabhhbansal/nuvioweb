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

1. **Async variant only.** The sandbox's `api.fetch` is an asyncified host function; the sync variant cannot await a brokered host request, which the plugin API requires. The extra ~500 KiB of WASM is the cost of that capability.
2. **External WASM asset, not base64.** The external asset is smaller compressed (≈378 KiB vs ≈465 KiB for async) and supports streaming instantiation and normal caching. Base64 would also inflate the main bundle and defeat cache separation.
3. **Lazy, explicit opt-in only.** The engine must not be part of the initial browser bundle or first paint. It is fetched only when a user explicitly enables JavaScript plugins (default off), so the preview's baseline remains 12 assets. The current measurement shows the incremental opt-in cost honestly rather than hiding it in the main payload.
4. **No shipping yet.** This measurement does not prove in-browser execution of the bundled async engine; Node tests exercise the package directly. Build integration, a real browser journey, quota review and independent security review are required first.

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
