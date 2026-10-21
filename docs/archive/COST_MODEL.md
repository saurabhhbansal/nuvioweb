# Compute costing, donations and fair pricing

## User-visible offering

**Free:** compatible add-ons, normal library sync, original-quality direct playback and browser-local processing.

**User-owned compute:** same application, agent installed on their own Docker/NAS/VPS/PC or supported Cloudflare account. No hosted compute fee charged by NuvioWeb; their provider and electricity bills are their responsibility.

**Hosted compute:** optional, prepaid, clearly quoted, bounded conversion job or capacity pack; no subscription advertised as unlimited. Customers must see actual credit prices, job maximum cost, limits, cancellation and unused-credit policies.

**Voluntary donation:** supports maintenance without promising gated functionality. Payments exchanged for compute access are purchases, not disguised donations.

## Internal pricing formula (not public invoice breakdown)

All-in processing cost = resource CPU + billed memory + disk + request/API overhead + ingress/egress + payment-provider fees + expected failure/retry costs + abuse/operational contingency + modest maintenance/agent/LLM development allocation.

Internal unit inputs and margin need not be itemized publicly. The final customer price and terms must be disclosed. Do not estimate revenue or prices without benchmarks.

## Metering specification

- Atomic preauthorization of maximum customer quote and credit reserve.
- No processing job starts unless user has expressly opted in and reservation succeeds.
- Unique idempotency keys for payment and processing events; ledger entries are append-only or otherwise auditable.
- Charge settled actual usage *within* user-approved maximum; release/refund unused reservation as published.
- Bounded per-job time, bandwidth, concurrent jobs, output size and global spend.
- Free app unaffected by hosted compute outages or exhausted monthly caps.

## Benchmarks needed before launch

Measure CPU seconds, memory+disk time, startup latency, output bitrate, source ingress, egress by region, storage TTL, successful/failed/retried conversion rates for audio-only, remux, subtitles and representative video jobs. Compare Cloudflare Containers with alternative on-demand VPS/containers. Prioritize processing on user-owned hardware and keep central media traffic out of the control plane.
