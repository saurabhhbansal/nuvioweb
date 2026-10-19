# Unit 6a technical review — Codex CLI, read-only

Date: 2026-10-19. Reviewer: Codex CLI 0.163.0, `codex exec --sandbox read-only`, `CODEX_HOME` inside the workspace. Scope: `git diff 4eeff8e...HEAD` for PR #66 (issue #11 unit 6a), plus the surrounding plugin contract, broker and sandbox prototypes. This is an **automated technical review, not independent human approval** and not a production sandbox-safety assessment.

## Findings and dispositions

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | P1 | Output confinement was lexical only; a symlink ancestor under `app/alpha/dist` could redirect the recursive delete/write outside `dist`. | Fixed. `resolveSafeOutdir` now resolves the real dist root and the real parent directory, rejects paths that leave the real dist tree, and rejects a symlinked output target. Regression: a symlinked outdir is rejected and the outside temp directory stays empty. |
| 2 | P1 | The browser fixture did not observe or block unexpected origins, so an accidental remote engine/asset fetch would not fail the test. | Fixed. The spec installs a context route guard before navigation, aborts and records every non-fixture origin, asserts zero violations in each test, and adds a dedicated external-request regression. |
| 3 | P2 | The WASM `200 application/wasm` assertion used a server-side constant, not the browser's observed response. | Fixed. The representative test now awaits the actual browser response for `/emscripten-module.wasm` and asserts URL requests plus status and `content-type` from that response. |
| 4 | P2 | Recorded JS size/hash were stale (`64,623 B`), not the builder's current output. | Fixed. Rebuilt assets measure `64,698 B`, SHA-256 `02f871f4df2bb4d92a054402a752e4a51862a3a415841d2466707abe3cefb21f`, total `1,092,221 B`; evaluation/plan/ledger/tracker/continuity updated. |
| 5 | P2 | Teardown dereferenced `server` even if setup failed and left the fallback timer uncleared. | Fixed. `afterAll` returns when setup did not create the server and clears the timeout after closure. |

Codex also reported no P0, found no host escape, proxy, credential/header leak, remote code loading or shipped-artifact execution path, confirmed MIT/devDependency-only licensing, and confirmed the documentation does not claim default-enabled or shipped capability.

## Re-verification after fixes

- `node --test app/alpha/scripts/pluginEngineAssets.test.mjs` — 6/6 pass, including the symlink-escape regression.
- `npx playwright test tests/browser/plugin-engine.spec.mjs --project=chromium` — 9/9 pass (4.2 s), including the external-request guard and the real WASM response assertion.
- `node --test app/alpha/scripts/pluginSandboxAbuse.test.mjs` — 12/12 pass (OOM classification and plain-boom control).
- `npm test --prefix app/alpha` — 1236/1236 pass, 0 skipped (15.1 s).
- `npm run lint --prefix app/alpha` — pass.
- Inert build + `node scripts/check-alpha-build.mjs` — pass, 12 assets, no engine files.
- Full `npx playwright test` — 51/51 pass (1.6 min).

## Verdict

After these corrections Codex's verdict applies to the merged state: the application boundary remains intact and this test-only unit introduces no observed shipping exposure. It does not establish production sandbox safety, plugin compatibility or permission to ship the engine; unit 6b and independent security/dependency review remain required.
