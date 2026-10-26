# NuvioWeb

A browser and installable web app (PWA) for the public Nuvio API. Like Stremio, it is a neutral client: it plays what your own add-ons and plugins return, in the browser or in an external player.

- **Not affiliated with or endorsed by Nuvio.** NuvioWeb is an independent community client.
- **Ships no content and no sources.** Users install their own add-ons and plugins. Use only media you are allowed to access. There is no DRM bypass, no server-side transcoding and no media proxy.

Development preview: https://nuvioweb-preview.pages.dev

## How to use it

1. **Open the site and sign in** with your existing Nuvio account (email or QR code), or choose **Continue without account** (data then stays on this device). No account yet? **Sign up** opens nuvio.tv.
2. **Pick a profile.** Your library and watch progress sync with the Nuvio account.
3. **Add-ons:** install HTTP/Stremio-compatible add-ons by URL in Settings. Catalogs, details, sources and subtitles come from them.
4. **Plugins:** add a Nuvio plugin repository by its URL in Settings, then turn individual scrapers on or off. Plugins run in a browser worker.
5. **Proxy (optional, bring your own):** many plugin requests are blocked by the browser (CORS). If a plugin shows "Needs proxy", you can set the URL of a proxy **you run yourself** in the plugin settings. The project runs no proxy. See the [proxy decision](docs/PLUGIN_PROXY_DECISION.md).
6. **Play** a source in the browser (native video, HLS, DASH, with subtitles), or **hand it off to an external player** (VLC and others on Android and iPhone; VLC, PotPlayer, IINA or Infuse on desktop, or copy the link).
7. **Track (optional):** connect Trakt or Simkl in Settings. Each device signs in on its own.
8. **Install it as an app.** iPhone: Safari → Share → Add to Home Screen. Android: Chrome menu → Install app (or Add to Home screen). Desktop Chrome/Edge: the install icon in the address bar.

What works in each browser, and the known limits: [FEATURE_SUPPORT](docs/FEATURE_SUPPORT.md).

Found a problem? Open a [GitHub issue](https://github.com/saurabhhbansal/nuvioweb/issues). The app sends no telemetry. When a source fails to play, its error screen has an "Export redacted diagnostics" button whose file (no URLs or tokens) you can attach.

## Run it locally

Use Node 22.23.1 / npm 10.9.8 (see `.node-version`).

```bash
cd app/alpha
HUSKY=0 npm ci
NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build
npm run serve
```

More detail, including tests: [CONTRIBUTING](docs/CONTRIBUTING.md). Work is tracked in [GitHub milestones](https://github.com/saurabhhbansal/nuvioweb/milestones).

## Docs

- [Product requirements](docs/PRD.md) and [architecture](docs/ARCHITECTURE.md)
- [Decisions](docs/DECISIONS.md) and [security and privacy](docs/SECURITY_PRIVACY.md)
- [Nuvio identity contract](docs/NUVIO_IDENTITY_CONTRACT.md) and [library sync policy](docs/LIBRARY_SYNC_POLICY.md)
- Deploying: [development preview](docs/DEPLOY_PREVIEW.md) and [production](docs/DEPLOY_PRODUCTION.md)
- [Upstream provenance](UPSTREAM_SOURCES.md) and [license audit](docs/UPSTREAM_LICENSE_AUDIT.md)
- Older process records live in [docs/archive](docs/archive/) and are not maintained.

## License

GPL-3.0, inherited from upstream. See [app/alpha/LICENSE](app/alpha/LICENSE). NuvioWeb is a hard fork of [alphasquare404/NuvioWeb](https://github.com/alphasquare404/NuvioWeb); upstream sources, history and notices are kept in [app/alpha](app/alpha) and listed in [UPSTREAM_SOURCES](UPSTREAM_SOURCES.md).
