# Active Sol issue #7 closure continuation — 2026-10-20

Canonical baseline0d771735; selected implementation issue119 on `fix/issue-119-storage-failures`. Durable run `/home/saurabh/workspace/personal/agent-runs/nuvioweb/sol-issue7-closure-20261020`; [plan](../plans/issues/issue-119-storage-failures.md). Prior PR125/126 repairs are preserved.

Owner explicitly accepted bounded pending/error/manual recovery and deferred provider QR/physical-device verification with honest unsupported labels and follow-up tracking. [Exact answers](../evidence/issue7-owner-scope-2026-10-20.json). These choices preserve O1–O3, actual app propagation, nonempty isolation, natural expiry, offline/rejected refresh. No routine permission is pending.

Storage regressions reproduced red;70 focused tests and4 targeted browser cases pass. Separate actual-diff review approved134cac2; f8ee31f removes CI-reported unused catch binding. PR127 carries bounded completion evidence; final exact-head metadata review, all four CI checks and protected integration still required. Pending/readback failures must never be cleared by a later debounce/inflight operation. No full snapshots, durable outbox or atomic same-key guarantee added. Final exact-head CI/protected merge/deployment are still required.

Natural expiry: provider TTL604800s. Finite reviewed observer PID/deadline/receipt status is in RUN/natural-expiry-observer.json, expected boundary2026-10-27T08:41:40.775Z. Session only in process memory; do not kill or restart it casually, expose process memory, or call waiting a pass. No token/clock modification. Earlier failed metadata probes and successful local-only cleanup receipts remain. Recheck observer liveness plus finished receipt on resume.

Current preview remains0d771735/deployment8bb21fb1 until an exact protected candidate is deployed and read back. Preserve Chrome9222 and unrelated services/data. Remaining app propagation/Library journey and historical failure telemetry work are in RUN/live-plan.md; no direct API insertion may substitute for app Save or receiving-app UI. Full closure still requires default checker0; current A2/A3/A8 unmet; A5 bounded policy has passing local evidence.

---

The following historical run narrative is retained as context, superseded by the active state above:

# Current issue #7 remediation — 2026-10-20

Implementation owner: Sol 6.1/high. Selected implementation unit: **#119**, within parent #7 remediation. #117/#118 closed after protected PR125 and guard readback; #119/#120/#7 remain open. Baseline `0212e733275bcb3b95661b288139b69d8b01c064`; current follow-up branch `fix/issue-119-explicit-library-writes`. [Plan](../plans/issues/issue-7-sol-remediation.md).

The owner's expanded authorization of 2026-10-20 supersedes the earlier live-account pause. Bounded checks with designated disposable identities, protected integration and the existing dedicated development preview are authorized. No routine owner decision is pending. Preserve secrets, unrelated account data and branch protections.

The independent review reproduced a cancelled owner-cache publication and overlapping exchanges cancelling a valid login. Actual-module tests reproduced both red; fixes guard owner lookup side effects, defer establishment caching until final publication, coalesce exchange, serialize polls and invalidate expiry. Browser fixtures now cover both nonempty multi-domain round trips, unexpected destinations, deterministic cancellation completion and expiry. Automated review is required before protected integration; it is not human approval.

Live preflight (guarded private driver): both existing disposable logins and Library reads returned 200; explicit refresh returned 200 and preserved identity. B's documented profiles read returned empty; this is an observed capability/data boundary, not a pass. No account/media data is exported and credential integrity remained unchanged. Hosted fixed-candidate verification and bounded live observations follow protected integration.

Parent O1–O3 remain unchanged and open. A2 needs new-change propagation, A3 preserves an unexplained historical pre-header switch failure, A5 lacks an atomic server conflict contract/durable outbox, A8 lacks measured natural expiry/revocation/QR/device evidence. `--validate` is structural; full closure must refuse while unmet. Children must have real central ledger entries before closure; no guard weakening.

Run artifacts: `/home/saurabh/workspace/personal/agent-runs/nuvioweb/sol-fix-all-20261020`. Credentials must only be read inside a guarded driver, never printed or sent to reviewers. The designated credential path is outside Git and must be hashed before/after tooling. Chrome :9222 and unrelated services remain untouched.

Preview before this run: `7dcc3717742e04745c018eccd342df0915bbe8fe` / deployment `b6451df5-53cb-45d3-9312-361254bf3463`, retained as rollback. It contains old QR defects and is **not a QR validation candidate**. Use a newly served, reviewed fixed candidate and verify SOURCE.txt plus inventory first. Inert rebuild is required after preview staging before local gates.

Historical context is retained in [pre-remediation snapshot](2026-10-20-pre-sol-continuity.md), explicitly superseded. Do not restart DSH sessions or continue unrelated roadmap work.


## After protected PR125 and authorized live work

Runtime remediation merged at `8eec52a7de888d156fac03edd9c523fc16964f7b`; all four required workflows passed at the merge. Existing dedicated preview deployed this exact source (`46d066cf`), 134 inventory hashes verified, automatic worker/source/header checks and all seven hosted guest journeys passed; rollback `b6451df5` retained. Direct live additive Library/history/progress records arrived in an independent disposable session, exact deletes returned204 and all original rows were unchanged. Explicit refresh/local-session revocation/rejection observed; independent A control refresh stayed valid. Credential digest unchanged; no account/media payload exported.

Public API per-item Library operations were a legitimate safe alternative overlooked by the earlier full-snapshot policy. Selected #119 now implements only explicit per-key saves/deletes, never unknown snapshots, preserving unrelated concurrent keys. Same-key order, durable retry/outbox/storage guarantees remain unsupported. Current source/tests/review/hosted results will be recorded in the combined evidence PR; no broad A5 completion claim.

Hosted live driver debugging preserved each failure: initial immediate form check raced mount, then chooser-only wait missed auto-resume, then quick-setup readiness was not awaited. These are driver limitations, not diagnosed causes of the historical post-removal network failure. Do not erase that older failure because of subsequent passes. New revision/observations remain separate receipts.


Runtime/test source `083eb89` for the per-item repair passed 1432 application and 73 browser/PWA cases; separate read-only CLI re-review approved it with independently rerun57 focused tests. Descriptive test titles and combined evidence follow that source in PR126. See [review](2026-10-20-issue119-sol-review.md). Final merge/source/preview/live outcomes are in durable RUN/result.json and RUN/result.md and the linked PR/issue readbacks; a PR merge alone is not deployment. Do not close #7/#119/#120 while A2/A3/A5/A8 remain unmet. QR provider redirect400 and unavailable physical/device environment are genuine dependencies; owner permission is granted.
