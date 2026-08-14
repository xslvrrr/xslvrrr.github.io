# Study import and export

Study data belongs to the account that created it. This document records the CSV/TSV import
pipeline, the export formats, and what a rollback does and does not undo.

## CSV and TSV import

Parsing uses PapaParse. Delimiter detection, quoting, and embedded newlines are the parser's job;
Millennium owns the column mapping, validation, duplicate policy, and commit transaction.

The flow is preview-then-commit, and the two always agree:

1. **Preview** (`POST /api/study/import` with `action: "preview"`) parses the whole file, validates
   every row, applies the duplicate policy, and stores the resulting plan in `study_import_jobs`.
   Nothing is written to Study content. The response reports rows read, cards that will be added,
   duplicates skipped, and every row problem.
2. **Commit** (`action: "commit"`) applies the stored plan in one transaction. Because the plan —
   including the note and card IDs — was fixed at preview time, the commit count equals the
   preview count. A failure applies nothing.
3. **Rollback** (`action: "rollback"`) soft-deletes the notes the job created.

Limits: 2 MB per file, 500 cards per import, 500 cards per set, 60 sets per account. Preview plans
expire after 60 minutes and are pruned by `prune_study_import_jobs_v1`.

### Row problems

Rows are reported by their spreadsheet line number, including the header row, so a user can find
them in the original file. Problem rows download as a CSV with `row`, `code`, and `message`.

Codes: `missing-prompt`, `missing-answer`, `too-long`, `duplicate`, `unreadable`.

### Duplicate detection

Duplicates are matched on the normalized question and answer text: collapsed whitespace,
lowercased. The comparison runs against the target set's existing cards and against earlier rows in
the same file. Users can choose to import duplicates anyway.

### Scheduling

Imported cards start unscheduled and due immediately. CSV carries no trustworthy review history, so
none is invented. The import records `source_kind = 'import'` on each note.

## Rollback limits

Rollback removes only notes the job created, and only those with no review history. A card that has
already been reviewed keeps its note, and the response reports how many were kept. Review history
is never deleted — that is the same rule the scheduler follows.

## Study export

`GET /api/study/export` downloads the account's own decks, notes, cards, preferences, and review
history as JSON. `?history=0` omits the history.

```
{
  "schemaVersion": 2,
  "exportedAt": "...",
  "library": { "status": "ok", "cursor": 0, "decks": [], "notes": [], "cards": [], "preferences": {} },
  "reviewEvents": [],
  "reviewEventsTruncated": false
}
```

`reviewEventsTruncated` is true when the account has more history than one request returns. It is
reported rather than silently dropped.

## Account backup

`GET /api/user/export` now produces schema v2, which embeds the same Study payload under `study`.
Schema v1 backups predate Study and remain restorable.

Restore (`POST /api/user/export`) runs `restore_study_backup_v1`:

- Same-account only. The existing account check on the backup envelope still applies.
- Revision-guarded. A deck, note, or card is only overwritten when the backup's revision is higher
  than what the account currently holds, so restoring an old backup cannot undo newer work.
- A card reviewed since the backup keeps its newer schedule.
- Review events are inserted on conflict-do-nothing. Restoring never rewrites or deletes history.
- Undo events are not restored: an undo without its target event has no meaning.

## What is not built yet

- APKG import. It needs an isolated parser proof, a license review, and a compatibility report
  before it can be a production path.
- A portable deck package with media. CSV and the account backup cover P0 data ownership.
