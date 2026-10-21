# Library sync policy

How saved Library items move between this device and the Nuvio cloud. Updated for #162.

## API

The [Nuvio public API](https://nuvio.tv/docs/nuvio-public-api.md) offers three Library calls, all used as documented:

| Call | Used for |
| --- | --- |
| `sync_pull_library` | Reads the profile's cloud list, 500 rows per page, up to 1000 items |
| `sync_push_library_items` | Adds or updates items; other items are untouched |
| `sync_delete_library_items` | Removes items by exact `(content_id, content_type)`; other items are untouched |

Every item keeps its own content type, including types other than `movie` and `series`.

## Outbox

- A signed-in save or remove updates the local list and adds one operation to a per-profile outbox in browser storage (`savedLibrarySyncOutbox`).
- The outbox holds one operation per item. A later save or remove of the same item replaces the earlier one (last write wins).
- The outbox is sent about half a second after a change, on every pull (startup and the two-minute sync cycle) and when the browser comes back online. Saves go in one upsert call and removals in one delete call.
- An operation leaves the outbox only after the cloud confirmed it. A change made to the same item while a send is in flight stays queued and goes out next time.
- If browser storage refuses the write, the change is reported as failed and nothing is queued or sent.

## Pull

A pull first sends the outbox, then replaces the profile's local list with the cloud list and re-applies whatever is still in the outbox. Items added or removed on other devices therefore appear even while this device has unsent changes. Pushes and pulls for one profile run one at a time.

## Limits

- This device keeps at most 1000 items per profile. Saving beyond that drops the oldest item locally only; the cloud keeps it.
- No conflict handling beyond last write wins: if two devices change the same item, the change that reaches the cloud last wins.
- Tabs do not coordinate; each tab sends its own outbox.
- Guest (signed-out) Library edits stay on the device and are not uploaded later.
- Sign-out clears the Library, the outbox and other account data on this device. Unsent changes are lost.

The Library screen shows a short notice while changes are waiting to sync.
