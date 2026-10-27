# Security and privacy

Updated 2026-10-21.

## Identity

- Users sign in through the existing Nuvio authentication. NuvioWeb never collects or stores Nuvio passwords on any server of its own, and has no second account system.
- Access and refresh tokens stay in the browser. They are never logged, committed, put in URLs or sent to add-ons, plugins or external players.
- A rejected or expired refresh signs the user out locally and clears private state.
- See the [identity contract](NUVIO_IDENTITY_CONTRACT.md) for the API terms and limits.

## Add-ons, plugins and sources

- Manifests, catalog data, stream metadata, subtitles and plugin code are untrusted input.
- Rendered text is escaped. Stream metadata cannot inject markup.
- JS plugins run in a separate Web Worker per scraper run, with a timeout, capped output, no cookies, no access to localStorage tokens, and no requests to this app, loopback or local-network addresses. The worker is same-origin, so this is not a full sandbox; see [proxy decision](PLUGIN_PROXY_DECISION.md).
- Source URLs handed to an external player are the user's choice. NuvioWeb does not rewrite, proxy or relay them.
- The optional [external player return relay](EXTERNAL_RETURN_RELAY.md) receives only a random one-time token, the playback position, duration and outcome. It drops any stream address a player appends, logs nothing, keeps a report for at most 10 minutes and hands it only to the site's own origins.

## Build and hosting

- Browser build properties contain only public values: the Nuvio URL and publishable key. Server secrets must never go into them.
- `scripts/prepare-static-preview.mjs` refuses to stage a build with private fields, unexpected destinations or enabled sidecars.
- Host headers set `nosniff`, `no-referrer`, frame denial and no-store for the service worker and runtime config.
- No Functions, Workers, databases or proxies are deployed.

## Privacy

- Do not add analytics or tracking.
- Failure diagnostics are built from an allowlist. They never include URLs, titles, header values or tokens, and are never uploaded.

## Media

- Only media the user is allowed to access. No DRM circumvention.
- Tests and demos use the legal fixture media in `tests/fixtures`.

## Licenses

Keep upstream GPL-3.0 text, copyright notices and history in `app/alpha`. See the [license audit](UPSTREAM_LICENSE_AUDIT.md).
