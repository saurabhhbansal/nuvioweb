# Issue #5: [M1][P0] Reproduce upstream install, build, lint and unit tests

**Plan status:** Implemented and locally verified on `m1/issue-5-reproducible-baseline`; remote CI is the remaining merge gate. #4 merged as PR #28 with source ancestry/tree equality rechecked on main.
**Milestone:** M1 · **Priority:** P0  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/5  
**Workstream:** [M1 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Reproduce upstream install, build, lint and unit tests

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

M1-01; M0-02

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Concrete implementation plan (2026-10-18)

Dependencies #2 and #4 are merged. Baseline source is the intact Alpha pin under `app/alpha`; record failures before fixes. The installed Node 22 toolchain is v22.23.1 with npm 10.9.8, matching upstream's Node 22 Docker major. Use these exact versions locally and in CI.

### Target files and contracts

- `scripts/check-alpha-build.mjs`: verify required build outputs, fixture backend and absence of privileged runtime config fields.
- Root `.node-version`: exact Node version; `.github/workflows/alpha.yml`: read-only, pinned-action app baseline job with `working-directory: app/alpha`, locked install/build/full tests/lint and expected artifact checks.
- `tests/fixtures/build.properties`: non-live public build configuration (`example.invalid`), so the existing bundle-configuration regression test exercises a configured build without hosted identities or credentials.
- `docs/BASELINE_VERIFICATION.md`: exact toolchain/commands, baseline failures and final outcomes; generated output is not deployed.
- `docs/FEATURE_SUPPORT.md`, `README.md`, `TRACKER.md`, `UPSTREAM_SOURCES.md`: verified build/test status, local development commands and local patch inventory.
- `app/alpha/package-lock.json` remains the original locked graph unless an actual install failure requires a separately explained correction. Avoid dependency upgrades or unrelated formatting.
- Only make minimal source/test/script changes when a required command demonstrates a reproducible baseline failure; record source pin/original path/reason and meaningful regression evidence.

No auth, payment, plugin sandbox, remote-fetch behavior, compute isolation, product UI redesign or production infrastructure changes. Surface sensitive defects as reviewable blockers rather than bypassing human review. No new runtime API contracts are introduced by CI/tooling.

### Sequence and explicitly required commands

1. Record `node --version` / `npm --version`; use Node 22.23.1/npm 10.9.8, clean lockfile and no private local properties.
2. Run `HUSKY=0 npm ci` from `app/alpha` with npm cache under `/tmp`. Husky is disabled solely to avoid installing subtree hooks into the parent repository; npm lifecycle/dependency scripts otherwise run normally.
3. Run upstream `npm run build`, `npm test`, and `npm run lint` without test selection/skips; retain exit codes and baseline logs under `/tmp` before fixing failures. The suite uses local HTTP servers and mocked upstream requests, without live account credentials.
4. For demonstrated failures, use a targeted reproducible command, fix the smallest cause and rerun the affected check, then the complete affected suite. Do not hide failures with ignores or relaxed assertions.
5. Add CI executing those same commands and checking expected nonempty `dist` assets. Keep read-only contents permissions, pinned checkout/setup-node actions, bounded timeout, no deployment/secrets and no publishable artifact upload while release gates remain unresolved.
6. Verify generated runtime configuration contains no privileged key fields, inventory retained/missing distribution notices, and retain explicit release blockers from #1. Building does not authorize public hosted API use or establish browser/device compatibility.
7. Run root documentation tests/checker and `git diff --check` for local patches; open a scoped draft PR with real evidence. Require green application and docs CI before the authorized merge. Recheck main sync afterward.

### Risks, costs and rollback

Dependency install uses public registry network and upstream install scripts, not cloud production accounts. Test HTTP servers bind loopback; no media downloads, paid resources or private identities are used. `dist` and `node_modules` stay ignored. Preserve all upstream notices/history. Revert this scoped PR to remove CI/tooling/local patches while retaining #4's pristine import commit for comparison; no deployed release requires rollback.

## Functional acceptance criteria

- [x] Reproducible clean build produces expected dist artifact
- [x] Full upstream tests and lint pass with the documented inert configuration; inherited dependency advisories tracked in #29
- [ ] CI evidence available on PR

## Verification design

npm ci, npm run build, npm test, npm run lint; record actual results, don't infer pass.

**Evidence that must be attached before closure:** commands actually run, exit codes and assertions, tested browser/device versions if applicable, failures and workarounds. Do not mark a box checked based on static inspection alone.

## Threat, cost, privacy and licensing review

Existing Nuvio hosted auth is an external service; avoid secrets in build artifacts, account leakage, legal-license regressions and broken browser caching.

Confirm no secrets are introduced, provider/API costs are bounded, third-party source licenses are preserved and users receive no unexpected paid action. Escalate platform authorization or payment-policy uncertainties instead of guessing.

## Telemetry, rollback and ownership

Capture bounded, redacted failure counters and trace IDs without exposing access tokens, media URL queries or personal playback metadata.

**Rollback:** Revert feature changes to pinned imported upstream baseline, redeploy previous staging artifact, and preserve auth/token isolation.

## Definition of done

- [x] Pinned Node/npm, original lockfile and public build-config contract verified.
- [ ] Remote CI evidence must pass before closure; local command evidence is recorded below.
- [x] Existing secret-allowlist/bundle regression tests pass; no live identity, deployment or paid action.
- [x] Baseline evidence, source provenance, feature matrix and local instructions updated.
- [ ] Reviewed pull request linked to issue, with rollout and rollback evidence.

## Baseline failure and scoped resolution

Initial `HUSKY=0 npm ci` passed, `npm run build` passed, and `npm run lint` passed. Initial `npm test` reported 1,078/1,079 passed (one failure, zero skips): `scripts/envProperties.test.mjs` requires a nonempty backend URL embedded in the bundle, while default `local.example.properties` has `NUVIO_SUPABASE_URL=`. The isolated command `node --test --test-name-pattern='the bundle carries the configuration it was built with' scripts/envProperties.test.mjs` reproduced the exact failure with one failing test.

Ranked predictions: (1) explicit non-live build configuration makes the existing test pass; (2) if esbuild drops a populated value, it still fails with that fixture; (3) if a build/test race or stale output is responsible, a completed identical rebuild would remove the failure independent of configuration. The first cause is tested with a checked-in inert properties fixture; no auth/runtime code or assertions are relaxed. CI and documented baseline commands use the fixture during build. Dependency advisories from install are inventoried separately as a release gate; no automatic upgrades/lockfile changes in this baseline.

## Final local verification (2026-10-18)

- Node `v22.23.1`, npm `10.9.8`. `HUSKY=0 npm ci --cache /tmp/nuvioweb-npm-cache` — exit 0, 212 installed packages. npm counts installed platform packages differently from the lockfile's full 237-entry platform inventory.
- Original/default `npm run build` — exit 0. Original `npm test` — exit 1, 1,078 passed / 1 failed / 0 skipped due to the documented empty build-config URL. Original `npm run lint` — exit 0.
- `NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build` — exit 0; `node --test --test-name-pattern='the bundle carries the configuration it was built with' scripts/envProperties.test.mjs` — 1 passed / 0 failed.
- Complete `npm test` after configured build — exit 0, **1,079 passed / 0 failed / 0 skipped**, 41.2 seconds locally. The original test commands/assertions/source remain unchanged.
- `node scripts/check-alpha-build.mjs` from root — 12 nonempty required assets, exact inert backend config, and absence of privileged config fields verified.
- `npm audit --json` — exit 1, 8 affected package records (5 high, 2 moderate, 1 low); `npm audit --omit=dev --json` — exit 0, zero runtime advisories. [Issue #29](https://github.com/saurabhhbansal/nuvioweb/issues/29) tracks remediation before release; no dependency upgrades in #5.
- `git diff --exit-code -- app/alpha` — exit 0, including an unchanged package-lock SHA-256 `7a42cf7e2590ed932b6d05a02f907cd09cc075f883caffebb3691ff69a2b9711`.

Full command logs were captured under `/tmp/nuvioweb-issue-5-logs`; this committed report and the PR's durable CI run are the review evidence. No browser/device compatibility or public-service authorization is inferred from unit tests.
