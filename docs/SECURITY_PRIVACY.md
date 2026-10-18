# Security, privacy, compliance and abuse prevention

## Identity

The user signs in via the existing Nuvio authentication system. Protected NuvioWeb control APIs must verify access tokens against an authoritative upstream endpoint, checking signature/session, expiry, issuer/audience as supported, and verified stable subject. A client-provided user ID or simply decoded JWT is not sufficient. Never collect Nuvio passwords, issue substitute Nuvio identities or send refresh tokens to compute agents. Review existing browser localStorage tokens for XSS risks. Confirm upstream's API permissions for a public paid application.

The [Nuvio identity contract](NUVIO_IDENTITY_CONTRACT.md) records public terms/API evidence, imported flow risks and future verification requirements. Documented third-party API use has public support and the owner accepted proceeding without a separate permission letter on 2026-10-18; undocumented owner/QR/fallback requests and compute/billing identity use remain separate release gates. Principal identity is the configured upstream trust domain plus authoritative subject, never a cached sync owner. User lookup does not by itself prove live-session revocation; pairing and financial actions need an approved session-status contract. Passwords and refresh tokens stay out of the control plane; all Nuvio tokens stay out of compute agents, plugins and logs. Consent to login/sync does not authorize pairing, provider-secret export or charges. These requirements are documented, not implemented or live-tested.

## Agent pairing and authentication

Use expiring one-time pairing codes and explicit approval from an authenticated browser. Agents get scoped device identities and revocable short-lived job credentials; no public inbound admin port by default. Prevent replay/CSRF, cross-account access, agent impersonation, unaudited remote command execution and privilege escalation. Limit the executable to approved processing verbs rather than raw shell command submission.

## Add-ons and remote integrations

Manifest, JS plugin, HTML, subtitles and stream metadata are untrusted. JS runtimes need bounded time, CPU/memory, DOM size, output, network requests and no unrestricted host APIs. Browser Worker alone is insufficient for arbitrary trusted isolation. Server fetch integrations require protocol and destination allowlists, DNS re-resolution and private range filtering, redirect validation, capped headers, bounded response bytes and authentication/rate limits. **Do not deploy an open CORS proxy.**

## Media processing

Only user-authorized media. Do not circumvent DRM or source restrictions. Strict limits on input/output size, CPU, memory, disk, egress, jobs, duration, decompression and file explosion. Isolation among accounts, unique signed job IDs, lifecycle cleanup, no permanent media store by default. Redact URLs with access tokens/queries from logs. Bound expiration of streaming outputs.

## Payment integrity

Signed payment-provider webhook, idempotent event handling and atomic credit grants/reservations/settlement. Quote maximum total user charge before starting; never fallback silently into paid compute. Refund unused reservation according to published terms. Gate access via verified existing Nuvio subject + transaction ledger, not client assertions. Track refund policy, taxation, consumer-law and age-related provider requirements before accepting funds.

## Cost control

Global per-month budget and emergency stop, per-user quota, bounded live workers, no unrestricted traffic relay, storage TTL and egress tracking. Free browser site must remain accessible if compute budget is exhausted.

## License and third-party dependencies

Before importing Alpha, preserve GPL-3.0 and copyright notices. Review licenses of Falcon, GYK and Orochi independently and obligations for serving modified network services. Treat upstream auth/backend as an external operator with usage terms rather than automatically available public infrastructure.
