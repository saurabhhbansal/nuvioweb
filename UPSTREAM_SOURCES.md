# Upstream provenance and import contract

Status: Alpha source imported intact under `app/alpha` for [issue #4](https://github.com/saurabhhbansal/nuvioweb/issues/4), verified 2026-10-18. The prior [issue #1](https://github.com/saurabhhbansal/nuvioweb/issues/1) audit governs reuse and release gates. Application build/browser support remains unverified until its own evidence is recorded.

## Primary baseline

| Field | Verified value |
| --- | --- |
| Repository | https://github.com/alphasquare404/NuvioWeb.git |
| Reference branch | `web` (discovery only; never the import input) |
| Commit | `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff` |
| Git tree | `ad9ff4cea2781cf85010f49b61c315c9bc332e86` |
| Tracked entries | 605 at the pinned commit |
| Reachable commits | 999 in the complete fetched `web` history |
| Original authors and history | Preserve through a nonsquashed Git subtree import |
| Destination | `app/alpha`; confirmed by the owner on 2026-10-18 |
| Imported commit | `920ae80ec4c1aef3f1fd6755e2e6b45ca5e83f66` (nonsquashed subtree merge) |
| Import PR | [#28](https://github.com/saurabhhbansal/nuvioweb/pull/28), merge commit required |
| Immutable upstream tag | `upstream/alpha-web-5624da2` |
| Source-license evidence | [Preserved Alpha LICENSE](app/alpha/LICENSE); see the [license audit](docs/UPSTREAM_LICENSE_AUDIT.md) for notices, assets, dependencies and reuse restrictions |

The observed `web` tip matches the earlier [source audit](docs/AUDIT_2026-10-18.md). Preserve this SHA even if the branch moves. Importing a newer commit requires a new audit and explicit plan update.

## Import procedure for #4

Run from a clean feature branch after #1 is merged and the layout is confirmed. The following commands describe the owner-approved `app/alpha` layout; #4 records the actual import and verification results.

```bash
git remote add alpha https://github.com/alphasquare404/NuvioWeb.git
git fetch alpha web
git cat-file -e 5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff^{commit}
git show --no-patch --format=fuller 5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff
git subtree add --prefix=app/alpha 5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff -m "Import pinned Alpha web baseline with complete history"
git tag upstream/alpha-web-5624da2 5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff
```

If `alpha` already exists, check `git remote get-url alpha` and use the existing remote only when its URL matches. Fetch complete ancestry; do not use a shallow clone or `--squash`. The import commit must have the upstream pin as a parent, keeping original authors, copyright-bearing commits and source blobs reachable in this repository. Preserve the immutable mapping in this file even if a tag is deleted. Push the upstream tag along with the reviewed import branch.

### Required file and history checks

Before any baseline fixes, assert identical upstream and imported trees:

```bash
git rev-parse 5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff^{tree}
git rev-parse HEAD:app/alpha
git diff --exit-code 5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff^{tree} HEAD:app/alpha
git merge-base --is-ancestor 5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff HEAD
git ls-tree -r HEAD:app/alpha
git fsck --full
```

The two tree IDs must both equal `ad9ff4cea2781cf85010f49b61c315c9bc332e86`. Tree equality covers content, file names and Git file modes, including ignored-but-tracked upstream assets. A nonempty diff or missing ancestry blocks #4. Record the import commit SHA, tree IDs and actual command results here and in its PR. Application install/build/lint/tests remain #5 and must not be inferred from tree equality.

## Preservation and distribution gates

Keep the complete upstream tree intact at the import commit, including `LICENSE`, `README.md`, `CONTRIBUTING.md`, source comments, asset notices, `package.json` and `package-lock.json`. Do not substitute our independent project README for upstream attribution. Do not rewrite the original authors or represent the imported source as newly authored here.

Preserve dependency license texts and notices when producing distributable bundles; a lockfile license field alone is insufficient. The [license audit](docs/UPSTREAM_LICENSE_AUDIT.md) identifies verified evidence and outstanding checks. Package installation and artifact-level notice generation/review belong to #5 and the release gate. Keep any unresolved asset, font, binary or dependency rights visible; source import does not authorize production publication, commercial API use or branding.

Local patches must name the original path, source SHA and reason in their PR. A release must expose corresponding source and applicable notices using the reviewed licensing plan; do not distribute only a minified bundle without the required source access.

## Other references

| Repository / branch | Audited commit | Reuse rule |
| --- | --- | --- |
| `falcononrails/NuvioWeb` / `nightly` | `34775ea5f0434f548a8287de41f946abe859b65f` | Reference only for now; port specific files/commits after license, dependency and browser tests |
| `GYK-Studio/NuvioWeb` / `main` | `ff5eb4565d723afac2b5493f286b6a33c8abb5f0` | Reference only for now; audit QuickJS/WASM and network adapter dependencies before plugin reuse |
| `orochibraru/nuvio-web` / `main` | `e4afb975e56cbe679bfb043957cbf6dc72c985f1` | Separate AGPL reference; no code copied under the Alpha-only import approval |

Every later port needs its own source URL, immutable SHA, original path, local destination, license/notice inventory, patch description and tested capability evidence. The native references in [upstream tracking](docs/UPSTREAM.md) have no import approval in #1.

## Rollback

Revert the scoped import PR through GitHub, preserving the upstream history and mapping. A subtree import is a merge commit; inspect its parents and use `git revert -m 1 <import-merge-sha>` when reverting that commit directly. Never rewrite shared history or force-push to remove attribution. Reverting these documents changes no runtime behavior.

## Executed import evidence — issue #4

- `git ls-remote alpha refs/heads/web` — tip still `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff`.
- `git subtree add --prefix=app/alpha 5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff -m 'Import pinned Alpha web baseline with complete history (#4)'` — exit 0; commit `920ae80ec4c1aef3f1fd6755e2e6b45ca5e83f66`, parents `bcd994f2fd34529cbe084a923545e2a93946aa05` and the upstream pin.
- `git rev-parse HEAD:app/alpha` at import — `ad9ff4cea2781cf85010f49b61c315c9bc332e86`. Tree diff against upstream returned exit 0 with no changes.
- `git merge-base --is-ancestor 5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff HEAD` and `git fsck --full` — exit 0.
- `git ls-tree -r HEAD:app/alpha | wc -l` — 605; `sha256sum app/alpha/LICENSE` — `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`.

The application subtree has no local patches in #4. The source-only import uses an ordinary PR merge, preserving the subtree's second-parent ancestry; never squash this import PR. See the [capability evidence matrix](docs/FEATURE_SUPPORT.md) for the distinction between imported code and validated behavior.

## Baseline verification — issue #5

Node 22.23.1/npm 10.9.8, clean locked install, configured inert-fixture build, all 1,079 upstream tests and lint passed locally. [Baseline evidence](docs/BASELINE_VERIFICATION.md) records the initial default-config test failure and release blockers. No local patches were made under `app/alpha`; its original tree/lockfile/source remains identical. Project-owned additions are root toolchain/CI, build fixture, artifact checker and documentation.

## Local dependency patch — issue #29

The pristine import commit/tag remains unchanged. #29 modifies only `app/alpha/package.json` (esbuild development range) and `app/alpha/package-lock.json` (36 resolved build/platform version changes). Runtime dependency specifications, JS/CSS/tests and license files are retained. The [dependency remediation report](docs/DEPENDENCY_REMEDIATION.md) records exact versions, integrity/license checks, old/new lock hashes, observed advisory results and rollback. Earlier “no local patches” statements describe #4/#5, not the post-remediation tree.

## Local source-outcome presentation patch — issue #9

The original pin/import history/tag and GPL notices remain intact. Issue #9 changes `app/alpha/js/ui/screens/stream/streamScreen.js`, `app/alpha/css/components.css`, `app/alpha/css/desktop.css` and `app/alpha/res/values/strings.xml` to retain unsuccessful source outcomes and render escaped/localized retry guidance. Actual request transport/destinations, auth/session, plugin sandbox, compute/payment code and upstream test assertions are unchanged. [Legal fixture/browser evidence](docs/ADDON_INTEROPERABILITY.md) records the red→green regression and playback limits. Together with #29, these were the six local Alpha patch paths after #9; earlier tree-equality/no-source-patch statements describe historical import/baseline checkpoints.

## Local source-capability projection — issue #10 (in progress)

Adds `app/alpha/js/core/streams/sourceCapabilities.js` and its `.test.mjs`, modifies `js/data/repository/streamRepository.js`, `js/core/streams/streamList.js` and `js/ui/components/browserStreamSourceCard.js` under the same subtree, and extends the existing #9 CSS/default-string paths. These eleven total local Alpha paths include #29 metadata, #9 UI and #10 declarations/predictions/tests. No original history/license rewrite or transport/auth/engine policy change. [Contract and evidence](docs/SOURCE_CAPABILITIES.md) distinguish provider metadata, browser predictions and actual playback. #10 remains incomplete pending realistic quality/adaptive/device evidence.
