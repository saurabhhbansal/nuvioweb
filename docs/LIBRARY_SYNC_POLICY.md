# Saved Library sync policy — 2026-10-20

Scope: the existing Nuvio saved-Library sync used by NuvioWeb. Parent issue #7 / child #119.
This is a **finite supported/unsupported policy**, not a claim of conflict-free or offline-durable sync.

## Supported boundary

- One writer at a time, online, for the tested sequential save/remove/reload flows.
- A failed write is retained locally as pending; it is not automatically retried. It can be included
  in a later explicit Library mutation/sync path.
- A pull with a pending local edit keeps the local items and does not publish the older cloud snapshot.
- A remote-empty pull removes clean cached items; an explicit local final-item removal sends an empty
  full snapshot.
- The local cache is **not** silently truncated at 1000 items. A 1001st save/pull is retained locally.
  The full-replacement push is **refused** when the local set exceeds 1000, because the API can only
  carry a full snapshot; the pending revision stays intact and remote data is not changed.
- A legacy authenticated cache with no sync metadata is treated as pending (unknown local edits are
  preserved).
- Stale revision acknowledgements are refused, so an older successful push cannot clear a newer edit.

## Unsupported / blocked

| Case | Current behavior | Disposition |
| --- | --- | --- |
| Two independent same-account writers | Both send full snapshots; the later one wins and the earlier edit is lost. | **Unsupported.** Needs a server version/ETag/conflict contract with atomic preconditions. No client-only safe merge. |
| Local set >1000 items | The local cache retains all items; the full-snapshot push is refused without a request and pending remains. | Safe refusal only. A larger library requires pagination/delta API work, not a truncated full snapshot. |
| Automatic retry / outbox / per-item durability | Not implemented. Pending edits wait for a later explicit mutation. | **Unsupported.** No new backend/outbox/CRDT in this scope. |
| Multi-tab atomicity | No cross-tab lock. | **Unsupported.** |
| Storage quota/write failure | `SavedLibrarySyncState` keeps the current-page guard in memory even when `LocalStore.set` fails, so same-page edits stay protected; the push may still proceed against the in-memory state. | Known limitation; no durable guarantee across reload. |
| Server-side conflict detection | None exposed by the checked client contract. | Requires protocol evidence. |
| Already-issued push | Cannot be undone or cancelled once sent. | Documented; local pending handling only. |

## Operation table

| Operation | Input bound | Pending ownership | Refresh/cancel | Storage failure | Conflict detection | Reversible? |
| --- | --- | --- | --- | --- | --- | --- |
| `sync_pull_library` | 500 per page | Pending profile keeps local items | Session/current-revision guard | Local cache retained | None | No remote change |
| `sync_push_library` | ≤1000 local items, full snapshot | Exact revision acknowledgement | No cancellation | Pending retained | None (last full snapshot wins) | Issued request cannot be undone |
| Failed mutation | Stored locally | Pending until a later mutation | Survives reload | Runtime metadata fallback | None | Local only |
| 1001+ local items | Refused before request | Pending retained | n/a | n/a | n/a | No request issued |

## What this policy does not claim

- It does not make two clients safe to edit concurrently.
- It does not guarantee delivery after reconnect or reload; pending data is preserved but not retried
  automatically.
- It does not prove the hosted service's actual transaction/version semantics.
- It does not replace the still-open live/device evidence in #7 or the authorized live observations in #120.
- The Library tab still requests 1000 rows, so a retained 1001st item is not displayed above 1000; the push refusal is currently console-only with no user-facing indicator.


2026-10-20 protocol recheck: [Nuvio public API v1.3](https://nuvio.tv/docs/nuvio-public-api.md) still documents full replacement pushes and delta cursors for reads. It provides no atomic expected-revision/ETag parameter for the replacement. A read cursor or client preflight cannot protect a competing write between read and push. #119 remains open for an atomic server contract plus safe conflict refusal/reconciliation; owner permission is granted and is not the dependency. No live destructive concurrency experiment was used.
