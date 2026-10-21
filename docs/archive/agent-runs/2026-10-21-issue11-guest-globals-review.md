# #11 guest console / owner-added local scrapers — separate automated review

## Fixed point, scope and substitution

- Base: previous protected PR143 merge **63e1e4fcaa4ca5dbed1733009b4e8f86eda18c58**.
- Reviewed source/evidence head: **048977f94495de026e7c6da5b59e075e3ca8e403**, one commit,14 files,+767/−17.
- Captured comparison: `git diff 63e1e4fcaa4ca5dbed1733009b4e8f86eda18c58...HEAD`; ancestry: `git log 63e1e4fcaa4ca5dbed1733009b4e8f86eda18c58..HEAD --oneline`. Both reviewers resolved refs and inspected the actual nonempty diff independently.
- [Plan](../plans/issues/issue-11.md), [exact-layer report](../evidence/issue11-real-plugins-2026-10-21.md), [sanitized four-artifact receipt](../evidence/issue11-guest-globals-2026-10-21.json), [draft PR144](https://github.com/saurabhhbansal/nuvioweb/pull/144).
- Codex CLI was unavailable (`command -v codex` produced no path). Substitution: two distinct read-only automated subagents, separate Standards and Spec contexts. **Automated review, not independent human approval.** Required independent approvals0 is a repository limitation, not an approval claim.
- Standards sources: [AGENTS](../../AGENTS.md), [contribution rules](../../app/alpha/CONTRIBUTING.md), [charter](../PROJECT_CHARTER.md), [PRD](../PRD.md), [decisions](../DECISIONS.md), [roadmap](../ROADMAP.md), [security/privacy](../SECURITY_PRIVACY.md), [quality gates](../QUALITY_GATES.md). No issue-tracker skill file existed; no unrelated setup/infrastructure was created.
- Spec: original [#11](https://github.com/saurabhhbansal/nuvioweb/issues/11) plus consolidated owner brief captured in the plan. Original parent acceptance remains unchecked/open; no source-provenance deferral of the requested four real artifacts.

## Standards

Reviewer **91122533-f55c-42e3-bb20-8725923786e9**: **0 hard documented-standard violations, no blockers**. Guest-only no-op console retains/serializes no logs; broker and all budgets unchanged; source callers manual-only; strict diagnostic exact-field/enum/count projection and secret-injection negative. Evidence separates real unchanged code from unused synthetic transport, zero rows from compatibility, QuickJS from Hermes, and required-header delivery consequence from completeness.

**P3 nonblocking baseline judgement call — possible Duplicated Code:** [diagnostic resolver:98–100](../../app/alpha/scripts/pluginSourceProbe.mjs#L98-L100) repeats the [adapter bootstrap:43–48](../../app/alpha/scripts/pluginGetStreamsPrototype.mjs#L43-L48); [prelude source-text slicing:51–53](../../app/alpha/scripts/pluginSourceProbe.mjs#L51-L53) can drift on future adapter refactors. Consider sharing a guest prelude/bootstrap builder when next changing that seam. **Disposition:** accepted as a future maintainability risk, not a documented-rule violation or security/acceptance blocker. Do not broaden this small console/evidence change into an unrelated executor refactor; existing deterministic probe tests guard the current seam.

Reviewer executed Node22.23.1 with the pinned PATH:

```sh
node --version
node --test app/alpha/scripts/pluginGetStreamsPrototype.test.mjs app/alpha/scripts/pluginSandboxBoundary.test.mjs app/alpha/scripts/pluginSourceProbe.test.mjs
```

**20/20 pass**,0 fail/skip,exit0,~5.9s. No edits, raw-source/network CLI reruns, account access or server starts.

## Spec

Reviewer **cf348072-09a8-4339-a398-7f2fbfc71f86**: **0 actionable defects,0 scope creep**. Three informational overall acceptance/parity limits:

1. Representative actual scripts still yield0 normalized streams; xprime/vixsrc/PenguPlay stop at request-option refusal, hdhub4u cannot load the named parser. Evidence correctly refuses stream/playback acceptance.
2. Quotas/escape negatives establish the bounded guest/synthetic-broker seam, not live streamed/DNS/persistent budgets or universal isolation. No proxy/deploy was added.
3. Upstream console/fetch/timers/Promise parity is incomplete: timers absent and fetch restricted. The owner amendment follows the demonstrated chain rather than speculative polyfills; no tested path reached timers. That is explicitly disclosed, not hidden or replaced by fake timers/parser.

All three requested Tapframe files were attempted unchanged at the exact pin despite manifest25-versus28/only-vixsrc declaration discrepancy. Required-header rows need an authorized header-capable proxy/compute/native rung, torrents a debrid/compute rung; neither was implemented. [#142 comment](https://github.com/saurabhhbansal/nuvioweb/issues/142#issuecomment-6309232028) is the expressly requested evidence-only cross-ticket note. **Keep #11 OPEN/in_progress.** Spec reviewer read only; no tests or network/account reruns.

## Security, privacy, regression and integration checkpoint

Parent executed focused77/77, app1493/1493, existing actual-WASM local Chromium16/16, docs/governance15/15, lint/default inert12-asset build and both audits0 vulnerabilities. New diagnostic privacy tests reject a secret-bearing enum and export only header-presence/sample field names—not header values/URLs/logs. Existing SSRF, redirects, host constructor/sentinel/prototype, timeout, memory/output, cancellation and late-result tests remain in the passing focused corpus. No app execution enablement, dependency, guest privilege, credential recipient, parser/module loader, live provider transport, hosted compute or deployment. Source GPL metadata recorded, no provider source redistribution; existing notices/history untouched. Public-source downloads already issued cannot be undone.

Failures retained: console red0/1 before facade; flood control15/16 due unrelated empty-group dropped-count expectation, replaced with a valid recovery row without changing normalizer/budgets; manifest all-three-declared preflight failed before execution, corrected to report metadata rather than block source attempts. A local metadata command guessed nonexistent `scripts/check-roadmap-issues.mjs` and failed MODULE_NOT_FOUND; actual [governance workflow](../../.github/workflows/governance.yml) was read and the real progress/docs/ancestry/governance commands passed. This was an invocation error, not a product failure or claimed pass.

Procedural disclosure: parent/reviewer bash/write payloads sometimes included `sandbox_permissions` despite the request to omit it. Runtime was already danger-full-access. One Spec-review workspace-write request was rejected by tool validation as not strictly wider, then the same safe read-only command ran in the existing danger-full-access mode. That was a validation rejection/retry, not a filesystem-access denial or successful privilege escalation; no approval prompt, additional privilege or broadened operation occurred. This does not authorize future escalation. Prior public-upstream raw-inspection transcript exposure remains disclosed separately in the historical report; no raw source/constants were dumped by this continuation.

Strict/up-to-date/admin/conversation enforcement and no-force-push/deletion protections were read back intact; four required contexts unchanged. Final-head and actual-merge checks, resolved conversations, match-head merge and post-merge issue audit **remain pending at this checkpoint**. No integration success is inferred from local/reviewer tests. Durable exact-head/merge check receipts will be posted to PR144/#11 after actual completion; this record cannot pre-certify its own future merge.

**Summary:** Standards0 hard violations/1 nonblocking P3 heuristic; Spec0 actionable defects/3 declared overall limitations. No cross-axis reranking; no human-approval claim.
