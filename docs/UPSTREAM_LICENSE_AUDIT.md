# Upstream license and notice audit — issue #1

Audited 2026-10-18 for [issue #1](https://github.com/saurabhhbansal/nuvioweb/issues/1). Scope: source provenance, declared licenses, Alpha dependency inventory and reuse constraints. This is engineering evidence, not a legal opinion or certification of every dependency. No upstream application source was imported into this repository; public upstream clones and package inspection artifacts were stored under `/tmp`. No install scripts, application builds, application tests, live account requests or deployments were executed for this audit.

## Revisions and immutable evidence

All four fetched branch tips match the earlier audit pins. A branch name alone is not an import identifier.

| Repository and inspected branch | Verified commit | Git tree | Tracked files |
| --- | --- | --- | --- |
| Alpha `web` | [5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff](https://github.com/alphasquare404/NuvioWeb/commit/5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff) | `ad9ff4cea2781cf85010f49b61c315c9bc332e86` | 605 |
| Falcon `nightly` | [34775ea5f0434f548a8287de41f946abe859b65f](https://github.com/falcononrails/NuvioWeb/commit/34775ea5f0434f548a8287de41f946abe859b65f) | `3f3cf83b9e53d0fd13bc6443b870cefde337bf0f` | 590 |
| GYK `main` | [ff5eb4565d723afac2b5493f286b6a33c8abb5f0](https://github.com/GYK-Studio/NuvioWeb/commit/ff5eb4565d723afac2b5493f286b6a33c8abb5f0) | `6a02241a24aca947d8cfa60513261ece1c5eea17` | 524 |
| Orochi `main` | [e4afb975e56cbe679bfb043957cbf6dc72c985f1](https://github.com/orochibraru/nuvio-web/commit/e4afb975e56cbe679bfb043957cbf6dc72c985f1) | `9af5949e610fae807a6a1655644e2b21e8ac7bda` | 655 |

Alpha `development` separately resolves to `abe12d19d81b670b2035b77e4b92406d354dbf02`, which differs from the selected `web` pin. Its contents were not audited or approved for import here.

Alpha, Falcon and GYK contain byte-identical GPL version 3 license texts: SHA-256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`. Their root package manifests do not supply an SPDX license field. Their README declarations identify GPL v3; this audit does not infer a project-wide `-or-later` grant from the generic license appendix. Preserve the actual grants and file notices. Sources: [Alpha LICENSE](https://github.com/alphasquare404/NuvioWeb/blob/5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff/LICENSE), [Alpha README](https://github.com/alphasquare404/NuvioWeb/blob/5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff/README.md), [Falcon LICENSE](https://github.com/falcononrails/NuvioWeb/blob/34775ea5f0434f548a8287de41f946abe859b65f/LICENSE), [GYK README](https://github.com/GYK-Studio/NuvioWeb/blob/ff5eb4565d723afac2b5493f286b6a33c8abb5f0/README.md).

Orochi supplies AGPL version 3 text, SHA-256 `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0`, and explicitly declares `AGPL-3.0-or-later` in its package manifest and README. Sources: [LICENSE](https://github.com/orochibraru/nuvio-web/blob/e4afb975e56cbe679bfb043957cbf6dc72c985f1/LICENSE), [package.json](https://github.com/orochibraru/nuvio-web/blob/e4afb975e56cbe679bfb043957cbf6dc72c985f1/package.json), [README](https://github.com/orochibraru/nuvio-web/blob/e4afb975e56cbe679bfb043957cbf6dc72c985f1/README.md).

## Alpha notices to retain

- Preserve root `LICENSE` unchanged, README upstream credits and disclaimer, original Git ancestry, and existing in-app source/license/service attribution. The FSF copyright in the license document identifies its author; it does not identify the copyright owner of the application. No separate root `NOTICE` or `COPYRIGHT` file was found in the tracked-file inventory. Do not replace contributor history with an invented application copyright statement. Sources: [README](https://github.com/alphasquare404/NuvioWeb/blob/5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff/README.md), [attribution screen](https://github.com/alphasquare404/NuvioWeb/blob/5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff/js/ui/screens/settings/licensesAttributionsScreen.js).
- Retain the Kazuhiko Arase 2009 copyright, MIT declaration and QR Code trademark notice in [assets/libs/qrcode-generator.js](https://github.com/alphasquare404/NuvioWeb/blob/5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff/assets/libs/qrcode-generator.js). Its header links the MIT terms rather than carrying their full text; include complete applicable terms in release notices.
- Alpha has no tracked `assets/fonts` files in this pin. [css/base.css](https://github.com/alphasquare404/NuvioWeb/blob/5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff/css/base.css) requests DM Sans, Inter, Open Sans and Material Icons from Google Fonts at runtime. This audit did not capture the actual browser responses or verify licenses of returned font variants. Treat deterministic font packaging, attribution and external requests as a release review item.
- Third-party logos/images and service attribution are present in [assets/icons](https://github.com/alphasquare404/NuvioWeb/tree/5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff/assets/icons) and the attribution screen. A repository GPL declaration does not establish permission to use every service logo, brand or hosted API. File-level rights and service/backend permissions remain separate questions.

## Alpha dependency inventory

Primary evidence: immutable [package.json](https://github.com/alphasquare404/NuvioWeb/blob/5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff/package.json) and [package-lock.json](https://github.com/alphasquare404/NuvioWeb/blob/5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff/package-lock.json). Lockfile version 3 has 237 non-root package entries; none lacks a `license` field. These are declared metadata, not proof that every embedded component has been correctly attributed.

All 18 direct package tarballs were read without installation. Each matched its exact lockfile integrity hash and contained a license file. Runtime package evidence:

| Exact locked package | Declared license | License/notice evidence and release action |
| --- | --- | --- |
| `dashjs@4.7.4` | BSD-3-Clause | [Exact tarball](https://registry.npmjs.org/dashjs/-/dashjs-4.7.4.tgz): `package/LICENSE.md`; retain bundled `dist/dash.all.min.js.LICENSE.txt` too, which contains additional dependency notices. |
| `hls.js@1.5.20` | Apache-2.0 | [Exact tarball](https://registry.npmjs.org/hls.js/-/hls.js-1.5.20.tgz): `package/LICENSE`, Dailymotion copyright. Preserve notice and terms. |
| `jszip@3.10.1` | MIT OR GPL-3.0-or-later | [Exact tarball](https://registry.npmjs.org/jszip/-/jszip-3.10.1.tgz): `package/LICENSE.markdown`, `lib/license_header.js`. MIT is an available reuse option; preserve its copyright/terms and bundled dependency notices. |
| `libbitsub@1.10.1` | MIT | [Exact tarball](https://registry.npmjs.org/libbitsub/-/libbitsub-1.10.1.tgz): `package/LICENSE` and `pkg/LICENSE`, Jaruwit Jaiya 2026. Source/license evidence for any internal WASM components was not exhaustively reconstructed. |
| `web-push@3.6.7` | MPL-2.0 | [Exact tarball](https://registry.npmjs.org/web-push/-/web-push-3.6.7.tgz): `package/LICENSE`, Marco Castelluccio 2015. Preserve source notices and meet applicable source-availability requirements if distributed. Its presence in dependencies does not mean it is browser-shipped. |

The exact direct development/build packages are:

| Package | Locked version | Declared license |
| --- | --- | --- |
| `@csstools/postcss-global-data` | 4.0.0 | MIT-0 |
| `@eslint/js` | 9.39.5 | MIT |
| `autoprefixer` | 10.5.4 | MIT |
| `core-js` | 3.49.0 | MIT |
| `core-js-compat` | 3.49.0 | MIT |
| `cssnano` | 7.1.9 | MIT |
| `esbuild` | 0.27.7 | MIT |
| `eslint` | 9.39.5 | MIT |
| `eslint-config-prettier` | 10.1.8 | MIT |
| `globals` | 16.5.0 | MIT |
| `husky` | 9.1.7 | MIT |
| `postcss` | 8.5.22 | MIT |
| `prettier` | 3.9.6 | MIT |

The lockfile's 237 entries group as MIT 181; MIT-0 1; Apache-2.0 16; BSD-3-Clause 5; Python-2.0 1; ISC 12; CC-BY-4.0 1; BSD-2-Clause 14; CC0-1.0 2; MIT OR GPL-3.0-or-later 1; MIT AND Zlib 1; BlueOak-1.0.0 1; MPL-2.0 1. Less common transitive entries are `argparse@2.0.1` (Python-2.0), `caniuse-lite@1.0.30001806` (CC-BY-4.0), `mdn-data@2.0.28` and `2.27.1` (CC0-1.0), `pako@1.0.11` (MIT AND Zlib), and nested `sax@1.6.1` (BlueOak-1.0.0). Their exact license texts were not individually inspected. Preserve applicable copyright, license and attribution terms for components actually redistributed; determine shipping from the built artifact rather than the dev/runtime package label.

[Alpha build.mjs](https://github.com/alphasquare404/NuvioWeb/blob/5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff/scripts/build.mjs) copies HLS, DASH and libbitsub primary license files. It does not explicitly copy DASH's bundled `.LICENSE.txt`; its core-js bundle sets `legalComments: "none"`. The script alone is insufficient evidence that complete core-js, JSZip and nested component notices reach users. Verify the generated artifact and supply a complete third-party notice/source-access mechanism before release. This issue records the gap; it does not modify the build.

The npm lock also does not inventory all prebundled native runtime code. [services/webos/runtime/media-http.cjs](https://github.com/alphasquare404/NuvioWeb/blob/5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff/services/webos/runtime/media-http.cjs) contains substantial bundled third-party code outside the package inventory. Its component-to-source/license map was not reconstructed. Preserve it during an intact history import, but do not package native sidecar executables for a browser release until separately inventoried.

## Reuse boundaries for the reference forks

**Falcon:** Root GPL v3 permits planning selective ports under compatible terms with history and notices preserved; do not treat the root license as overriding per-component licenses. Its [README credits](https://github.com/falcononrails/NuvioWeb/blob/34775ea5f0434f548a8287de41f946abe859b65f/README.md) name Alpha, Nuvio and several selectively ported forks. Retain relevant credit with any port. `@libmedia/avplayer@1.3.1` is declared LGPL-3.0-or-later in the [lockfile](https://github.com/falcononrails/NuvioWeb/blob/34775ea5f0434f548a8287de41f946abe859b65f/package-lock.json). Its [WASM notice](https://github.com/falcononrails/NuvioWeb/blob/34775ea5f0434f548a8287de41f946abe859b65f/assets/libs/avplayer-wasm-1.3.1/NOTICE.txt) identifies Gaoxing Zhao and libmedia source revision `152f629d3021fd8013efa464fcb7b55f9fbe7753`; preserve the notice, [COPYING.LGPLv3](https://github.com/falcononrails/NuvioWeb/blob/34775ea5f0434f548a8287de41f946abe859b65f/assets/libs/avplayer-wasm-1.3.1/COPYING.LGPLv3), corresponding source/build information and applicable modification/relinking rights before binary redistribution. This audit did not reproduce the WASM build. [Font NOTICE](https://github.com/falcononrails/NuvioWeb/blob/34775ea5f0434f548a8287de41f946abe859b65f/assets/fonts/NOTICE.txt) identifies JetBrains Sans copied from NuvioDesktop and embedded Philipp Nurullin copyright, but attribution to a GPL repository is not independent proof of font licensing. Verify exact font rights before porting. Preserve [Material Icons license](https://github.com/falcononrails/NuvioWeb/blob/34775ea5f0434f548a8287de41f946abe859b65f/assets/icons/LICENSE-material-icons.txt) and [Google notice](https://github.com/falcononrails/NuvioWeb/blob/34775ea5f0434f548a8287de41f946abe859b65f/assets/icons/NOTICE.txt) with those icons.

**GYK:** Root GPL v3 and [package manifest](https://github.com/GYK-Studio/NuvioWeb/blob/ff5eb4565d723afac2b5493f286b6a33c8abb5f0/package.json) permit investigating a compatible selective port; plugin runtime security and backend permissions remain separate gates. The [pnpm lock](https://github.com/GYK-Studio/NuvioWeb/blob/ff5eb4565d723afac2b5493f286b6a33c8abb5f0/pnpm-lock.yaml) resolves the additional runtime packages `assjs@0.1.10`, `cheerio@1.2.0`, `crypto-js@4.2.0`, and `quickjs-emscripten@0.32.0`, plus QuickJS core/FFI and debug/release WASM variants. Exact registry version metadata and tarball license-file presence were checked for these four and `@jitl/quickjs-wasmfile-release-sync@0.32.0`; all declare MIT. Sources: [assjs metadata](https://registry.npmjs.org/assjs/0.1.10), [cheerio metadata](https://registry.npmjs.org/cheerio/1.2.0), [crypto-js metadata](https://registry.npmjs.org/crypto-js/4.2.0), [QuickJS metadata](https://registry.npmjs.org/quickjs-emscripten/0.32.0), [WASM variant metadata](https://registry.npmjs.org/@jitl/quickjs-wasmfile-release-sync/0.32.0). This limited check does not clear every transitive or embedded WASM component. Preserve package/engine notices with a future port and separately review individual plugins: a runtime's license grants no rights to arbitrary plugin code or its media. Preserve GYK's [Material Icons license](https://github.com/GYK-Studio/NuvioWeb/blob/ff5eb4565d723afac2b5493f286b6a33c8abb5f0/assets/fonts/LICENSE-material-icons.txt) if copying that font.

**Orochi:** Retain as an architectural reference for this baseline. Its AGPL differs from the selected GPL baseline. AGPL section 13 addresses modified programs used over a network and offers of corresponding source; GPL/AGPL section 13 also provides a limited combination route, so they should not be described as universally incompatible. Any actual port needs an explicit component/combined-work assessment, notices and source-access design; do not relabel copied Orochi code GPL-only. This issue imports none. Primary terms are in the immutable LICENSE links above; Orochi's README explicitly describes offering source to users of a modified network service.

These reuse notes interpret license text conservatively for engineering scope. GNU web pages timed out in the browsing tool; actual GPL/AGPL texts were read from the verified upstream Git objects instead. [Mozilla's official MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) was retrieved and supports the file-level/source-notice distinction, including its distinction between server functionality and client code distribution. The exact shipped composition still requires review.

## Import gate versus release gate

The evidence supports an intact, pinned Alpha source/history import with original notices and a recorded source manifest. It does not establish full release clearance. No missing top-level license or pin mismatch blocks that bounded import.

Before distributing an app release, resolve generated-artifact license/notice completeness, applicable font/logo rights, dependencies and any native binary provenance actually included, and an accessible matching-source mechanism. Before public operation, separately verify permission for upstream identity/sync services and other hosted APIs; GPL source permission does not grant backend capacity, trademark permission or media rights. Falcon WASM/font and GYK plugin ports need their own component review; Orochi code reuse needs a deliberate AGPL decision. No compute or payment action is authorized by this audit. See [UPSTREAM_SOURCES.md](../UPSTREAM_SOURCES.md) for the import contract and the [issue plan](archive/plans/issues/issue-1.md) for scope and rollback.

## Commands and observed results

Commands below ran during this audit; read-only network commands required the environment's network escalation. Initial un-escalated `git ls-remote` failed with `Could not resolve host: github.com`; the escalated retry succeeded.

```sh
git ls-remote https://github.com/alphasquare404/NuvioWeb.git refs/heads/web refs/heads/development
git clone --filter=blob:none --single-branch --branch web https://github.com/alphasquare404/NuvioWeb.git /tmp/nuvioweb-license-alpha
git clone --filter=blob:none --single-branch --branch nightly https://github.com/falcononrails/NuvioWeb.git /tmp/nuvioweb-license-falcon
git clone --filter=blob:none --single-branch --branch main https://github.com/GYK-Studio/NuvioWeb.git /tmp/nuvioweb-license-gyk
git clone --filter=blob:none --single-branch --branch main https://github.com/orochibraru/nuvio-web.git /tmp/nuvioweb-license-orochi
```

All four clones exited 0. For each, Python `subprocess.check_output` ran `git rev-parse HEAD`, `git rev-parse HEAD^{tree}` and `git ls-files`; results are in the revision table. Python `hashlib.sha256` over root LICENSE produced the hashes above. Python JSON inspection counted every non-root `packages` entry and its license; results were 237, zero missing, and the inventory above. Source reads used `cat`, `sed` and `rg`; an attempted read of nonexistent `js/config/appIdentity.js` failed, and was not used as evidence. Large minified native bundle search output was truncated, so it is not a complete file-level audit.

The following exact verification script ran successfully (exit 0) against all direct Alpha package tarballs, without npm installation or execution:

```python
import urllib.request,json,tarfile,io,concurrent.futures,hashlib,base64,pathlib
roots=pathlib.Path('/tmp/nuvioweb-license-alpha');p=json.loads((roots/'package.json').read_text());lock=json.loads((roots/'package-lock.json').read_text())['packages']
def verify(name):
 x=lock['node_modules/'+name];b=urllib.request.urlopen(x['resolved'],timeout=20).read();alg,digest=x['integrity'].split('-',1);assert base64.b64encode(hashlib.new(alg,b).digest()).decode()==digest;return name
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:print('ALPHA DIRECT INTEGRITY PASS',len(list(ex.map(verify,list(p['dependencies'])+list(p['devDependencies'])))))
for name,v in [('assjs','0.1.10'),('cheerio','1.2.0'),('crypto-js','4.2.0'),('quickjs-emscripten','0.32.0'),('@jitl/quickjs-wasmfile-release-sync','0.32.0')]:
 d=json.load(urllib.request.urlopen('https://registry.npmjs.org/'+name+'/'+v,timeout=20));b=urllib.request.urlopen(d['dist']['tarball'],timeout=20).read();t=tarfile.open(fileobj=io.BytesIO(b));paths=[m.name for m in t.getmembers() if m.isfile() and any(x in m.name.lower() for x in ['license','copying','notice','copyright'])]; print(name,v,d.get('license'),d.get('gitHead'),paths)
```

Observed: `ALPHA DIRECT INTEGRITY PASS 18`; five GYK-related version records each declared MIT and contained `package/LICENSE`. A preceding tarfile inspection read the Alpha direct license texts and notice paths summarized above. Transitive tarball contents, full bundled-source attribution, build outputs and browser behavior remain unverified. No application test result is claimed.
