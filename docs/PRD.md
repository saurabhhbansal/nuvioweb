# Product requirements — NuvioWeb

Updated 2026-10-27. Scope: browser playback plus external player hand-off. Roadmap: [GitHub milestones](https://github.com/saurabhhbansal/nuvioweb/milestones).

## Problem

Nuvio users want to watch on any device with a browser, without installing a native app, and keep the same account, profiles and library everywhere.

## Users

- **Nuvio user on the web:** signs in with an existing account and expects their library, add-ons and progress.
- **Phone or tablet user:** installs the PWA and may prefer to open sources in an external player app.

## MVP scope

| Area | Requirement |
| --- | --- |
| Account | Sign in with an existing Nuvio account. Refresh, sign out and switch profiles. An account is required; there is no guest mode ([ADR-022](DECISIONS.md)). No second account system. |
| Sync | Library and watch progress sync through Nuvio. Sync failures are shown and recoverable, never silently dropped. See [sync policy](LIBRARY_SYNC_POLICY.md). |
| Add-ons | Install HTTP/Stremio-compatible add-ons by URL. Browse catalogs, open details and list sources. |
| Sources and play | Rank sources by what this browser can likely play. Play native video, HLS and DASH with subtitles. Explain failures in plain words. |
| External player | Hand a source to an external player on desktop, Android and iOS when the browser cannot play it. |
| Mobile and PWA | Usable at phone width. Installable, updates cleanly, works offline for the shell. |
| JS plugins | Run user-installed Nuvio JS plugins in the browser, within a sandbox. |

## Non-goals

- Server-side compute: no transcoding, remuxing or hosted processing.
- Payments, credits or paid tiers.
- DRM bypass or access to media the user is not allowed to watch.
- Hosting, relaying or proxying media.
- Shipping, recommending or naming third-party sources. Users install their own.
- Claiming universal codec, 4K or HDR support. Support depends on the browser and device.

## Quality bar

- Required CI checks stay green on every PR.
- New behaviour has unit or Playwright tests with fixtures or mocks.
- Accessible by keyboard; captions work.
- Secrets and Nuvio tokens are never logged or committed.
