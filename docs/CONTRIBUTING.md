# Contributing

## Setup

Use Node 22.23.1 with npm 10.9.8 (`.node-version`). App commands run from `app/alpha`.

```bash
cd app/alpha
HUSKY=0 npm ci
NUVIO_LOCAL_PROPERTIES=../../tests/fixtures/build.properties npm run build
node ../../scripts/check-alpha-build.mjs
npm test
npm run lint
```

`HUSKY=0` stops upstream's prepare script from installing Git hooks. The fixture build points at `example.invalid`, so it never talks to a real Nuvio backend. Never put secrets in build properties.

Browser tests, from the repo root after the build above:

```bash
npm ci
npx playwright install chromium
npm run test:browser
npm run test:addon-fixtures
npm run test:preview
npm run test:scripts
node scripts/check-docs.mjs
```

Firefox and WebKit: `NUVIO_PLAYWRIGHT_FIREFOX=1 npx playwright test --project=firefox` (or `NUVIO_PLAYWRIGHT_WEBKIT=1 ... --project=webkit`). In CI these run from the manual "Browser engines" workflow.

## Pull requests

- Pick an issue from the [milestones](https://github.com/saurabhhbansal/nuvioweb/milestones). One issue per PR; keep PRs small.
- Use `Refs #N` in commits and the PR.
- Add or update tests for behaviour you change. Mock clocks, network and auth instead of waiting on real services.
- Required checks must be green: `Locked install, build, tests and lint`, `Chromium application smoke`, `Docs links and checker tests`, `Roadmap and import checks`.
- The PR description is the record: linked issue, what changed, tests run, known limits. Do not add evidence or receipt files.
- Update [FEATURE_SUPPORT](FEATURE_SUPPORT.md) when user-visible support changes.

## Rules

- Test only with legal fixtures in `tests/fixtures` or media you own.
- Never add, test against or name third-party scraper providers anywhere in the repo, commits or PRs.
- Never commit tokens, keys or account data.
- Keep upstream GPL notices and history in `app/alpha`.
