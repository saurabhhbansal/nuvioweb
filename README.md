# NuvioWeb

**Independent community browser client for Nuvio-compatible accounts, add-ons, and high-quality playback.**

> **Status — source imported, as of 2026-10-18.** The pinned Alpha browser source is available in [app/alpha](app/alpha), with complete upstream history and notices. The locked install, fixture-configured build, all 1,079 upstream tests and lint pass (#5); no public application, payment service, or compute endpoint has been deployed from this repository. Not affiliated with or endorsed by Nuvio. Use only media you are authorized to access.

## What we are building

- **One Nuvio account**: reuse existing Nuvio login, profiles, installed add-ons, watch history and sync, without a second identity/password system.
- **Free client and playback**: HTTP/Stremio-compatible add-ons, supported Nuvio JS plugins, native high-resolution/HDR video and browser-local processing on capable hardware.
- **Quality-aware source selection**: preserve original resolution, codecs, HDR, audio and subtitles whenever the browser/device can play them. Explain incompatible formats instead of silently degrading.
- **Bring your own compute**: pair an easily installed open-source agent on Docker/NAS/VPS/PC or deploy supported components to your own Cloudflare account.
- **Optional hosted compute**: upfront, prepaid, bounded conversion jobs only when remote resources are required. No automatic paid fallback, no unlimited transcode promises.
- **Minimal central costs**: static hosting, bounded control APIs, no mandatory video proxy or always-running media server.

## Project documentation

- [Product charter](docs/PROJECT_CHARTER.md)
- [Product requirements](docs/PRD.md)
- [Source audit and evidence](docs/AUDIT_2026-10-18.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Milestones and implementation roadmap](docs/ROADMAP.md)
- [Security, privacy, and compliance](docs/SECURITY_PRIVACY.md)
- [Quality and acceptance gates](docs/QUALITY_GATES.md)
- [Feature support and verification evidence](docs/FEATURE_SUPPORT.md)
- [Reproduce the verified local build/test baseline](docs/BASELINE_VERIFICATION.md)
- [Cost and billing model](docs/COST_MODEL.md)
- [Upstream tracking strategy](docs/UPSTREAM.md)
- [Pinned source provenance and import contract](UPSTREAM_SOURCES.md)
- [Upstream license evidence and reuse gates](docs/UPSTREAM_LICENSE_AUDIT.md)
- [Individual implementation plans](docs/plans/README.md)
- [Issue tracker and 24 detailed plans](docs/plans/ISSUE_INDEX.md)
- [Codex/Claude agent instructions](AGENTS.md)

## Local development

Use Node 22.23.1/npm 10.9.8 (root `.node-version`). Application commands run from `app/alpha`. Follow the [baseline instructions](docs/BASELINE_VERIFICATION.md) for a clean install, inert-fixture build, tests and lint; the fixture does not connect to a real Nuvio backend.

## Development lifecycle

1. Record decisions and audit reproducibly.
2. Write the issue's plan with bounded scope and acceptance criteria.
3. Implement in a feature branch with tests; link a GitHub issue.
4. Attach executed test results to a reviewable PR; record limitations.
5. Merge, deploy to preview, canary and production only after stage-specific gates.

## Source provenance and licensing

**Recommended initial baseline:** [alphasquare404/NuvioWeb, branch web](https://github.com/alphasquare404/NuvioWeb/tree/web), GPL-3.0. The exact audited commit is imported intact in `app/alpha`, with its GPL license, notices and original history retained. See [provenance](UPSTREAM_SOURCES.md) for the source mapping and import verification. Other reference implementations can have differing license obligations (notably the AGPL-licensed Orochi project); do not combine sources without review.

## Scope

This software is designed for user-authorized sources and playback. It must not bypass DRM or facilitate access to unauthorized media. Browser CORS rules and OS/device codec limits are real constraints; do not claim universal support.
