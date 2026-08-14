# Study offline review and sync

Desktop clients can review Study cards without a connection. This document records the storage
layout, the sync order, the conflict rules, and the limits that are deliberate rather than missing.

## Server surface

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/study/sync` | GET | Cursor pull. `?cursor=N&limit=M` returns changes with entity payloads |
| `/api/study/sync` | GET | `?reset=1` returns a bounded full snapshot |
| `/api/study/sync` | POST | Pushes a bounded outbox batch and reports one outcome per operation |

Backing functions:

- `pull_study_sync_v1(user, after_cursor, limit)` — returns whole cursor groups only, so one
  transaction's changes are never split across pages. Rows deleted after a change was recorded
  resolve to tombstones instead of null payloads.
- `get_study_snapshot_v1(user, limit)` — returns `too-large` rather than a partial library. An
  oversized account stays online-only instead of appearing complete while hiding cards.
- `prune_study_sync_changes_v1(retention_days, batch_limit)` — deletes expired change rows and
  advances `study_sync_state.minimum_cursor` so stale clients get a snapshot instead of an
  incomplete incremental history.

`GET /api/study/bootstrap` reports `capabilities.offlineSync`. It is true only when
`STUDY_OFFLINE_SYNC_ENABLED` is not set to `"false"` (its default is on) and the account already
reads normalized storage.

## Local storage

`src-tauri/migrations/005_study_offline.sql` adds three tables to the existing encrypted SQLite
database. Entity payloads and queued commands are AES-GCM ciphertext under the same OS
credential-store master key as the secure cache; only routing metadata stays in cleartext columns.

| Table | Holds |
| --- | --- |
| `study_entities` | Current deck, note, card, and preference projections |
| `study_outbox` | Queued review commands, their status, and attempt counts |
| `study_sync_meta` | Sync cursor, installation device ID, last pull and push times |

The device ID is a random UUID generated on first use. It is never derived from hardware or
account details.

Tauri commands are in `src-tauri/src/study_sync/`. Every command verifies that the call came from
the desktop window and that the named owner is the account currently signed in on this device.

## Review while offline

`study_local_record_review` writes the optimistic card projection and the durable outbox command in
one SQLite transaction. A crash cannot leave one without the other, which is what makes an accepted
local review survive a restart.

The client computes the local interval with default FSRS parameters. That projection is a display
value: on push, the server recomputes the transition from the account's own scheduler profile and
returns the authoritative card, which replaces the local projection.

The outbox is capped at 10,000 operations. Beyond that, further offline reviews are refused with a
message rather than silently dropped.

## Sync order

1. Push a bounded batch (50 operations) from the outbox.
2. Remove only server-confirmed operations. Conflicts and rejections are preserved; transient
   failures stay pending with an incremented attempt count.
3. Pull changes from the stored cursor.
4. Apply entities and tombstones transactionally, advancing the cursor with the same write.
5. A cursor older than retained history triggers a full snapshot instead of a partial replay.

Push runs before pull so a confirmed local review leaves the outbox before newer server state
arrives, and cannot be overwritten by a projection that predates it.

## Conflict policy

- A duplicate operation ID returns `duplicate`. The review is never scheduled twice.
- A stale `expectedScheduleRevision` returns `conflict`. The server history is kept and the local
  operation is preserved for the user, never silently rebased onto the newer state.
- The user resolves a conflict by discarding the queued review. Discarding removes only the queued
  operation; committed review history is never deleted.
- A typed Study error means the server answered, so the client does not requeue the operation
  offline. Only a transport failure falls back to the local outbox.

## Known limits

- Undo requires the server review event, so it is unavailable for a review that has not synced yet.
  The review session states this rather than showing a control that cannot work.
- Content edits (decks, notes, preferences) are online-only. Offline covers review, which is the
  workflow that cannot wait.
- A library above the snapshot entity limit is not stored locally.

## Rollback

Setting `STUDY_OFFLINE_SYNC_ENABLED="false"` stops advertising the capability to new sessions. It does
not delete the local store, and it must not: the outbox may still hold accepted reviews. Clearing
local Study data is an explicit user or sign-out action through `study_local_clear`.
