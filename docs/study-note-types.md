# Study note types and the card browser

Notes hold what the user wrote. Cards are the review variants generated from a note, each with its
own schedule. This document records the authorable types, how cards are regenerated on edit, and
what the browser can do in bulk.

## Note types

| Type | Cards it makes | Template keys |
| --- | --- | --- |
| `basic` | One | `forward` |
| `basic-reversed` | Two | `forward`, `reverse` |
| `typed` | One, answered by typing | `typed` |
| `cloze` | One per deletion number | `cloze-1` … `cloze-N` |
| `sequence` | One, recalled in order | `sequence` |
| `compare-contrast` | One, contrasting two concepts | `compare` |
| `application` | One, scenario plus question | `application` |

`image-occlusion` exists in the schema but is not authorable yet; it ships with media in a later
phase.

Fields are validated per type with a Zod schema in `lib/study/note-types.ts`. Schemas are strict:
unknown fields are rejected rather than stored, so there is no path for arbitrary markup or a
template a user could execute.

## Card regeneration

Card identity is the template key, not a position. On every save:

- A template key that still exists keeps its card, and therefore its whole schedule.
- A new template key creates a new card in the `new` state.
- A template key that disappeared retires its card by soft-delete.

That is why cloze cards are keyed `cloze-<ordinal>` rather than by index: editing the sentence
around a deletion, or adding a new deletion, leaves the existing cards scheduled. The editor shows
how many cards a note will make and warns before an edit removes one.

## Cloze syntax

`{{c1::hidden text}}` or `{{c1::hidden text::hint}}`.

Parsing is a small state machine (`lib/study/cloze.ts`), not a regular expression. Cloze text
regularly contains braces and colons that pattern matching gets wrong, and the failure mode is a
card that renders incorrectly rather than an obvious error. Ordinals run from 1 to 32; repeated
ordinals form one card that hides every occurrence.

## Typed answers

Typing is optional and is feedback only. The card reports whether the typed text matched, and the
learner still chooses their own rating: a typo and a genuine retrieval failure are not the same
thing. Notes can carry aliases, a case-sensitivity flag, and a numeric tolerance.

## Quality lint

`lintStudyNote` warns and never blocks. Real cards break these rules for good reasons, and a hard
gate would only teach people to write around the checker.

Codes: `answer-leakage`, `long-answer`, `multiple-facts`, `context-free-cue`, `cloze-structure`,
`trivial-overlap`.

## Card browser

`GET /api/study/browser` searches across sets. Every filter is a typed query parameter compiled
into a parameterized query — there is no place for a SQL fragment to enter, by construction.

Filters: full-text over question and answer, sets, tags, note types, card states (including
suspended and buried), due-date range, minimum lapses. Sorting: due, created, lapses, difficulty,
stability. Results are paginated at 50 per page.

`POST /api/study/browser` applies one action to a bounded selection (max 500 cards): suspend,
unsuspend, bury, unbury, reschedule, move to another set, add tag, remove tag, delete.

Rescheduling writes a `manual-reschedule` review event holding the before and after state. A manual
change is part of review history, not a silent overwrite, which is what makes it repairable later.

## Rollout

`STUDY_RICH_NOTES_ENABLED` gates `capabilities.richNotes` and defaults to on. Set to `"false"` the editor offers only
question-and-answer cards. This is a rollback boundary: once an account authors a rich note, the
legacy JSONB shadow can no longer represent its content, and rolling back to legacy storage would
be lossy. Enable it only after normalized cutover is settled.
