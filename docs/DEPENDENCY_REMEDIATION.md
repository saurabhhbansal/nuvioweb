# Build dependency remediation — issue #29

Resumed on the original `m1/issue-29-dependency-advisories` branch after [recovery PR #32](https://github.com/saurabhhbansal/nuvioweb/pull/32). The earlier lockfile-only patch was preserved during the audit; clean installation and all acceptance checks were subsequently executed. The [original #5 report](BASELINE_VERIFICATION.md) remains historical evidence for the pristine imported graph.

## Dependency and license delta

Source baseline: Alpha `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff`. Local patch paths are only `app/alpha/package.json` and `app/alpha/package-lock.json`; no application JS/CSS, auth, fetch, plugin, payment, compute or test assertion changes. All runtime dependency specifications are unchanged. The only direct manifest change is the development esbuild range `^0.27.3` → `^0.28.2`.

| Package | Previous exact version | New exact version | Retained declared license |
| --- | --- | --- | --- |
| `brace-expansion` | 1.1.16 | 1.1.21 | MIT |
| `css-select` | 5.2.2 | 6.0.0 | BSD-2-Clause |
| `css-what` | 6.2.2 | 7.0.0 | BSD-2-Clause |
| `esbuild` | 0.27.7 | 0.28.2 | MIT |
| `js-yaml` | 4.3.0 | 4.3.2 | MIT |
| `nanoid` | 3.3.16 | 3.3.20 | MIT |
| `postcss` | 8.5.22 | 8.5.30 | MIT |
| `postcss-selector-parser` | 7.1.4 | 7.1.6 | MIT |
| `source-map-js` | 1.2.1 | 1.2.2 | BSD-3-Clause |
| `svgo` | 4.0.2 | 4.1.0 | MIT |

Additionally, 26 optional `@esbuild/*` platform package entries move from 0.27.7 to 0.28.2. There are **36 changed versions, zero added/removed package entries, 237 total nonroot lock entries, and zero declared license changes**. css-select/css-what major transitions are transitive requirements of the reviewed SVGO update; they are not unrelated direct dependency upgrades. Every changed entry has a registry resolution and integrity hash.

All ten changed non-platform tarballs were downloaded read-only and verified against their lockfile integrity digests; their license files were inspected. After clean install, installed notice-file SHA-256 values matched those same verified tarballs. Optional platform-binary tarballs were not individually downloaded for all 26 platforms; the actual installed esbuild package reports 0.28.2 and its install/build ran successfully. This is a scoped dependency notice check, not full bundled/native-source release clearance.

The esbuild update is explicit because the non-force audit fix could not cross its previous 0.x minor range. [Upstream 0.28.1](https://github.com/evanw/esbuild/releases/tag/v0.28.1) fixes the reported Windows development-server traversal; [0.28.2](https://github.com/evanw/esbuild/releases/tag/v0.28.2) is the reviewed subsequent patch. No `npm audit fix --force` was used. Other reported package records are documented in [issue #29](https://github.com/saurabhhbansal/nuvioweb/issues/29).

## Executed verification — 2026-10-18

Node 22.23.1/npm 10.9.8 throughout:

- Non-force `npm audit fix --package-lock-only --ignore-scripts`: seven affected package records removed; one low esbuild record remained. Explicit `npm install --save-dev --package-lock-only --ignore-scripts esbuild@0.28.2` resolved that last record.
- Clean `HUSKY=0 npm ci --cache /tmp/nuvioweb-npm-cache`: passed, 212 platform-installed packages; actual esbuild version 0.28.2. No upstream Git hook installation.
- `NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build`: passed; `node scripts/check-alpha-build.mjs` verified 12 nonempty outputs, inert backend and no privileged config fields.
- Full `npm test`: **1,079 passed**, zero failures/skips, 46.7 seconds; no assertions changed.
- `npm run lint`: passed unchanged rules.
- Actual `npm audit --json` and `npm audit --omit=dev --json`: both exit 0, **zero reported advisories**, versus the historical eight build-tool package records. Root browser-tooling audit also exits 0.
- `npm run test:browser`: **4 Chromium journeys passed**, no failures/skips, 20.1 seconds locally against the updated build. Scope remains shell/errors/guest navigation/persistence, not live identity/catalog/media or device codec support.
- `node --test scripts/governance.test.mjs scripts/check-docs.test.mjs`: **15 passed**, no failures/skips. Ledger/docs/artifact and whitespace checks passed.

Application and root browser-tooling CI now fail on any reported advisory at the low threshold. Existing unit/lint, governance and browser assertions were retained. Audit feeds can change; a zero result is the observed state, not a general security guarantee. Logs and scoped tarball/license verification data are under `/tmp/nuvioweb-issue-29-logs`.

Old lockfile SHA-256: `7a42cf7e2590ed932b6d05a02f907cd09cc075f883caffebb3691ff69a2b9711`. New lockfile SHA-256: `36d5bfd1b49e732e0431f353bbf7f95a88d200efe6c7b75230c49b36f9a01306`. Original upstream history, tag and GPL notices are retained.

## Limits and rollback

No public deployment, live auth/sync, media conversion or payment was performed. Complete distribution notices/font/logo/native rights and browser/device testing remain release gates. Revert this scoped PR through the protected workflow to restore the historical #5 dependency graph; do not rewrite source history or weaken CI to merge.
