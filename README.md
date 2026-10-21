# NuvioWeb

A browser and installable web app (PWA) for people who already have a Nuvio account.

**Not affiliated with or endorsed by Nuvio.** NuvioWeb is an independent community client. It is a hard fork of [alphasquare404/NuvioWeb](https://github.com/alphasquare404/NuvioWeb) (GPL-3.0), kept in [app/alpha](app/alpha) with its original history and notices.

Development preview: https://nuvioweb-preview.pages.dev

## What it does today

- Sign in with your existing Nuvio account, pick a profile, and see your library and watch progress. You can also continue as a guest.
- Install HTTP/Stremio-compatible add-ons by URL, browse catalogs and open a source list for a title.
- Rank sources by what this browser is likely to play, and explain why a source failed when it does.
- Play in the browser (native video, HLS, DASH) with subtitles, or hand a source off to an external player.
- Install as a PWA on desktop and mobile.

NuvioWeb ships no media and no sources. Everything you watch comes from add-ons and plugins **you** choose to install. Use only media you are allowed to access. There is no DRM bypass, no server-side transcoding and no media proxy.

## What is planned

Work is tracked in GitHub milestones: [Public beta and Later](https://github.com/saurabhhbansal/nuvioweb/milestones). See [what works today in each browser](docs/FEATURE_SUPPORT.md).

## Run it locally

Use Node 22.23.1 / npm 10.9.8 (see `.node-version`).

```bash
cd app/alpha
HUSKY=0 npm ci
NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build
npm run serve
```

More detail, including tests: [CONTRIBUTING](docs/CONTRIBUTING.md).

## Docs

- [Product requirements](docs/PRD.md) and [architecture](docs/ARCHITECTURE.md)
- [Decisions](docs/DECISIONS.md) and [security and privacy](docs/SECURITY_PRIVACY.md)
- [Nuvio identity contract](docs/NUVIO_IDENTITY_CONTRACT.md) and [library sync policy](docs/LIBRARY_SYNC_POLICY.md)
- [Deploying the preview](docs/DEPLOY_PREVIEW.md)
- [Upstream provenance](UPSTREAM_SOURCES.md) and [license audit](docs/UPSTREAM_LICENSE_AUDIT.md)
- Older process records live in [docs/archive](docs/archive/) and are not maintained.

## License

GPL-3.0, inherited from upstream. See [app/alpha/LICENSE](app/alpha/LICENSE).
