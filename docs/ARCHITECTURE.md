# Technical architecture — proposed

This is a target design, not a description of already deployed systems.

## Components

1. **Browser/PWA** — Cloudflare Pages/static CDN: existing Nuvio auth client and account sync; HTTP/Stremio add-ons; bounded Nuvio JS sandbox; source discovery; codec probing; HTML video/HLS/DASH; local decode/demux where supported.
2. **Control API** — Cloudflare Workers: server-side Nuvio identity verification, agent pairing, capability registration, job authorization/routing, credit entitlement, quotas and job status. Never an unrestricted media relay.
3. **Control DB** — D1 or similar: verified Nuvio identity mapping, nonsecret agent identity and permissions, job metadata, prepaid credit ledger, settlements, audit events. No second Nuvio password database.
4. **Compute protocol** — versioned messages for capabilities, job request, authorized source references, output description, lease, progress, cancel, cleanup and usage.
5. **Executors** — local browser; self-hosted Docker/NAS/VPS/desktop agent; user-owned Cloudflare Worker Lite for supported control tasks plus optional Container; hosted isolated processing compute.
6. **Payment integration** — hosted checkout/webhook, only if user explicitly opts into managed compute.

## Routing algorithm

Compatible direct play → browser-local recovery preserving source bytes/HDR → configured owner-provided compute → *explicitly quoted* hosted compute. Do not silently switch to paid processing. Browser feature preferences may override order when the user chooses.

## Compute job model

- Check verified identity and media authorization; reserve compute credits only for hosted jobs.
- Negotiate executor capabilities, codec/container requirements, expected CPU/storage and maximum charge/duration.
- Issue short-lived, audience-scoped signed job lease; never share Nuvio refresh tokens.
- Process locally on executor; send progress and bounded usage; output is user-scoped with expiration.
- Cancel/expire/revoke; delete temporary assets. Set hard memory, CPU, disk, bandwidth, timeout and concurrency limits.
- Treat source URLs and remote media servers as untrusted; block SSRF, unsafe redirects, private IP, credentials and cloud metadata endpoints.

## Cloudflare distinction

Worker Lite is suitable for short, bounded APIs and pairing/control; FFmpeg/media transcodes require separate compute such as Cloudflare Containers or other container/VM infrastructure. Cloudflare Containers must be benchmarked for startup delays, volume, sustained encode throughput and per-GB charges before availability claims. BYOC template must not claim one-click Containers support until verified.

## UI promises

One Nuvio login. No second account creation. Same playlist and watch history. Add-on sources labeled with container/resolution/codec/HDR/audio; accurately report unknown metadata. Show when playback needs local vs remote processing and what it will cost before work begins.

## Data boundaries

Nuvio manages identity and sync; the NuvioWeb control plane only stores verified identity bindings, entitlements and narrowly necessary processing metadata. User source bytes should travel directly from authorized origins to the selected processor/browser where possible. Logs redact tokens, URL queries and private media details.

## Current source layout

The owner-approved baseline lives in `app/alpha`, preserving the complete original Alpha tree and history. Root `docs`, `scripts` and `.github/workflows` belong to this project. Upstream workflows are retained under `app/alpha/.github` as source; they are not root Actions workflows. Run future application commands from `app/alpha`; see [feature evidence](FEATURE_SUPPORT.md) for verified status.

## Suggested future code structure

apps/web, apps/desktop-agent, packages/compute-protocol, packages/source-capabilities, packages/nuvio-auth, services/control-api, services/compute-agent, services/hosted-compute, deploy/docker, deploy/cloudflare-lite, deploy/cloudflare-compute, tests/fixtures.

**Migration note:** Start by importing the original Alpha source intact; refactor only after reproducible baseline tests. This directory structure is aspirational and must not be misrepresented as existing.
