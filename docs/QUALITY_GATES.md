# Verification and release quality gates

## Required PR evidence

- Linked GitHub issue and issue-specific written plan.
- Exact commands *executed* and outcomes: lockfile install, build, unit tests, lint, integration and browser tests where relevant.
- Legal redistributable media fixtures or hashes and reproducibility instructions.
- Negative/timeout/revocation/account-switch/budget tests for auth/network/compute changes.
- Security/privacy/cost/licensing assessment and rollback instructions.
- User-visible capability descriptions match tested browser/device results.
- The standing delegation gate in [AGENTS.md](../AGENTS.md): a separate technical review pass over the actual diff (Codex CLI when available, otherwise a recorded reviewer substitution), explicit security/regression checks, and protected exact-head integration. Token validation, plugin sandbox, payment, remote fetching and media processing additionally require targeted negative/security tests and a review pass recorded honestly as automated. New privileges, credential recipients, payment access, dangerous network behaviour or unresolved material risk still require owner escalation rather than self-approval.

## Media and browser matrix

Browsers: Chromium desktop/Android, Edge desktop, Firefox desktop, Safari macOS and iOS. Devices: at least CPU-only laptop, hardware codec-enabled computer and mobile.

Fixtures: H.264 MP4, HLS and DASH, supported 1080p/2160p (including representative 4K60), HEVC/AV1 where available, HDR10/HLG and Dolby Vision only when supported, multitrack/subtitle media, AC3/EAC3 and DTS error/recovery cases, external and embedded text subtitles, Range/seek/resume, expired link, CORS, bad HTTPS, missing codecs and resource exhaustion.

**Do not infer support solely from file extension or marketing resolution label.** Provide device, browser, codec profile, player engine and fixture result for claims.

## Add-on matrix

Manifest installation, configurability, profile sync, catalog/meta/stream/subtitle parsing, missing resource, slow provider, partial results, malformed response, CORS, account logout, safe plugin cancellation, quotas, network failures and unsupported source indicators.

## Abuse and authorization matrix

Expired/fake Nuvio session, cross-user job, invalid paid balance, duplicate payment webhook, race-condition credit reservation, reused pairing code, revoked agent, redirected private IP URL, DNS rebinding, cloud metadata access, invalid media, oversized output, high memory and prolonged CPU.

## Release pipeline

One issue -> reviewed plan -> bounded PR -> green CI -> staging smoke and fixture tests -> canary -> production with monitoring/rollback. Routine verified changes integrate through the standing delegation gate; sensitive changes and production/payment/compute launch remain owner-gated. A failed test stays visible; no invented success reports.

## Recovery safeguards

The [recovery audit](RECOVERY_AUDIT.md), [progress ledger](PROGRESS.json) and root [tracker](../TRACKER.md) distinguish source/build, browser smoke, realistic MVP, beta and production release. The required history preflight blocks local closing references in newly introduced ancestry; the default-branch closure guard reopens tickets lacking a verified ledger entry and merged evidence PR. It repairs accidental closure events; it does not prevent GitHub from briefly emitting one. Original history is retained.

Branch protection requires strict CI and PRs for admins as well as contributors, denies force pushes/deletion, and requires resolved conversations. There is only one collaborator: independent approvals are currently zero. Automated sub-agent review is useful evidence but not independent human approval. Routine verified work may be integrated under the standing delegation recorded in [AGENTS.md](../AGENTS.md); do not merge sensitive changes until the owner has reviewed the concrete result.
