# M1 workstream plan — reproducible web baseline

## Goal
Import tested Alpha NuvioWeb browser application as the lowest operational-cost baseline, preserving history/provenance and license.

## Steps
1. Confirm pinned Alpha web SHA against current head, review changes and compatibility.
2. Choose subtree/history-preserving import; preserve GPL LICENSE and notices; record original upstream commit.
3. Establish Node/npm lockfile builds, lint and tests; document failures before changes.
4. Configure nonsecret client settings and deploy Cloudflare Pages preview; do not include server secrets in JS.
5. Inventory and feature-gate Trakt, debrid and external-return sidecars when not deployed.
6. Exercise Nuvio account login/session refresh/logout and account switching; sync profile and addon state.
7. Test lawful HLS/MP4 stream against browser constraints and PWA offline/cache handling.

## Done when
Reproducible clean build and tests with evidence, known good staging preview, tested Nuvio sync and addon/playback fixture. Upstream and licenses documented.

## Risks / rollback
API permission unknown, CORS and token security, stale SW cache; revert to prior known-good staging build.
