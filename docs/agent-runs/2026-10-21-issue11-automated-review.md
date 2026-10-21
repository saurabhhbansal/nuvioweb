# Issue #11 — separate automated actual-diff review

2026-10-21 UTC. **Automated review, not independent human approval or sensitive rollout authorization.** Codex CLI was unavailable (`command -v codex` returned no path), so distinct read-only reviewer agents substituted. They accessed only public/tracked diff and synthetic tests; no private account state/provider/runtime/observer operations.

Base `79ccee700d54cd9647c2d6542645c9c7df8d1b69`; first reviewed head `ca325a760f234965c442ed415f5bc1a73ffd26b2`. Command: `git diff 79ccee7...ca325a7`; one commit `ca325a7 test: bound plugin prototype lifecycle and narrow API parity; Refs #11`. Both reviewed the actual19-file diff including new modules, not just documentation. [Plan](../plans/issues/issue-11.md), [evidence](../evidence/issue11-bounded-lifecycle-2026-10-21.md).

## Standards

- **P2 documented-policy breach:** adapter passed descriptor.allowedHosts to broker without independently trusted approval, unlike the session seam. A synthetic descriptor self-authorized `not-approved.example`, causing one dispatch and success. Violates the pinned security note's declaration-vs-authorization rule and destination-allowlist policy. Correction: adapter requires trusted `approvedHosts`; empty/missing/mismatched approval fails `host-policy` before VM/transport; zero-dispatch regression added.
- **P3 heuristic only — possible Duplicated Code:** four-field media-input projection duplicated in adapter/session, risking privacy allowlist drift. Correction: shared `pluginPrototypeInput.mjs` used by both. Not a documented hard violation.
- Reviewer ran focused tests62/62, exit0 with Node24.21.0, not the pinned integration toolchain; no independent build/browser run. Noted QuickJS teardown assertion despite test pass, no introduced-regression claim.

## Spec

- **P2 fail-closed adapter defect:** guest stream/array `toJSON` could add required headers/subtitles after the in-guest check; normalization silently removed them and returned `ok:true,dropped:0`. Violated the planned unsupported-playback-metadata refusal. Correction: network prototype applies trusted host policy to plain serialized/parsed output **before normalization**; adapter checks required headers/subtitles/infoHash and object URLs there. Serializer and changing-getter regressions plus a real-browser serializer case added.
- Actual installed-JS-plugin, real-transport DNS/private-address/streamed quotas, persistent quotas and sensitive integration remain intentionally unverified parent acceptance, not grounds to invent a pass or weaken this subunit's gate. Keep #11 open/default-off.
- No unrelated scope creep or fabricated layer/provider pass found. Reviewer independently reproduced serializer bypass and reran focused62/62; those tests missed the bypass before correction.

Initial summary: Standards1 documented P2 +1 heuristic P3; Spec1 P2. Both blockers require correction/review before integration.

## Additional teardown investigation

A child-process regression caught the real swallowed `JS_FreeRuntime` assertion (exit1) even though the old test reported pass. Initial isolated allocation tests did not reproduce it. Subset minimization identified **sync unbounded recursion**, not allocation. Tagged boundary probe observed host `RangeError` during evaluation; guest512KiB stack allowance exceeded the host/WASM recursion ceiling before a guest exception handle returned. Defensive probe-handle disposal alone did **not** fix it (retained red run). Tightening the guest stack to64KiB made the original recursion case and exact assertion regression pass, with no suppression. A shared finite budget validator now enforces64KiB as the hard stack ceiling in both variants, and consistent UTF-8 input/output guards. All temporary tagged debug instrumentation removed.

## Corrected-source re-review

Both same-axis reviewers independently inspected actual correction delta `ca325a7...2dbe2da3db5afc931ea9bf0f5d507875a96b72a5`, including new files, against the original base/spec:

- **Standards:** previous P2 trusted-host breach and P3 duplication resolved; no remaining documented Standards/security breach, new blocker or actionable smell. Independently ran4 targeted regressions (host declaration, serializers/getters, invalid budgets, actual child recursion teardown) on Node22.23.1:4/4 pass,0skip, exit0, no assertion diagnostics. No build/browser rerun.
- **Spec:** previous serializer P2 resolved by trusted parsed-output validation before normalization; independently confirmed approved-host gate and stricter stack/input/output budgets. Full focused broker/sandbox/session/adapter command on Node22.23.1:65/65 pass,0skip, exit0, no previous assertion. Browser serializer test inspected, not rerun. No new actionable Spec blocker, unrelated scope or fabricated acceptance.

Final source-review summary: Standards0 remaining hard findings/0 actionable heuristics; Spec0 remaining subunit blockers. Actual installed-plugin/real-transport/persistent-budget/rollout acceptance remains deliberately incomplete. Reviews establish neither human approval nor security escape resistance. Owner's final local full1481/Chromium16 and protected CI outcomes are separate in [evidence](../evidence/issue11-bounded-lifecycle-2026-10-21.md). Later documentation-only evidence reconciliation is not a new runtime change; exact final-head required checks still apply.
