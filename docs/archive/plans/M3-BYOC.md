# M3 workstream plan — self-managed compute

## Goal
Allow a user with a home server/NAS/VPS/PC to install one small agent, pair it to their existing Nuvio account, and process authorized fixtures without platform compute charges.

## Steps
1. Version compute protocol, job state machine, executor capability probe and bounded authorized source descriptor.
2. Design server-verified Nuvio subject pairing, one-time code, expiring signed leases, key rotation, revocation and replay protection.
3. Implement FFmpeg agent restricted to approved processing verbs with hard resource budgets.
4. Package Docker image and Compose health-check installer; no public inbound admin service by default.
5. Verify outbound agent connection, user-owned direct transfer, Range/resume, retries and timeout cleanup.
6. Provide Cloudflare Worker Lite template; validate whether Containers setup can actually be streamlined before release.
7. Evaluate optional signed desktop helper for PCs, including uninstall/data removal and background lifecycle.

## Done when
Legal fixture pair -> process -> playback -> cancel -> revoke passes. No remote media relay through central operator. Instructions work on a clean supported install.

## Risks / rollback
SSRF, agent compromise, compute abuse, NAT issues, platform cost; disable remote execution without breaking direct browser playback.
