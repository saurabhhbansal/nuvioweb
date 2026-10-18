# Project roadmap and milestones

Milestone status: all in planning at 2026-10-18. Issues are the execution unit; each implementation issue needs a dedicated plan and test evidence. No release date is promised.

## M0 — documentation, governance and test policy

Publish initial audit, PRD, decisions, security model, source attribution strategy, feature parity table, coding agent rules, issue templates and a backlog. Add lightweight docs validation and staging CI policy.

**Exit gate:** all foundational docs committed on main, backlog linked, repository accepts reviewed PRs.

## M1 — reproducible upstream app baseline

Import pinned Alpha web with GPL license notices/history/provenance. Run clean install/build/lint/test. Deploy staging static build to Cloudflare. Check existing Nuvio auth/sign-out/account switching/profile sync; HTTP add-on manifest; legal media fixture. Feature-gate absent server bridges.

**Exit gate:** working staging app with reproducible CI results and known limitations.

## M2 — add-ons and original-quality playback

Build manifest/catalog/meta/stream/subtitle interoperability matrix. Prototype sandboxed Nuvio JS plugin runtime; bounded network/quotas. Add source capability analysis, browser codec/media probes and ranked quality options. Port verified Falcon local decoder/remux patterns. Run cross-browser 4K/HDR/audio/subtitle fixture tests.

**Exit gate:** tested supported-device matrix, no central compute required for compatible videos.

## M3 — bring-your-own compute

Define versioned executor protocol. Implement signed agent pair/revoke using server-verified Nuvio identity. Package a one-service Docker image (FFmpeg), secure outbound connectivity, authorized fixtures, cancel/expiry/cleanup. Provide Cloudflare Worker Lite deployment then verify assisted Worker+Container option. Evaluate optional desktop helper.

**Exit gate:** pairing and a complete self-host legal test playback flow succeed without operator-borne media relay.

## M4 — optional hosted compute

Bench and compare on-demand compute, storage and bandwidth. Implement control API, quotas, quote/reserve/settle credit ledger and global cost kill switch. Integrate signed payment webhooks only after legal review. Use existing Nuvio identity; never build a separate account database.

**Exit gate:** authorized, priced, finite-charge conversion in staging with refunds, replay protection and operational caps.

## M5 — maintainability and release

Scheduled upstream revision comparison and reviewable issues/PRs, regression tests, supply-chain checks, threat model, license audit, canary/rollback, browser accessibility and user-facing contribution/support documentation.

**Exit gate:** repeatable, evidence-backed releases and documented maintenance ownership.

## Ordering

M0 is a prerequisite. M1 is required before M2; M2 source descriptor underpins M3. Identity and billing design may be researched early but paid job launch waits for M3 security gates and cost benchmarks. Individual issues may parallelize only if interfaces and integration tests are specified.
