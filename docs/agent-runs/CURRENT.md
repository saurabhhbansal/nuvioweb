# Current issue #7 remediation — 2026-10-20

Implementation owner: Sol 6.1/high. Selected issue: **#7 only**, with acceptance children #117–#120. Baseline `0212e733275bcb3b95661b288139b69d8b01c064`; feature branch `fix/issue-7-review-remediation`. [Plan](../plans/issues/issue-7-sol-remediation.md).

The owner's expanded authorization of 2026-10-20 supersedes the earlier live-account pause. Bounded checks with designated disposable identities, protected integration and the existing dedicated development preview are authorized. No routine owner decision is pending. Preserve secrets, unrelated account data and branch protections.

The independent review reproduced a cancelled owner-cache publication and overlapping exchanges cancelling a valid login. Actual-module tests reproduced both red; fixes guard owner lookup side effects, defer establishment caching until final publication, coalesce exchange, serialize polls and invalidate expiry. Browser fixtures now cover both nonempty multi-domain round trips, unexpected destinations, deterministic cancellation completion and expiry. Automated review is required before protected integration; it is not human approval.

Live preflight (guarded private driver): both existing disposable logins and Library reads returned 200; explicit refresh returned 200 and preserved identity. B's documented profiles read returned empty; this is an observed capability/data boundary, not a pass. No account/media data is exported and credential integrity remained unchanged. Hosted fixed-candidate verification and bounded live observations follow protected integration.

Parent O1–O3 remain unchanged and open. A2 needs new-change propagation, A3 preserves an unexplained historical pre-header switch failure, A5 lacks an atomic server conflict contract/durable outbox, A8 lacks measured natural expiry/revocation/QR/device evidence. `--validate` is structural; full closure must refuse while unmet. Children must have real central ledger entries before closure; no guard weakening.

Run artifacts: `/home/saurabh/workspace/personal/agent-runs/nuvioweb/sol-fix-all-20261020`. Credentials must only be read inside a guarded driver, never printed or sent to reviewers. The designated credential path is outside Git and must be hashed before/after tooling. Chrome :9222 and unrelated services remain untouched.

Preview before this run: `7dcc3717742e04745c018eccd342df0915bbe8fe` / deployment `b6451df5-53cb-45d3-9312-361254bf3463`, retained as rollback. It contains old QR defects and is **not a QR validation candidate**. Use a newly served, reviewed fixed candidate and verify SOURCE.txt plus inventory first. Inert rebuild is required after preview staging before local gates.

Historical context is retained in [pre-remediation snapshot](2026-10-20-pre-sol-continuity.md), explicitly superseded. Do not restart DSH sessions or continue unrelated roadmap work.
