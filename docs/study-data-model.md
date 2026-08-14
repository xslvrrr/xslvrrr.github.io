# Study data model

Study data is normalized so content, learner scheduling, review history, sync state, and future shared-deck versions can evolve independently.

## Main entities

- `study_decks`: organization, hierarchy, pinning, archival, revisions
- `study_notes`: author-authored structured fields and tags
- `study_cards`: generated review variants plus current scheduling projection
- `study_review_events`: append-only review, undo, migration, and reschedule history
- `study_preferences`: learner-facing defaults and experience mode
- `study_scheduler_profiles`: versioned scheduler parameters
- `study_sessions`: resumable session configuration and progress
- `study_session_cards`: deterministic session order and state
- `study_sync_changes`: cursor-based entity revision stream
- `study_migration_state`: legacy JSONB backfill and cutover status

Later milestones add sources, citations, media, drafts, Smart Sessions, and import jobs.

## Invariants

- Every query is scoped by server-derived `user_id`.
- Browser roles cannot access Study tables directly; server service role owns access.
- Content revision and schedule revision remain separate.
- Review event insertion and card projection update happen atomically.
- `client_operation_id` is unique per user for idempotency.
- Deleted records use tombstones until sync retention expires.
- Note template keys remain stable so content edits preserve scheduling where possible.
- Imports commit atomically or not at all.
- Migration never fabricates review history or deletes legacy JSONB.

## Note and card separation

One note can generate multiple cards. Example: basic-and-reversed note produces forward and reverse card variants. Shared deck content can later update independently from each learner's due dates, history, flags, and personal fields.

## Structured content

Card content uses versioned, allowlisted fields and blocks. Arbitrary JavaScript and unsafe templates are unsupported. Rich note types add explicit parsers and renderers rather than executable user content.

## Transactional operations

All Study writes go through `security definer` RPCs owned by the service role. Each one locks the
owning rows, checks the caller's expected revision, updates the entity, and appends a
`study_sync_changes` row under a single new cursor.

| RPC | Purpose |
| --- | --- |
| `apply_study_review_v1` | Idempotent review transition and review event |
| `upsert_study_deck_v1` | Create or edit a deck; client-supplied deck ID makes retries idempotent |
| `delete_study_deck_v1` | Soft-delete a deck with its notes and cards |
| `upsert_study_note_v1` | Create or edit a note and reconcile its cards by template key |
| `delete_study_note_v1` | Soft-delete a note with its cards |
| `get_study_deck_contents_v1` | Keyset-paginated notes and card projections for one deck |
| `get_study_review_queue_v1` | Due-first queue with the note content each card renders |
| `undo_study_review_v1` | Compensating event restoring a review's exact before state |
| `get_study_undoable_review_v1` | Newest review that can still be undone |
| `save_study_preferences_v1` | Learner preferences with optimistic revision check |

Card reconciliation on note edit: cards whose `template_key` still exists keep their scheduling and
history, new template keys get a server-computed initial state, and removed template keys are
soft-deleted. Basic notes generate one `forward` card.

Undo never deletes history. It inserts an `undo` event pointing at the target event and restores
that event's stored `before_state`. Only a card's newest review is undoable: the target event's
recorded schedule revision must still match the card's current one, otherwise the request fails with
`superseded`.

## Migration stages

1. Add normalized schema.
2. Backfill legacy JSONB idempotently.
3. Verify digest and entity counts.
4. Dual-write representable basic content.
5. Switch source of truth by server-owned capability flag.
6. Retain legacy column non-destructively.
7. Stop legacy shadow before rich note types make it lossy.

## Privacy

Review history is user-owned product data. Operational telemetry may include counts, latency, conflict codes, and version identifiers, but never deck titles, tags, card text, source text, prompts, or citations.
