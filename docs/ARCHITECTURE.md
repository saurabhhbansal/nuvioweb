# Architecture

Updated 2026-10-21. This describes what exists in the repo today.

## Overview

NuvioWeb is a static PWA. There is no NuvioWeb backend. The browser talks directly to Nuvio, to add-ons the user installed and to media hosts.

```
Browser / PWA (Cloudflare Pages, static files)
  ├─ Nuvio public API (Supabase auth + sync)  → account, profiles, library, progress
  ├─ User-installed add-ons (HTTP/Stremio)    → catalogs, metadata, sources, subtitles
  ├─ User-installed JS plugins (in browser)   → extra sources
  └─ Media host                               → played in <video> / HLS.js / DASH.js,
                                                 or handed to an external player
```

## Parts

1. **Static hosting.** `app/alpha` builds to `app/alpha/dist`. It is served from Cloudflare Pages with the rules in [deploy/cloudflare](../deploy/cloudflare). No Functions or Workers. See [DEPLOY_PREVIEW](DEPLOY_PREVIEW.md).
2. **Identity and sync.** The app uses the Nuvio public API with the publishable key, the same as other Nuvio clients. Tokens stay in the browser. See the [identity contract](NUVIO_IDENTITY_CONTRACT.md) and [sync policy](LIBRARY_SYNC_POLICY.md).
3. **Add-ons.** Standard Stremio add-on protocol over HTTP: manifest, catalog, meta, stream and subtitles. The browser's CORS rules apply.
4. **JS plugins.** User-installed Nuvio JS plugins run in the browser through the existing plugin runtime under `app/alpha/js/core/player/`. Work tracked in #166.
5. **Playback pipeline.** Sources are mapped to a capability description and ranked by what this browser reports it can play. The player tries native video, then HLS.js or DASH.js. On failure it shows a short reason and next step.
6. **External hand-off.** The source URL can be opened in an external player (desktop, Android intent, iOS app link). The browser is not involved after hand-off.
7. **Optional sidecars.** Upstream integrations that need a server (Trakt auth, debrid bridges, external-player return) are off by default and disabled on the public preview.

## Layout

- `app/alpha/` — the application (upstream fork). Run app commands from here.
- `scripts/` — build checks and preview staging for this repo.
- `tests/browser/` — Playwright tests. `tests/fixtures/` — legal fixture media, add-on fixture server.
- `deploy/cloudflare/` — static host headers, redirects and public build config.
- `.github/workflows/` — CI.

## Boundaries

- No server compute, no media relay, no payment system.
- Third-party sources are untrusted input. Nothing from an add-on or plugin is trusted to run outside its sandbox.
