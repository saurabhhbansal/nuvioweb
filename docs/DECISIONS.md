# Architecture decision record — as of 2026-10-18

| Decision | State | Rationale |
| --- | --- | --- |
| ADR-001 Alpha web as baseline | Approved | Most practical fresh static browser implementation |
| ADR-002 Existing Nuvio identity | Approved direction; implementation/service scope gated | No second end-user auth; authoritative subject distinct from sync routing owner; see [contract](NUVIO_IDENTITY_CONTRACT.md) |
| ADR-003 Free compatible playback | Approved | High bitrate / 4K / HDR is not itself a paid capability |
| ADR-004 Separate HTTP addon and JS plugin layers | Approved | Broader compatibility with bounded sandbox |
| ADR-005 Local before remote compute | Approved | Cost and quality preservation |
| ADR-006 Optional own-host compute | Approved | Simple install/secure pairing, user resource ownership |
| ADR-007 Optional paid managed compute | Approved in principle; payments not authorized to launch | User-facing transparent credits, hidden internal costing, modest margin |
| ADR-008 Cloudflare static + small control API | Approved | Minimal shared cost when idle |
| ADR-009 No central video relay by default | Approved | Avoid huge cost and privacy bottleneck |
| ADR-010 Scope and test gates per PR | Approved | Agent development must be auditable and reversible |
| ADR-011 Upstream sync by review, not blind merge | Approved | Divergent forks / regressions |
| ADR-012 Authorized media only, no DRM circumvention | Approved | Safety, rights and platform constraints |

## Open validation questions

1. Public API v1.3 and service terms support documented third-party operations. Permission/semantics for imported unlisted owner/QR/fallback requests, monetized compute identity, aggregate capacity and live-session verification remain unresolved; see the dated [identity evidence and release gates](NUVIO_IDENTITY_CONTRACT.md).
2. Can source and plugin network calls succeed from supported browsers, or is a *narrowly restricted* server integration needed?
3. Which GYK JS runtime APIs can be used with correct dependency and source licensing?
4. Which codec and HDR/audio combinations are realistically supported across Chrome, Edge, Firefox, Safari and mobile?
5. What is the real compute and egress cost per authorized audio remux, audio decode and video conversion?
6. Which deploy-to-Cloudflare flows truly auto-provision the required Worker/Container components?
7. Which payment provider and regulatory/tax/account requirements can be supported responsibly?

Any disputed answer requires new source evidence, tested reproduction, and an added decision record.

## Owner preview decision — 2026-10-18

The owner supplied the official documentation, accepted documented public-client API use without another permission letter, and authorized a public static preview. Preserve existing Nuvio identity; do not introduce another login or launch paid compute. Unlisted owner/QR/fallback behavior and deployed session guarantees require evidence, not another blanket permission request. Cloudflare access is currently expired; reconnecting the account is an external dependency.
