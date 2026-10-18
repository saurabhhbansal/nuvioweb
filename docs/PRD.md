# Product requirements document (PRD) — NuvioWeb

Status: approved product direction, verification and prioritization pending. Date: 2026-10-18.

## Problem

Browser media clients often lose native-app features: add-on compatibility, high-quality codecs, synced profiles and advanced source handling. Operating a centralized streaming backend for all traffic is expensive and risky. Users with their own hardware need an effortless alternative to complex self-hosting.

## User segments

1. **Free web user:** existing Nuvio account, favorite add-ons, simple playback, no hosted processing bill.
2. **Power user:** high-resolution files, track/subtitle controls and transparent format diagnostics.
3. **Self-hoster:** installs one processing agent, pairs account, uses own CPU/GPU/server; no extra platform compute payment.
4. **Managed compute buyer:** opts in to bounded paid conversion, easy checkout and clear price/allowance.

## Functional requirements

| ID | Requirement | Priority | Acceptance target |
| --- | --- | --- | --- |
| FR-01 | Authenticate using existing Nuvio account | P0 | Email/other upstream-supported sign-in, refresh, sign-out and account switch work; no separate password |
| FR-02 | Sync profiles, add-ons, library and watch progress | P0 | Cross-device behavior matches tested upstream contract |
| FR-03 | Install and use HTTP/Stremio-compatible add-ons | P0 | Manifest/catalog/meta/stream/subtitle fixture suite passes |
| FR-04 | Support Nuvio JS plugins safely | P1 | Sandboxed supported plugin test corpus; scope of unsupported APIs documented |
| FR-05 | Direct play H.264/HLS/DASH and compatible 4K/HDR | P0 | Tested on named browser/device/media fixtures |
| FR-06 | Source quality and compatibility analysis | P1 | Reject/describe unsupported codec, container, audio, CORS or header constraints |
| FR-07 | Browser-local audio recovery/demux where feasible | P1 | Quality-preserving fixture and fallback tests |
| FR-08 | Pair and revoke self-owned compute agent | P1 | One-time secure pairing; authorized job, cancel and revoke tests |
| FR-09 | Cloudflare own-account deployment | P2 | Documented Worker Lite, verified optional Container path |
| FR-10 | Optional hosted conversion | P2 | Quote, prepaid reservation, hard caps, idempotent settlement and no surprise charge |
| FR-11 | Upstream review and parity tracking | P1 | Provenance files, change review PRs/issues and CI regression gates |
| FR-12 | Accessibility and PWA behavior | P1 | Keyboard navigation, captions, offline shell and update test suite |

## Essential experience

Nuvio account sign-in → familiar library → add-on stream list with quality details → browser capability probe → direct/native playback if compatible → browser-local recovery if possible → user's paired agent if enabled → explicit hosted processing quote only when needed.

Never charge simply because a source is 4K. Never silently use remote compute.

## Non-functional constraints

- Static public site where practical; serverless control endpoints only when needed.
- Media bytes bypass the shared control plane when lawful and technically practical.
- Per-user, per-device and global limits on untrusted add-on execution and processing.
- Hostile-source isolation, SSRF protection, no raw Nuvio refresh tokens on agents.
- Published customer prices and usage caps; internal costing may remain private.
- Source and release provenance; clean builds, verified browser results and rollback.

## Non-goals and caveats

Not universal 8K/HDR/Dolby Vision/Atmos playback. No DRM circumvention or unauthorized torrent/media access. No second general-purpose account platform. No unlimited hosted conversions. No unrestricted provider proxy. No automatic merging from upstream forks.

## Open launch dependencies

Permission to use the hosted Nuvio identity/sync backend at public scale; cross-browser add-on/CORS test evidence; licensing review; payment/consumer-law and age-requirement assessment; infrastructure benchmarks and cost ceilings.
