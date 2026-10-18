# Upstream tracking and provenance strategy

The [pinned provenance contract](../UPSTREAM_SOURCES.md) defines the exact baseline and history-preserving import checks. See the [license evidence audit](UPSTREAM_LICENSE_AUDIT.md) before reusing source or producing release artifacts. Issue #4 imports the pinned Alpha tree intact under `app/alpha`; the contract records its import commit and ancestry checks. Build and runtime validation remain separate gates.

## Repositories monitored

- Primary baseline: https://github.com/alphasquare404/NuvioWeb (web and development).
- Advanced playback reference: https://github.com/falcononrails/NuvioWeb (nightly).
- JS plugin runtime reference: https://github.com/GYK-Studio/NuvioWeb (main).
- Native behavior reference: https://github.com/NuvioMedia/NuvioTVSmart.
- Enhanced native reference: https://github.com/yesnt10/NuvioMobile-Enhanced (enhanced).
- Separate architecture reference: https://github.com/orochibraru/nuvio-web (main).

## Process

1. Pin initial source commit SHA and origin URL at import in UPSTREAM_SOURCES.md.
2. Scheduled job compares published commits. It creates/updates review issues rather than auto-merging divergent branches.
3. Label changes as critical bugfix, compatible feature, incompatible change, native-only feature, or no-op for browser.
4. Port selected changes in bounded PRs with attribution and original PR/commit references.
5. Run auth, add-on, plugin, quality/player, security and PWA regression suites before accepting.
6. Keep a feature parity matrix and unresolved compatibility cases visible.

## Licensing

Alpha and several forks contain GPL-3.0 source; Orochi reports AGPL-3.0-or-later. Review actual file-level and dependency licenses. Never strip copyright, warranty or source-availability notices. Publishing an independent browser app does not automatically authorize third-party paid use of Nuvio's hosted backend or the Nuvio brand.

## Reliability

Do not blindly auto-merge from unrelated forks. Maintain staging, canary and rollback. Avoid live dependency on moving upstream branches or build-time CDN assets without integrity pinning.
