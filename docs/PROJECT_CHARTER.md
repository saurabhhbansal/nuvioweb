# NuvioWeb — project charter

Status: approved product direction; **planning only**, not a shipped service. Last reviewed: 2026-10-18.

Independent, community-led browser/PWA client for existing Nuvio accounts, add-ons and media, prioritizing high-quality legal playback with minimal operator costs. NuvioWeb is not affiliated with or endorsed by Nuvio.

## Approved product requirements

1. **Existing Nuvio accounts** provide login, profiles, add-ons and library/watch synchronization. No duplicate username/password system. Verify Nuvio tokens server-side for privileged operations. Public use of Nuvio's hosted backend requires permission/capacity review.
2. **Free essentials:** compatible Stremio add-ons and supported Nuvio JavaScript plugins; native and browser-local playback including 4K/HDR wherever devices support it. Do not charge solely for high resolution.
3. **Original quality first:** preserve video quality and metadata where technically possible; handle codec, container, audio, subtitles, CORS and platform limitations explicitly.
4. **Bring your own compute:** optional simple Docker/NAS/VPS/home-server or desktop processing agent, securely paired with existing Nuvio identity. Support assisted deployments to user-owned Cloudflare resources where actually feasible.
5. **Opt-in hosted compute:** prepaid metered processing for formats that require servers, with quoted customer prices, reserved credits, hard caps, failure refunds and small sustainable operational margin. No silent paid fallback.
6. **Low operator cost:** Cloudflare static hosting and small control Workers, no default central streaming/proxying of media; reusable processing protocol across self-hosted and hosted compute.
7. **Safe open development:** GPL and third-party licensing compliance, maintained upstream provenance, bounded untrusted plugin execution, lawful/authorized media only, no DRM bypass or open proxies.

## Execution sequence

Document audit and architecture decisions → build detailed milestones and GitHub issues → plan each issue separately → implement in small coding-agent PRs → run verified builds, integration/security/browser tests → review and stage → release.

Success means ordinary users get direct compatible playback for free, self-hosters can install and pair compute quickly, hosted users know their costs up front, and existing Nuvio account workflows continue to operate.
