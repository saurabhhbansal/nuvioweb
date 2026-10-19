# Issue #11 unit 6b-1 asset emission review — 2026-10-19

Reviewer: Codex CLI 0.163.0, read-only. Scope: `main/257640c...feat/issue-11-engine-assets` (opt-in engine asset build/stager emission). Automated review, not independent human approval.

## Findings and dispositions

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | P2 | Only manifest presence was checked; orphan JS/WASM directories or stale siblings could pass opt-in enforcement. | Fixed. The validator inspects the complete `assets/plugins` root: empty (opt-out) only, otherwise manifest plus exactly the selected version directory; orphan/sibling regressions added. |
| 2 | P2 | The immutable directory name was not recomputed from content, so changed assets with updated manifest hashes could reuse the old URL. | Fixed. `sha256(jsSha:wasmSha).slice(0,16)` must equal the directory; same-length tamper and unbound-directory regressions added. |
| 3 | P2 | Global `Cache-Control: no-cache` merged with the immutable rule; `nosniff` was duplicated. | Fixed. Engine rules unset inherited `Cache-Control` before setting immutable and rely on the global `nosniff`. Pages unset semantics are relied upon but not deployed-verified here. |
| 4 | P2 | Opt-in staging omitted complete engine/wrapper notices. | Fixed. The three MIT license files are copied under `third-party/`, listed in `SOURCE.txt` and included in the staged inventory only when engine assets are staged. |
| 5 | P2 | Installer wrote the manifest through any pre-existing symlink and did not prune stale version directories. | Fixed. Installer rejects symlinked assets/plugins roots, removes stale hex directories, rejects unknown content and publishes the manifest through a temp file + atomic rename. |

No P0/P1 findings; no new dependency, network destination, credential recipient, privilege or cost. The review confirmed the default build remains inert and the 6b-1/6b-2 split does not claim an app seam or CSP/security-review completion.

## Verification after fixes

- Default build/check: 12 baseline assets, no engine files, no bundle references.
- Opt-in build/check: versioned dir `ffd052f2ddae417d`, total 1,092,221 B, hashes/MIME verified.
- Opt-in staging: only manifest + version dir, notices and `SOURCE.txt` entries present; default staging excludes all of it.
- Focused tests 12/12; app tests 1238/1238; lint/docs/ledger/whitespace pass.

## Limits

No upload or Cloudflare deployment, so `_headers` matching/unset behavior remains documented rather than hosted-verified. No application execution, flag source, CSP or independent security review yet.
