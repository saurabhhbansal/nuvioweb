# M4 workstream plan — hosted compute and prepaid credits

## Goal
Provide simple, low-cost, opt-in hosted conversion with usage pricing that covers true infrastructure costs and modest operating overhead.

## Steps
1. Benchmark audio, remux and video workloads on possible compute backends; include cold start, disk, bandwidth and failures.
2. Verify existing Nuvio token server-side; bind credit ledger to verified stable subject.
3. Define prepaid credit purchase, payment webhook signature verification, replay/idempotency and atomic reservation.
4. Implement quote/max-charge consent, schedule, bounded processing, settle/refund unused credits, cancellation and global budget stop.
5. Load-test quotas, abusive inputs and failure recovery without risking actual charged users.
6. Add clear credit usage and billing terms; internal compute/LLM/maintenance margin inputs remain private.
7. Choose payment provider only after applicable payment, age, tax and consumer-law review.

## Done when
A staging hosted processing job is accurately quoted, authorized, isolated, metered, replay-resistant, cancellable and fully reconciled with failure refunds.

## Risks / rollback
Overbilling, fraudulent webhooks, costly egress, service outage; disable new paid jobs, preserve/reconcile accounting and keep free client online.
