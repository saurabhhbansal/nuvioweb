# Decisions

Updated 2026-10-27. Only decisions still in force are listed. Older records are in [docs/archive](archive/).

| ID | Decision | Why |
| --- | --- | --- |
| ADR-001 | Alpha web is the code base, kept in `app/alpha` | Most complete static browser implementation |
| ADR-002 | Use existing Nuvio identity; no second account system | One login for users; see [identity contract](NUVIO_IDENTITY_CONTRACT.md) |
| ADR-003 | Compatible playback is free, including high bitrate, 4K and HDR | Quality is not a paid feature |
| ADR-004 | HTTP add-ons and JS plugins are separate layers | Wider compatibility with a bounded sandbox for plugins |
| ADR-008 | Static hosting on Cloudflare Pages | Near-zero cost when idle |
| ADR-009 | No central video relay or open proxy | Cost, privacy and abuse risk |
| ADR-012 | Authorized media only; no DRM circumvention | Legal and platform limits |
| ADR-014 | Hard fork of upstream (2026-10-21) | Upstream has diverged; we no longer track or import it. GPL license, notices and history stay in `app/alpha` |
| ADR-015 | No server compute and no payments (2026-10-21; narrowed 2026-10-27) | Scope is browser playback plus external player hand-off. Earlier compute and credit plans are dropped. The one exception is the small Workers allowed by ADR-019 |
| ADR-016 | Roadmap lives in GitHub milestones (2026-10-21) | [Milestones](https://github.com/saurabhhbansal/nuvioweb/milestones) replace tracker files and progress ledgers |
| ADR-017 | Neutral client (2026-10-21) | Like Stremio, the repo never ships or names third-party scraper providers. Users install their own sources |
| ADR-018 | Evidence is green CI plus a short PR note (2026-10-21) | No evidence or receipt files in the repo |
| ADR-019 | Bring your own proxy; small Workers allowed (2026-10-22, revised 2026-10-27) | The project runs no shared, public, donor or media proxy. Users may set their own proxy URL for plugins. See [PLUGIN_PROXY_DECISION](PLUGIN_PROXY_DECISION.md). Revised by the owner: small, cheap Cloudflare Workers are allowed for features that are at most in the legal grey area, as long as they fetch nothing on a user's behalf, never see or keep a stream address, keep only what the feature needs for minutes, and fit the free plan. The first is the [external player return relay](EXTERNAL_RETURN_RELAY.md) |
| ADR-020 | No error reporting or telemetry (2026-10-22) | Users report problems as GitHub issues. A source that fails to play offers "Export redacted diagnostics" (no URLs or tokens) to attach. No third-party error service and no opt-in collection |
| ADR-021 | Production is a separate Cloudflare Pages project, `nuvioweb`, on a custom domain (2026-10-22) | `nuvioweb-preview` stays for testing. Production deploys only tagged releases by hand. The owner is never a visible operator: no names or personal details in the site, docs or domain setup, and WHOIS privacy on the domain. See [DEPLOY_PRODUCTION](DEPLOY_PRODUCTION.md) |

## Notes

- **Public preview (2026-10-18).** The owner accepted documented public-client use of the Nuvio API and authorized a public static development preview.
- **No WASM remuxer (2026-10-19).** The candidate demux/remux path had license and build obligations we could not meet. Unsupported containers are explained, not repaired.
