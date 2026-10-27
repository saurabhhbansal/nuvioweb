# External player return relay

Updated 2026-10-27. Issue [#227](https://github.com/saurabhhbansal/nuvioweb/issues/227). Policy: ADR-019 in [DECISIONS](DECISIONS.md).

## What it is for

Some external players can open a web address when playback stops (x-callback-url on iPhone: Infuse, Lenna, Outplayer, VLC). The app gives them an address on a small Cloudflare Worker, keyed by a random one-time token. When the viewer comes back to NuvioWeb, the app asks the Worker for that token's report once and writes the position through the normal progress path: Continue Watching, Trakt/Simkl and the Nuvio account.

Players with no callback (Android intents, desktop players, copy link, the playlist file), and any site without the Worker, use the return prompt instead: "Finished" or "Stopped at…".

## What the Worker keeps

- **Only** the token, outcome (finished or stopped), player name, position, duration and progress, plus the names of a few query parameters for diagnosis. Never their values.
- **For at most 10 minutes**, in one Durable Object per token. It is deleted when the app collects it or when its alarm fires, whichever is first.
- **Never the stream address.** Some players append the address they played to the callback (seen as a `lastPlayedUrl` or `url` parameter). Every parameter outside the short allowlist is dropped unread, the Worker logs nothing, and Workers observability is off in [wrangler.toml](../deploy/return-relay/wrangler.toml) so request URLs are not retained.
- No account data, no Nuvio tokens, no cookies. Collection is a plain GET with `credentials: "omit"`, accepted only from the site's own origins (CORS allowlist).

It never fetches anything and serves no media. It is not a proxy.

## Abuse limits

- Tokens are 128-bit random hex; a malformed token is refused before any storage is touched.
- Reports outside the allowed shape (unknown outcome or player, negative or huge numbers, position far past the duration) are refused and nothing is stored.
- A per-IP rate limit (60 requests a minute) through Cloudflare's rate limiting binding.
- Collection needs an allowed `Origin`.

## Cost

Workers Free: 100,000 requests a day. Each external playback costs about two requests (one report, one collection, plus up to three retries if the report is late). SQLite-backed Durable Objects are on the Free plan. Nothing is billed unless the account is upgraded.

## Setup (owner, once per environment)

1. **API token.** Add **Workers Scripts: Edit** to the token in the `CLOUDFLARE_API_TOKEN` secret (it already has Cloudflare Pages: Edit).
2. **workers.dev subdomain.** In the Cloudflare dashboard, Workers & Pages → your account's `workers.dev` subdomain. Note it; the Worker's address is `https://<worker-name>.<subdomain>.workers.dev`.
3. **Repository variable.** Settings → Secrets and variables → Actions → Variables:
   - Preview: `RETURN_RELAY_PREVIEW_URL` = `https://nuvioweb-return-relay-preview.<subdomain>.workers.dev`
   - Production (the `production` environment or the repository): `RETURN_RELAY_URL` = `https://nuvioweb-return-relay.<subdomain>.workers.dev`
4. **Deploy.** Run **Deploy preview** (or **Deploy production** with a tag). With the variable set, the workflow deploys the Worker first with `wrangler deploy`, then builds the site pointing at it. Without the variable, neither happens and the site uses the prompt only.

The Worker name and its allowed origins (`https://nuvioweb-preview.pages.dev` and its per-deployment subdomains; `https://nuvioweb.xyz` and `https://www.nuvioweb.xyz`) are set in the workflows. The site's Content-Security-Policy already allows `connect-src https:`, so no header change is needed.

Manual equivalent:

```bash
npx wrangler@4.151.3 deploy --config deploy/return-relay/wrangler.toml --name nuvioweb-return-relay-preview --var "ALLOWED_ORIGINS:https://nuvioweb-preview.pages.dev,https://*.nuvioweb-preview.pages.dev"
NUVIO_EXTERNAL_RETURN_RELAY_URL=https://nuvioweb-return-relay-preview.<subdomain>.workers.dev npm run preview:stage
```

## Check it works

- `https://<worker-address>/api/external-return/health` returns `{"ok":true}`.
- On the site, Settings → Playback shows **External Player Progress**.
- On an iPhone, play a title in Infuse or Lenna, stop part way, come back to NuvioWeb: Continue Watching shows the new position without a prompt.

## Rollback

Any of these, fastest first. The app falls back to the return prompt, so nothing is lost.

1. **Turn it off for the site:** delete the repository variable and re-run the deploy workflow. The new build has no relay address and never calls the Worker.
2. **Roll the Worker back:** `npx wrangler@4.151.3 rollback --name <worker-name>` or Workers & Pages → the Worker → Deployments → Rollback.
3. **Remove it:** `npx wrangler@4.151.3 delete --name <worker-name>`. A site still pointing at it gets no report and shows the prompt.

Pending reports expire within 10 minutes on their own; there is nothing to clean up.

## Code

- Worker: [deploy/return-relay/worker.js](../deploy/return-relay/worker.js), tests in `worker.test.mjs` next to it.
- App: `browserExternalPlaybackHandoff.js` (handoff, callbacks, collection, return coordinator), `sidecarCapabilities.js` (`NUVIO_EXTERNAL_RETURN_RELAY_URL`), `app.js` (`applyExternalPlaybackReportForProvider`).
- A self-hosted install can still run the Node bridge in `app/alpha/services/external-return-bridge` on its own origin instead.
