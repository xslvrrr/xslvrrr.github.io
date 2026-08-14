# Study scheduler

Millennium Study uses a versioned scheduler adapter. Application APIs and database records use Millennium-owned types; `ts-fsrs` types never cross persistence or API boundaries.

## Evidence and claims

Retrieval practice and distributed review have strong evidence for durable learning. Exact intervals remain estimates based on review history, target retention, and model parameters. Millennium must not describe FSRS as universally optimal or guarantee retention.

Interleaving remains conditional. Study sessions mix related, confusable material when comparison is useful; they do not randomly combine unrelated cards under a neuroscience claim.

## Default profile

- Algorithm: FSRS 6 through `ts-fsrs`
- Desired retention: 0.90
- Maximum interval: 36,500 days
- Learning steps: 1 minute, 10 minutes
- Relearning step: 10 minutes
- Fuzzing: disabled until deterministic seeded fuzzing is implemented

Beginner controls map:

- Forgot: Again
- Remembered: Good

Intermediate and expert controls expose Again, Hard, Good, and Easy. Typed-answer matching informs feedback but does not choose a rating silently.

## Versioning

Every current card projection and review event records:

- Scheduler name and algorithm version
- Parameter-set version
- Before and after scheduling state
- Client review time and server receipt time

Parameter changes do not rewrite history. Bulk rescheduling requires explicit workload preview and approval.

## Review transaction

Server performs authoritative review transition:

1. Authenticate account owner.
2. Check client operation ID for idempotency.
3. Lock card and verify schedule revision.
4. Recompute transition server-side.
5. Append review event.
6. Update card projection.
7. Emit sync change.
8. Return authoritative card state.

Clients may show interval previews but cannot submit precomputed scheduling state.

The review queue returns each card's current scheduling state, so the browser previews intervals
with the default profile through the same adapter. Those labels are estimates and are presented as
such; the server recomputes the transition it commits, and beginner mode hides them entirely.

## Undo

Undo is compensating event, not history deletion. It is accepted only when target remains latest effective review and schedule revision matches. Card projection restores exact stored before-state.

`undo_study_review_v1` implements this:

1. Reuse of a client operation ID returns the stored result instead of undoing twice.
2. The target must be a `review` event with no existing undo pointing at it.
3. The target's recorded schedule revision must equal the card's current one, otherwise the response
   is `superseded` and the newer review stands.
4. The card projection is restored field by field from the target's `before_state`, and its schedule
   revision increases — restoring state never rewinds the revision counter.
5. An `undo` event is appended with `before_state` set to the undone after-state, and any session
   card returns to `pending`.

`get_study_undoable_review_v1` reports the newest review that still satisfies these checks, so the
review UI only offers Undo when it will actually succeed.

## Legacy cards

Legacy JSONB cards retain current due dates and aggregate scheduling provenance. Migration does not invent historical reviews. First FSRS review records explicit legacy transition metadata.

## Future optimization

Personalized parameter fitting requires sufficient review history, versioned output, safe defaults, and workload preview. Optimization must run outside request path and preserve prior parameter versions.
