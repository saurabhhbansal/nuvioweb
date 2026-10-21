# Issue #11 real-provider boundary unit — automated review

**Automated technical review, not independent human approval.** Codex CLI was unavailable on PATH; two separate read-only reviewer agents performed Standards and Spec passes. The repository's [standing gate](../../AGENTS.md) and [quality policy](../QUALITY_GATES.md) apply; the generic skill's issue-tracker helper is not installed here, so this repository's plan/issue/gh workflow was used. No reviewer accessed ignored/private state, account material, raw candidate source or real endpoints. No production/preview rollout is reviewed or authorized by this record.

## Fixed diff and scope

Base **0ea7c877d596c182a008df6040c8792cbec4469c**, reviewed head **f354734f7ff675d0afb3a5eb22157eb0fcdad49e**:

```sh
git diff 0ea7c877d596c182a008df6040c8792cbec4469c...f354734
git log 0ea7c877d596c182a008df6040c8792cbec4469c..f354734 --oneline
```

One implementation commit,9 files,760 insertions/9 deletions. Restricted test-only adapter now refuses unsupported nested behaviorHints pre/post-serialization; synthetic regressions and boundary probes; exact-layer real HTTP/public-code evidence; #11-only tracker/ledger/plan updates. No shipped app integration, dependency, fetch privilege, proxy, CI configuration or deployment change. [Evidence](../evidence/issue11-real-plugins-2026-10-21.md) preserves failed source execution, instrumentation failures and unmet original acceptance.

## Standards

**Fixed-diff findings:1 P2 documented wording violation;0 actionable heuristic smells.** The [plan](../plans/issues/issue-11.md#L305) initially said required review/privacy/protected checks were recorded “as actually completed,” while the [report](../evidence/issue11-real-plugins-2026-10-21.md#L126) correctly marked actual-diff review and four exact-head/merge checks pending. This violates the executed-outcome requirements in [agent rules](../../AGENTS.md#L10) and [quality policy](../QUALITY_GATES.md#L6).

**Correction verified separately in working tree:** plan now explicitly separates completed local/privacy/session cleanup from pending automated review and exact-head/actual-merge integration at that checkpoint. The reviewer re-read this amendment and reports no remaining actionable documented-standard violation or smell. The finding remains historically accurate for f354734; it is not erased or retroactively called clean. Dual guest/host validation is intentional trust-boundary defense, not unnecessary duplication.

Reviewer actually ran ref/diff/log inspections, `node --check` on the three changed modules and whitespace check: pass. Reviewer Node was **24.21.0**, distinct from author/CI pinned22.23.1. It did not rerun full/focused/browser tests or independently establish plan-first timing/protected enforcement. No private reads, edits or external calls.

## Spec

**Fixed-diff findings:1 P2 evidence-wording inconsistency (same underlying finding as Standards);0 remaining runtime blockers.** Spec pass independently found the pending-gate contradiction, then re-read the corrected plan and confirmed resolution in the working tree. It specifically accepts only scoped test/evidence integration, not completion of real-installed-JS compatibility or live-network/general-escape acceptance.

Reviewer executed:

```sh
node --test app/alpha/scripts/pluginGetStreamsPrototype.test.mjs app/alpha/scripts/pluginSandboxBoundary.test.mjs
```

**14/14 pass**,0 skips on Node24.21.0. Public tracked diff/evidence only; no private state, edits or external provider calls. No requested source change, scope creep or silent manufactured pass found. Acquisition of a matching installed JS artifact, live transport and product-level acceptance stay deferred in [#11](https://github.com/saurabhhbansal/nuvioweb/issues/11).

## Security, privacy, cost and regression disposition

- Real rows remain HTTP evidence/host projection, not executed installed code. Public third-party wrapper fails before dispatch and is explicitly not installation-matched. No source with embedded third-party credentials was imported/dispatched/published.
- Fail-closed behaviorHints refusal preserves unsupported header requirements rather than mislabelling a stripped URL playable. Pure normalizer remains unchanged.
- New actual-QuickJS constructor/import/host-sentinel/prototype/direct-binding/redirect/cancel probes complement existing quotas/teardown tests. Synthetic transport observations are not live DNS/streamed-response/general escape proof.
- Published repository evidence has counts/booleans/hashes/public metadata; the implementer's private-literal and deliberate token-injection negative checks passed. Fresh owned session local logout204 and exact private file cleanup are separate implementer evidence, not independently audited by reviewers. A later implementer disclosure narrows the privacy claim: initial raw inspection of public upstream source emitted encoded third-party credential constants into the session tool transcript. No owner credentials were involved; constants are not repeated in repository evidence or dispatched, and the raw file was removed. The session transcript cannot be retroactively cleaned by a repository pass.
- No new service/charge/credential recipient/privilege, no app enablement, no other issue/session/observer or deployment interaction. Already-issued reads cannot be rolled back. Revert through protected PR reverses this narrow refusal/test/evidence unit only.
- Both reviewers allow normal protected integration **only after** the correction is committed and all four required final-head and actual-merge contexts are actually green. Independent required approvals remain0, a limitation rather than human approval. No bypass.

**Summary:** Standards1 documentation finding/0 actionable smells; Spec1 documentation finding (same contradiction)/0 remaining runtime blocker. Both independently verified the explicit pending-gate wording correction; all source changes remain exactly the reviewed f354734 tree. [PR143](https://github.com/saurabhhbansal/nuvioweb/pull/143) carries final-head and merge integration status; this record itself does not invent those future checks.
