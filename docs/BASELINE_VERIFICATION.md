# Alpha baseline verification — issue #5

Verified locally on 2026-10-18 using Node **22.23.1**, npm **10.9.8**, Linux, and the intact Alpha `web` pin `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff`. Source import: [PR #28](https://github.com/saurabhhbansal/nuvioweb/pull/28). [Issue plan](plans/issues/issue-5.md), [source provenance](../UPSTREAM_SOURCES.md), [feature matrix](FEATURE_SUPPORT.md).

## Reproduce the verified baseline

Use the exact version in root `.node-version`; its bundled npm must report 10.9.8. From the repository root:

```bash
node --version
npm --version
cd app/alpha
HUSKY=0 npm ci
NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build
node ../../scripts/check-alpha-build.mjs
npm test
npm run lint
```

`HUSKY=0` prevents upstream's nested prepare script from installing Git hooks into our parent repository; other install lifecycle scripts remain enabled. Local runs used `--cache /tmp/nuvioweb-npm-cache` because the workspace restricts writes outside the repository and `/tmp`. CI uses the normal runner cache.

The fixture contains only an `example.invalid` backend and a fake public anon value. Building reads those strings and makes no backend request. This configuration is for tests, not usable hosted login. Never put server secrets or private credentials in browser build properties. Use of a real hosted Nuvio backend remains gated by #3.

## Results and the initial failure

| Required check | Initial upstream/default build | Final configured fixture build |
| --- | --- | --- |
| Clean locked install | Passed; 212 platform-installed packages | Same unchanged lockfile/install |
| `npm run build` | Passed with blank example backend | Passed with inert explicit backend |
| Artifact/config check | Not part of upstream command | 12 nonempty expected assets; fixture URL and no privileged runtime fields |
| `npm test` | 1,078 passed, 1 failed, 0 skipped | **1,079 passed, 0 failed, 0 skipped** |
| `npm run lint` | Passed | No application source/config changes after this pass |

The single failing test was `scripts/envProperties.test.mjs`, “the bundle carries the configuration it was built with.” It requires a populated HTTP(S) backend URL in `dist/app.bundle.js`, while the tracked `local.example.properties` leaves that URL empty. The isolated existing test failed consistently after the default build and passed after the inert-fixture build. No auth implementation, source files, test selection, assertions, lint rules or dependencies were changed to obtain the pass. Running `npm test` before building cannot satisfy tests that read `dist`.

Expected distribution assets include the HTML shell, app/core-js bundles, service worker, runtime config, manifest, HLS/DASH libraries, subtitle WASM and three copied library license files. The build embeds a timestamp, so this evidence establishes reproducible commands/toolchain and output structure, not byte-identical bundles between runs.

Application CI runs the same clean install, fixture build, artifact check, complete tests and lint, with read-only permissions, pinned actions and a 15-minute cap. It does not deploy or upload a release artifact. The PR's Checks tab records the durable Node 22 result; local logs were captured under `/tmp/nuvioweb-issue-5-logs`.

## Remaining security and distribution gates

`npm audit --json` reported eight affected package records: brace-expansion, esbuild, js-yaml, nanoid, postcss, postcss-selector-parser, source-map-js and svgo (5 high, 2 moderate, 1 low). The exact runtime-only command `npm audit --omit=dev --json` reported zero advisories. Build tools still require remediation, tracked in [issue #29](https://github.com/saurabhhbansal/nuvioweb/issues/29); zero runtime findings does not prove all bundled/native code is safe. Primary reports include [esbuild's Windows development-server issue](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr), [PostCSS's map-file issue](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), and [brace-expansion resource exhaustion](https://github.com/advisories/GHSA-mh99-v99m-4gvg). No automatic dependency updates were applied in the baseline PR.

Actual `dist` inventory contains `assets/libs/hls.js.LICENSE`, `assets/libs/dashjs.LICENSE.md`, and `assets/libs/libbitsub.LICENSE`. Complete GPL/source access, DASH bundled dependency notices, core-js/JSZip notices, QR terms, font/logo rights and included native components still require the [release license review](UPSTREAM_LICENSE_AUDIT.md). Passing build/tests does not clear that gate or approve public publication. The original package-lock SHA-256 remains `7a42cf7e2590ed932b6d05a02f907cd09cc075f883caffebb3691ff69a2b9711`.

No real account login/sync, media playback, browser/device codec support, Cloudflare deployment, payment, or compute capability is claimed. Revert the scoped #5 PR to remove this project's CI/tooling/fixture; the pristine import remains in history for comparison and rollback.
