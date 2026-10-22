# Deploying production

Production is a separate Cloudflare Pages project, `nuvioweb`, served on a custom domain ([ADR-021](DECISIONS.md)). It ships only tagged releases. The [development preview](DEPLOY_PREVIEW.md) (`nuvioweb-preview`) stays for testing.

Both are the same static site: no Functions, Workers, bindings or paid features. Production uses the same stage script and host rules as the preview.

## One-time setup (owner)

Nothing here is automated. Keep the owner invisible: no personal names, emails, addresses or phone numbers in the site, these docs, DNS records or the domain registration.

1. **Buy the domain** with WHOIS privacy (contact redaction) turned on. Cloudflare Registrar redacts it by default; with any other registrar, turn it on before the domain goes live. Use a neutral name that does not identify the owner.
2. **Create the Pages project** `nuvioweb` as a Direct Upload project with production branch `main`, either in the dashboard (Workers & Pages → Create → Pages → Upload assets) or with:

   ```bash
   wrangler pages project create nuvioweb --production-branch main
   ```

3. **Attach the custom domain** in the project's Custom domains tab. If the domain's DNS is on Cloudflare, it adds the record itself; otherwise add the CNAME it shows. The `nuvioweb.pages.dev` address also stays reachable.
4. **Check the secrets.** The workflow uses the same repository secrets as the preview: `TMDB_API_KEY`, `CLOUDFLARE_API_TOKEN` (Cloudflare Pages: Edit on the account that owns `nuvioweb`) and `CLOUDFLARE_ACCOUNT_ID`, plus the optional `TRAKT_CLIENT_ID` and `SIMKL_CLIENT_ID` (see [DEPLOY_PREVIEW](DEPLOY_PREVIEW.md#trakt-and-simkl-apps)).
5. **Optional approval gate.** The job runs in a GitHub environment called `production`, created on its first run. In Settings → Environments you can add a required reviewer and limit it to `main`.
6. **Check what the site shows.** The staged `SOURCE.txt` and `UPSTREAM_SOURCES.md` link to this GitHub repository for GPL source, so the repository's account name is visible. If that must not identify the owner, move the repository to a neutral account or organization before the first production deploy.

The host rules keep `X-Robots-Tag: noindex, nofollow`, so search engines do not list the site. Change [_headers](../deploy/cloudflare/_headers) only if that should differ for production.

## Releasing

1. Merge the release work to `main` with green required checks, and redeploy the preview from `main`.
2. Walk through the preview on desktop Chrome, iPhone Safari (and the Home Screen app) and Android Chrome.
3. Tag the tested `main` commit and push the tag:

   ```bash
   git tag -a v0.1.0 -m "v0.1.0"
   git push origin v0.1.0
   ```

4. Run the **Deploy production** workflow ([production-deploy.yml](../.github/workflows/production-deploy.yml)) from the Actions tab on `main`, with the tag as input. It refuses anything that is not an existing `v*` tag (like `v0.1` or `v0.1.0`) on `main`. It stages that tag with `npm run preview:stage` and the `TMDB_API_KEY` secret, then uploads it to `nuvioweb` with `--branch main`.
5. Optionally, stage the same tag locally and check the live site against it with `NUVIO_PREVIEW_URL=https://<your domain> npm run preview:verify -- dist/preview/<commit>` (see the [preview guide](DEPLOY_PREVIEW.md#3-verify)).

## Rollback

Either:

- **Rerun the workflow with the previous tag.** It rebuilds that tag and makes it the live deployment; or
- **Roll back in the Cloudflare dashboard:** Workers & Pages → `nuvioweb` → Deployments → pick the previous production deployment → Rollback. This is instant and needs no build.

Never delete old deployments; they are the rollback path. Fix forward with a new tag once the problem is understood.
