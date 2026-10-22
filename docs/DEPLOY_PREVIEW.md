# Deploying the development preview

The dev preview is the Cloudflare Pages project `nuvioweb-preview`, at https://nuvioweb-preview.pages.dev. It is a static site: no Functions, Workers, bindings or paid features. Do not add custom domains or billing changes to it. Production is a separate project, set up by the owner: see [DEPLOY_PRODUCTION](DEPLOY_PRODUCTION.md).

## Usual way: GitHub Actions

Run the **Deploy preview** workflow ([preview-deploy.yml](../.github/workflows/preview-deploy.yml)) from the Actions tab on `main`. It stages and uploads exactly as below. It needs three repository secrets, set by the owner:

- `TMDB_API_KEY`: the public TMDB v3 key. Plugins need it to look up titles. It ships in the browser bundle like any client key, but it is never committed.
- `CLOUDFLARE_API_TOKEN`: a token limited to Cloudflare Pages: Edit.
- `CLOUDFLARE_ACCOUNT_ID`: the account that owns `nuvioweb-preview`.

The steps below are the manual fallback.

## TMDB key

`build.properties` keeps `TMDB_API_KEY` empty. To bake the key in, put it in a private file outside the repo and set `NUVIO_TMDB_API_KEY_FILE=<path>` when running `preview:stage`. Staging accepts only a 32-character v3 key.

## 1. Stage

Use pinned Node 22.23.1 and a clean, committed checkout (the merged `main` commit you want to ship).

```bash
cd app/alpha
HUSKY=0 npm ci
cd ../..
npm ci
npm run preview:stage
```

`preview:stage` rebuilds with [deploy/cloudflare/build.properties](../deploy/cloudflare/build.properties) (public Nuvio URL and publishable key, sidecars off). It refuses dirty source, private config fields, other identity destinations, symlinks and server files. It writes `dist/preview/<commit>/` with the app, host rules, GPL license, [provenance](../UPSTREAM_SOURCES.md), third-party notices, the optional legal demo add-on and a `preview-manifest.json` file inventory.

## 2. Upload

```bash
wrangler pages project list
wrangler pages deploy dist/preview/<commit> --project-name nuvioweb-preview --branch main --commit-hash <commit> --commit-dirty=false
```

Previous deployments stay in Cloudflare for rollback. Do not delete them.

## 3. Verify

```bash
npm run preview:verify -- dist/preview/<commit>
```

[scripts/verify-preview.mjs](../scripts/verify-preview.mjs) checks the served files against the staged manifest, cache and security headers, 404 handling, the service worker, guest navigation and the legal demo playback journey. It runs a guest session only and blocks every third-party request. It is manual, not part of CI.

## Rollback

Roll back in the Cloudflare dashboard to the previous deployment, or stage and upload an earlier `main` commit.

## Host rules

- [_headers](../deploy/cloudflare/_headers): revalidate unversioned files, no-store for the worker and runtime config, `nosniff`, `no-referrer`, frame denial, `noindex`.
- [_redirects](../deploy/cloudflare/_redirects) and [404.html](../deploy/cloudflare/404.html): app routes reload to the app; unknown files return a real 404.
