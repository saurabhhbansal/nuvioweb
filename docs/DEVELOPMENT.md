# Development

How to run NuvioWeb locally and where the project docs live. Tests and pull request rules are in [CONTRIBUTING](CONTRIBUTING.md); agent rules are in [AGENTS.md](../AGENTS.md).

## Run it locally

Use Node 22.23.1 / npm 10.9.8 (see `.node-version`).

```bash
cd app/alpha
HUSKY=0 npm ci
NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build
npm run serve
```

The fixture build points at `example.invalid`, so it never talks to a real Nuvio backend. Never put secrets in build properties.

Work is tracked in [GitHub milestones](https://github.com/saurabhhbansal/nuvioweb/milestones). The development preview is https://nuvioweb-preview.pages.dev.

## Docs

- [Product requirements](PRD.md) and [architecture](ARCHITECTURE.md)
- [Decisions](DECISIONS.md) and [security and privacy](SECURITY_PRIVACY.md)
- [Feature support](FEATURE_SUPPORT.md)
- [Nuvio identity contract](NUVIO_IDENTITY_CONTRACT.md) and [library sync policy](LIBRARY_SYNC_POLICY.md)
- [Plugin proxy decision](PLUGIN_PROXY_DECISION.md) and [external player return relay](EXTERNAL_RETURN_RELAY.md)
- Deploying: [development preview](DEPLOY_PREVIEW.md) and [production](DEPLOY_PRODUCTION.md)
- [Upstream provenance](../UPSTREAM_SOURCES.md) and [license audit](UPSTREAM_LICENSE_AUDIT.md)
- Older process records live in [docs/archive](archive/) and are not maintained.
