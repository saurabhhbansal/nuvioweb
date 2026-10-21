# Issue #119 — Library pending, snapshot-limit and concurrent-writer policy

Parent: [#7](https://github.com/saurabhhbansal/nuvioweb/issues/7). Covers A5/O2 and PRD FR-02.
Base: `2116e5b8c70a248a0cd642a1c741eac2dbd06fed`.

## Goal

Characterize the current saved-Library failure/reload/legacy/snapshot-limit behavior, add only the
smallest safe refusal where current behavior can silently discard local data, and publish a finite
supported/unsupported policy. This is not an outbox, CRDT or backend redesign.

## Existing contract

- `SavedLibraryStore` keeps at most 1000 items for one profile (`upsert` slices to 1000).
- `SavedLibrarySyncService.pull(profileId)` pages `sync_pull_library` at 500 and replaces the local
  snapshot only when no pending edit/revision changed. A pending profile keeps local items.
- `push(profileId)` reads `getAll(1000)` and sends a full `sync_push_library` snapshot, then
  acknowledges the captured revision. The remote API is full-replacement, not conflict-aware.
- `SavedLibrarySyncState` tracks `{revision, pending}` per profile; `acknowledge` only clears the exact
  revision.
- Failed pushes remain pending and are retried only by a later explicit Library mutation/sync path;
  there is no retry/resolution UI.
- Same-account concurrent writers have no server version/ETag/merge contract. A later full snapshot
  can overwrite an earlier writer's item.

## Smallest safe behavior

- `push()` reads `getAll(1001)` and refuses to send when the local snapshot exceeds 1000 items. It
  returns `false`, logs a fixed warning and leaves the pending revision intact. This prevents silently
  discarding item 1001 through the existing full-replacement API.
- No automatic retry, outbox, merge, destructive retry button or backend change.
- The supported boundary is one writer at a time for the online sequential scope. Concurrent writers
  remain unsupported and visibly documented; runtime repair needs a server conflict/version contract
  or an owner decision.

## Policy table (published in docs/LIBRARY_SYNC_POLICY.md)

| Operation | Input bound | Pending ownership | Refresh/cancel | Storage failure | Conflict detection | Reversible? |
| --- | --- | --- | --- | --- | --- | --- |
| `sync_pull_library` | 500/page | pending profile keeps local items | session/current revision guard | local cache retained | none | no remote change |
| `sync_push_library` | <=1000 local items, full snapshot | exact revision acknowledgement | no cancellation | pending retained | none (last full snapshot wins) | issued request cannot be undone |
| failed mutation | stored locally | pending until a later mutation | survives reload | runtime metadata fallback | none | local only |
| 1001+ local items | refused | pending retained | n/a | n/a | n/a | no request issued |

## Targets

- `app/alpha/js/core/profile/savedLibrarySyncService.js` (bounded refusal)
- `app/alpha/js/data/local/savedLibraryStore.js` (remove silent 1000-item eviction)
- `app/alpha/js/core/profile/savedLibrarySyncService.test.mjs`
- `app/alpha/js/data/repository/savedLibraryRepository.test.mjs`
- `app/alpha/js/data/local/savedLibrarySyncState.test.mjs`
- `docs/LIBRARY_SYNC_POLICY.md`
- `docs/evidence/issue7-library-policy-2026-10-20.json`
- `docs/evidence/issue7-acceptance.json`, `docs/IDENTITY_VERIFICATION.md`, `docs/PROGRESS.json`,
  `TRACKER.md`, `docs/FEATURE_SUPPORT.md`, `docs/agent-runs/CURRENT.md`, `docs/plans/issues/issue-7.md`

## Non-goals

- No new backend, outbox, CRDT, conflict-resolution UI or automatic stale-snapshot upload.
- No claim that two writers are safe or that a failed push retries automatically.
- No live account or Library write.

## Threats

- A 1001-item local set is silently truncated and the remote 1001st item is deleted by the next full
  snapshot.
- A failed push is reported as synchronized, or an older acknowledgement clears a newer edit.
- A reload loses a pending mutation.
- Two clients each save from a stale snapshot; the later full snapshot loses the earlier edit.
- A pull while a mutation is pending overwrites the local edit.

## Tests

Characterization (current behavior, no product change):
- failed mutation → reload → pull/reconnect retains pending local data and does not falsely clear.
- legacy authenticated nonempty cache without metadata is treated as pending.
- stale revision acknowledgement is refused; newer edit survives an older ack.
- two independent client snapshots show the last full snapshot wins (lost update), recorded as
  unsupported rather than passing.
- The real repository/store retains a 1001st item; the service refuses the >1000 push without a
  request, while exactly 1000 still pushes.

Commands:

```bash
node --test app/alpha/js/data/local/savedLibrarySyncState.test.mjs \
  app/alpha/js/data/repository/savedLibraryRepository.test.mjs \
  app/alpha/js/core/profile/savedLibrarySyncService.test.mjs
```

## Rollback

Protected revert of the scoped change. The refusal only prevents a request; no remote data or
migration is changed. Existing local pending data is preserved.

## Cost, privileges and review

No hosted compute, dependency, credential recipient or new privilege. Characterization and refusal are
local synthetic tests. Distinct automated review is recorded; this is not independent human approval.
Concurrent-writer repair remains unsupported pending a server contract/owner decision.
