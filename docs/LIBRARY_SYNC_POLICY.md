# Saved Library sync policy — 2026-10-20

Parent #7 / child #119. This bounded policy preserves explicit operations; it does not claim conflict-free same-key edits or offline durability.

## Supported operations

The public [Nuvio API v1.3](https://nuvio.tv/docs/nuvio-public-api.md) documents additive `sync_push_library_items` and exact-key `sync_delete_library_items`. A bounded disposable-account experiment observed both endpoints return204, independent-session arrival and exact cleanup with all original rows unchanged. Read cursors are not atomic write preconditions, but these per-item operations safely preserve **unrelated keys** without them.

The application queues only an explicit UI save/remove, including the exact content type and ID. Debounce retains every distinct key and the final same-key local intent. Session/profile queue tails serialize operations; account changes discard unsent work. Requests copy their input before awaiting. Each write carries one exact key, so a 1001st local item neither evicts another item nor causes a truncated replacement upload. Local cache and pull pagination retain >1000 rows; the Library screen still displays at most1000.

Successful operations acknowledge only their captured revision when the full known queue succeeded. A failed predecessor or unknown legacy pending snapshot is never acknowledged by a later successful explicit operation. Pulls preserve pending local cache. Clean empty remote snapshots clear clean local data. Removing a final item sends its exact delete, which preserves concurrent unrelated additions.

## Unsupported behavior and safe refusals

| Boundary | Behavior / dependency |
| --- | --- |
| Unknown legacy snapshot or implicit `push(profileId)` | Refused; no full replacement and no inferred deletion. Explicit subsequent edits send only their own keys, leaving earlier unknown edits pending. |
| Missing/rejected per-item endpoint | Local pending retained; no fallback to legacy replacement. |
| Failed edit → reload/reconnect | Local cache/pending marker survives successful browser storage writes. Per-key queue is memory-only; no automatic retry or durable per-key outbox. Earlier failed edits require explicit user reconciliation and remain pending. |
| Same key edited by independent clients | Provider applies arriving operations; no version/ETag precondition, timestamp conflict UI or atomic merge is established. Unsupported ordering guarantee. Distinct-key edits are supported by additive/exact-delete semantics. |
| Multi-tab coordination | No cross-tab lock; same-key ordering unsupported. |
| Browser storage quota/write failure | Same-page pending guard retained in memory; no durable guarantee across reload. A local item write can fail independently; do not infer cloud or local persistence from UI alone. |
| Already-issued writes | Cannot be undone or cancelled on the server. Session guards control subsequent requests/publication only. No destructive snapshot rollback. |

## Operation table

| Operation | Input | Ownership/cancellation | Result |
| --- | --- | --- | --- |
| `sync_pull_library` | 500 rows per page | Session and local revision guard | Clean snapshot hydrate; pending cache retained |
| Explicit save | One known item to `sync_push_library_items` | Captured session/profile and queue revision | Additive upsert preserves unrelated keys |
| Explicit remove | One known `(content_id, content_type)` to `sync_delete_library_items` | Same guard; absent local item does not guess its remote type | Exact delete preserves unrelated keys |
| Unknown full snapshot | No request | Refused | Pending retained; no silent upload |

#119 stays open for durable retry/storage failure and same-key concurrent conflict guarantees. Owner permission is granted; the remaining dependencies are capabilities, not routine approval. #120 retains actual hosted/new-change/QR/device/lifecycle observations; direct API setup is separate from application write-path evidence.
