# Upstream provenance and import contract

Status: source audit for [issue #1](https://github.com/saurabhhbansal/nuvioweb/issues/1), verified 2026-10-18. **No application source is imported by this document.** Source import belongs to [issue #4](https://github.com/saurabhhbansal/nuvioweb/issues/4).

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
| Imported commit / PR | Pending #4 |
| Source-license evidence | Root `LICENSE`; see the [license audit](docs/UPSTREAM_LICENSE_AUDIT.md) for notices, assets, dependencies and reuse restrictions |

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
