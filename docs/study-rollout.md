# Study rollout

Study is migrating from one `public.users.flashcard_sets` JSONB document to normalized tables with
server-authoritative scheduling. This document records the current state, the server-owned switches,
and the rollback boundary.

## Current state

| Release | Status |
| --- | --- |
| 0A additive schema | Done — `202608020001_study_normalized_core.sql` |
| 0B idempotent backfill | Done — `202608020003_study_backfill_and_sync_rpc.sql` |
| 0C legacy compare-and-set writes | Done — `202608020004_study_legacy_cas.sql` |
| 0D normalized cutover | Done — cutover RPC plus normalized reads, writes, and review flow |
| 0E legacy retirement | Not started; the JSONB column stays untouched |

Phases 2 through 9 are implemented: the modular Study app and API, FSRS with review log and undo,
desktop offline review and sync, CSV import/export with account backup schema v2, the card browser
with rich note types, Smart Sessions with conditional interleaving and analytics, the
source-grounded draft workshop with private media and image occlusion, and exam plans with
versioned deck sharing.

See `docs/study-offline-sync.md`, `docs/study-import-export.md`, `docs/study-note-types.md`,
`docs/study-sessions-analytics.md`, `docs/study-workshop.md`, and `docs/study-planning-sharing.md`.

## Server-owned switches

Every switch below is **on by default**. The reworked Flashcards experience has shipped, so these
are kill switches rather than rollout gates: a capability is disabled only when its variable is set
to the literal string `"false"`. Any other value, including an unset variable, means enabled.

- `STUDY_NORMALIZED_CUTOVER_ENABLED` gates `POST /api/study/cutover`. Set to `"false"` and the
  endpoint returns 409 and every account keeps reading legacy storage.
- `study_migration_state.status` is the per-account source of truth. Only `cutover` accounts read
  and write normalized tables; every other status falls back to the legacy snapshot.
- `STUDY_OFFLINE_SYNC_ENABLED` gates `capabilities.offlineSync`. Off, desktop clients stay
  online-only.
- `STUDY_RICH_NOTES_ENABLED` gates `capabilities.richNotes`. Leaving it on ends the legacy rollback
  path once accounts author rich notes, because they cannot be represented in the JSONB shadow.
- `STUDY_AI_WORKSHOP_ENABLED` gates `capabilities.aiWorkshop`. Off, the assistant cannot propose
  Study drafts and the Drafts view is hidden.
- `capabilities` in `GET /api/study/bootstrap` tells the client which experience to render. The
  client never decides this for itself.

## Per-account promotion order

1. `POST /api/study/migrate` — backfills decks, notes, cards, and one synthetic migration event per
   card, then verifies digests and counts. Safe to rerun.
2. `POST /api/study/cutover` — promotes only when the legacy checksum still matches and expected
   counts equal actual counts.
3. The next bootstrap returns `capabilities.normalizedStorage: true` and `StudyShell` switches from
   the legacy page to the normalized experience.

Learners run both steps themselves; the promotion is never performed for them, because it rewrites
their own saved cards. With the switch at its default, bootstrap reports
`capabilities.cutoverAvailable: true` and the legacy page shows `StudyUpgradeNotice`, which calls
migrate and then cutover in order. Without that component an account has no route onto normalized
storage from the interface.

## API surface

| Route | Methods | Notes |
| --- | --- | --- |
| `/api/study/bootstrap` | GET | Deck summaries, preferences, capabilities, sync cursor |
| `/api/study/decks` | GET, POST, DELETE | Paginated deck contents; deck create/edit/delete |
| `/api/study/notes` | POST, DELETE | Note create/edit with card reconciliation; note delete |
| `/api/study/queue` | GET | Due-first review queue |
| `/api/study/reviews` | POST | Idempotent, server-authoritative review transition |
| `/api/study/undo` | GET, POST | Undoable-review lookup; compensating undo |
| `/api/study/preferences` | PUT | Experience mode, workload budget, retention target |
| `/api/study/sync` | GET, POST | Cursor pull, snapshot fallback, and bounded outbox push |
| `/api/study/import` | POST | CSV preview, atomic commit, and reversible rollback |
| `/api/study/export` | GET | Deck, card, and review-history download |
| `/api/study/browser` | GET, POST | Card search and bounded bulk actions |
| `/api/study/sessions` | GET, POST, DELETE | Smart Session list, run, save, and delete |
| `/api/study/analytics` | GET | Content-free review statistics and workload forecast |
| `/api/study/workshop` | GET, POST | Draft list, source-grounded drafting, approval, rejection |
| `/api/study/media` | GET, POST | Private image upload and short-lived signed URLs |
| `/api/study/planning` | GET, POST | Exam plans, deck publishing, and subscriptions |
| `/api/study/flashcards` | GET, POST, PUT, DELETE | Legacy compatibility adapter; unchanged |

Every mutating route runs the same guard: same-origin check, signed session, durable rate limit,
bounded JSON body, Zod validation, then a transactional RPC.

## Rollback

Rollback is safe while all content is representable as basic cards:

- The legacy JSONB column and its revision counter are never destroyed by these migrations.
- Reverting `study_migration_state.status` from `cutover` returns an account to legacy reads and
  writes without data deletion.
- Faulty scheduling is repaired with compensating events built from stored before-states, never by
  deleting review events.
- Once rich note types ship, rollback to legacy becomes lossy and must stop being an option.

## What to monitor

Content-free signals only: migration status counts, verification mismatches, duplicate operation
IDs, review conflict rate, undo rejection reasons, and scheduler/parameter versions in use. Never
log deck titles, tags, or card text.
