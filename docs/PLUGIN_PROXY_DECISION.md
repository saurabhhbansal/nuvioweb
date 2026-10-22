# Plugin proxy decision

Checked on 2026-10-22. Limits change often; re-check the linked pages before acting on them.

## Why a proxy comes up at all

Nuvio JS plugins scrape third-party web pages. In a browser, many of those requests fail because the target site does not send CORS headers, or because the plugin needs to set headers a browser forbids (`Referer`, `Origin`, `User-Agent`, `Cookie`). Some resulting streams also only play when those headers are sent with every video request. A small server-side proxy can fix both, but it is a server we would have to run, pay for and answer for.

## What a shared proxy would have to carry

- **Scrape traffic:** roughly 5–40 small requests per plugin per title opened. With 1,000 daily users opening 5 titles each and 3 plugins enabled, that is about 75,000–600,000 proxied requests a day.
- **Video traffic for header-locked streams:** every HLS segment (hundreds per film) and gigabytes of bytes. This is a media relay, which [AGENTS.md](../AGENTS.md) already rules out.

## Free tiers compared

| Option | Free allowance | Proxy/content terms | Fit |
| --- | --- | --- | --- |
| Cloudflare Workers Free | 100,000 requests/day, 10 ms CPU per request, 50 subrequests per request ([limits](https://developers.cloudflare.com/workers/platform/limits/)) | Customer is responsible for end users; IP-infringing content prohibited; Cloudflare may limit or suspend ([developer platform terms](https://www.cloudflare.com/service-specific-terms-developer-platform/), [website terms](https://www.cloudflare.com/website-terms/)) | Best free option, but the daily cap is hit at a few hundred active users |
| Deno Deploy Free | 1M requests/month, 20 GiB egress/month, 10 h active CPU ([pricing](https://deno.com/deploy/pricing), [limits](https://docs.deno.com/deploy/pricing_and_limits/)) | "For personal use and smaller projects"; TLS-over-TLS proxies prohibited | About 33,000 requests/day; too small |
| Vercel Hobby | 1M function invocations, 100 GB transfer, 4 h active CPU per month ([fair use](https://vercel.com/docs/limits/fair-use-guidelines)) | Hobby is personal, non-commercial use only ([terms](https://vercel.com/legal/terms)) | Too small, and a public service for strangers is a poor fit for "personal use" |
| Netlify Free | 300 credits/month; requests cost 2 credits per 10k, bandwidth 20 credits per GB ([pricing](https://www.netlify.com/pricing/)) | Stolen copyrighted material and piracy sites prohibited; termination without notice ([terms](https://www.netlify.com/legal/terms-of-use/)) | Credits run out quickly; strictest content terms |
| Oracle Cloud Always Free | 2 Arm OCPUs + 12 GB RAM, 10 TB/month egress ([always free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)) | Standard cloud acceptable-use policy; idle instances may be reclaimed; card verification needed | Most capacity, but it is a VM to patch, monitor and defend; one account, one IP |

## Assessment

- **Capacity:** only Oracle has room for a public beta, and only for scrape traffic. None of the serverless free tiers survive a few hundred daily users, and none can relay video.
- **Terms:** every provider makes the account holder responsible for what flows through it, and most name infringing content as grounds for suspension. Plugins are user-supplied and often scrape gray-area sites, so a shared proxy would put the owner's account (and name) between those sites and every user.
- **Abuse:** even restricted to hosts declared by installed plugins, anyone can publish a plugin that declares any host. The allowlist limits accidents, not a determined abuser. The proxy's IP also gets blocked by target sites quickly when shared.

## Decision

**The project does not run a shared or public proxy, and will not offer one to donors or anyone else.** No free tier can carry it, and whoever operates it carries the legal and abuse exposure. Decided by the owner on 2026-10-22.

1. **Bring your own proxy.** Users who need one set their own proxy URL in Settings (off by default). The app sends the target URL and headers; the proxy is never sent Nuvio tokens.
2. **Without a proxy,** plugins still run directly in the browser. Requests that fail because of CORS or network errors are marked "Needs proxy", and streams that need headers keep the existing "Needs headers" label.
3. **Never relay video.** Header-locked streams stay "Needs headers" or go to an external player.

[deploy/plugin-proxy/worker.js](../deploy/plugin-proxy/worker.js) is a restricted reference script for people who want to run a proxy **for themselves**. It needs a token, only forwards to an allowlist of hosts, rate-limits per token and refuses large responses. The project never deploys it.

### Proxy contract

`GET <proxy>?url=<encoded target>&headers=<encoded JSON object>` with `Authorization: Bearer <token>` when the user set one. The proxy returns the upstream status and body and adds `Access-Control-Allow-Origin`. It must reject targets outside its allowlist and private network addresses.
