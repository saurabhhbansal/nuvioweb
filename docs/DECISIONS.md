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
| ADR-013 Standing autonomous delegation | Approved | Owner authorized routine autonomous execution 2026-10-19 under a documented integration gate; sensitive privileges, payment and production launch remain owner-gated |

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

The owner supplied the official documentation, accepted documented public-client API use without another permission letter, and authorized a public static preview. Preserve existing Nuvio identity; do not introduce another login or launch paid compute. Unlisted owner/QR/fallback behavior and deployed session guarantees require evidence, not another blanket permission request. The earlier Cloudflare access blocker was resolved in #6; the development preview and its limited verification are recorded in [preview evidence](STATIC_PREVIEW.md).

## Identity documentation acceptance — 2026-10-18

The owner reviewed and approved PR #34 for issue #3's documentation scope and authorized its protected integration after passing checks. The contract is preserved byte-for-byte from `7693878`; this acceptance supersedes its historical pending-review annotations. Existing account identity, consent requirements, guest fallback and all unlisted endpoint/session/compute release gates remain unchanged. Live auth/sync, pairing and entitlements verification remain #7/#14/#20. No implementation, hosted-service exception or production launch is approved by documentation acceptance.

## Standing autonomous development delegation — 2026-10-19

The owner authorized an autonomous development workflow so the roadmap can progress without routine per-PR confirmation. The full delegation, authorized and prohibited actions, and the integration gate are recorded in [AGENTS.md](../AGENTS.md); the quality-gate wording is reconciled in [QUALITY_GATES.md](QUALITY_GATES.md). This supersedes the earlier requirement for routine human approval of every change, not the security, licensing, release or branch-protection requirements themselves.

Routine verified changes may be integrated through the protected PR workflow after a documented plan, passing required checks, a separate technical review pass and explicit security/regression evidence. Authentication and remote-fetch changes additionally need targeted negative/security tests and a review recorded honestly as automated. New privileges, new credential recipients, payment access, dangerous network behaviour, production deployment and unresolved material security or legal risk still require owner escalation; automated review is never presented as independent human approval. Codex CLI is currently unavailable on the execution host, so planning and review use the documented substitute recorded in [the planning record](agent-runs/2026-10-19-codex-unavailable.md).

## Local recovery scope and no-new-WASM decision — 2026-10-19

For issue #12, the local audio/container recovery prototype is bounded to alternate-audio selection with the selected video representation pinned, plus demonstrating the existing hls.js MPEG-TS → fragmented-MP4 transmux. Local decoding or conversion of AC-3/E-AC-3/DTS is out of scope; if that is required for acceptance, it needs an explicit owner decision and must not be described as alternate-track recovery.

No WASM demuxer or remuxer is added. The audited candidate path is LGPL-3.0-or-later with unreproduced build obligations, which fails the permissive-WASM constraint, so arbitrary MKV/AVI/standalone-TS repair stays unsupported and keeps its existing honest message. A future WASM proposal needs an amendment with exact revision, complete component licences, reproducible binaries, notices, delivered sizes, browser APIs, quotas, cancellation and quality effects.

Fixture generation is a gate, not an assumption: if the eligible browser exposes no native AAC encoding, AAC-based fixtures are recorded as blocked rather than skipped or substituted. Audio evidence combines engine track identity, fixture-payload attribution and advancing video with an optional test-only analyser tone check; none of these proves audible output. Full rationale and unit ordering are in the [issue #12 plan](plans/issues/issue-12.md).

## 2026-10-20 — Issue #7 live testing resumed under explicit delegation

The owner's exact expanded instruction is recorded in [AGENTS.md](../AGENTS.md) and the [remediation plan](plans/issues/issue-7-sol-remediation.md). It supersedes the previous live-account pause for bounded disposable-account checks, protected integration and existing development-preview refresh. Earlier dated pause statements are historical. No permission blocker remains for these routine scoped actions; unavailable server contracts or physical devices require concrete evidence.

## 2026-10-20 — Continue from Sol result with autonomous scoped decisions

The owner's continuation instruction is recorded verbatim in [the next #119 plan](plans/issues/issue-119-storage-failures.md). The remediation report is the reference. Select device-storage failure handling next; preserve explicit per-key writes and fail closed before cloud dispatch when device persistence fails. This bounded repair does not introduce durable replay/outbox or claim server conflict guarantees. Missing QR-provider access and physical devices are asked as capability questions while independent work continues.

## 2026-10-20 — Explicit #7 recovery and device scope decisions

Owner responses relayed in the current run: “Accept bounded recovery; track stronger guarantees separately” and “Defer QR/device verification; label limits and track follow-ups”. [Exact decisions](evidence/issue7-owner-scope-2026-10-20.json). #119 acceptance is the tested pending/error/manual-reconciliation policy; durable operation replay and atomic same-key ordering move to separately tracked follow-up work. Provider QR and physical named-device observations are explicitly deferred, with unsupported capability labels and follow-up tracking. These decisions do not waive original O1–O3, actual application propagation, account isolation, natural expiry, offline recovery or rejected refresh. The default closure checker remains unchanged and must pass before #7 closes.
