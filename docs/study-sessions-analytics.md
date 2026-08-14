# Smart Sessions, interleaving, and analytics

## Query language

Expert search is parsed into an AST (`lib/study/query.ts`), then compiled into a fixed set of typed
filter values. The compiled filter is passed to `search_study_cards_v2` as parameters. No part of a
user's query ever becomes SQL text, so there is nothing to escape.

Fields: `deck`, `tag`, `type`, `is`, `lapses`, `stability`, `difficulty`, `reps`, `added`, `rated`,
`due`. Comparisons use `>` and `<`. Terms separated by spaces are ANDed; `OR` joins alternatives;
`-` or `NOT` excludes.

```
is:due tag:unit-1 -is:suspended
deck:Biology OR deck:Chemistry
lapses>3 -is:new
```

Supported boolean structure is a conjunction of per-field alternatives, plus negation on set
membership. `deck:a OR tag:b` is refused with a message naming the limitation rather than being
silently approximated — an approximated query would quietly review the wrong cards.

Saved sessions store both the original text and the validated AST. The stored AST is revalidated
before every use: a saved row is untrusted input like anything else.

## Interleaving

Interleaving helps conditionally — mainly when a learner must distinguish similar categories, and
once they are familiar enough with each for the comparison to mean anything. Randomly mixing
unrelated material is not supported as a universal improvement, so `buildStudySessionQueue` treats
mixing as a decision with stated conditions:

1. Materially overdue cards come first. A card overdue by more than twice its interval, or by more
   than a week, is a scheduling problem before it is an ordering problem.
2. A category the learner has barely seen gets a short blocked run, so first exposure is not
   scattered across the session.
3. Mixing happens only when at least two categories each have three or more already-seen cards.
4. No category runs for more than three consecutive cards while mixing.
5. Ordering is deterministic for a given seed, so pausing, resuming, or replaying offline gives the
   same sequence.
6. The session states its own reason in plain language: "two familiar topics are mixed so you
   practise telling them apart."

These thresholds are product heuristics. They are not derived from a specific study, and should be
evaluated against real usage rather than treated as settled numbers.

## Session presets

Presets are the beginner surface for the same query language experts type: what is due, a short
session, oldest waiting first, cards you keep forgetting, review only, and a mixed session for
telling similar things apart. None of them demand clearing a backlog in one sitting.

## Analytics

`GET /api/study/analytics` derives everything from review events and current card projections:
daily review counts and minutes, rating distribution, due forecast, lapse counts, leech count,
backlog size and age, and per-deck totals.

Every headline metric carries a plain-language meaning and, where there is one, an action.

- **Recall estimate** counts only reviews of cards that were already in the review state, so first
  exposures do not inflate it. Below 20 such reviews it reports that there is not enough data
  rather than showing a confident-looking figure.
- **Workload** is what the current schedule will ask for, stated as an assumption ("if you add no
  new cards"), not a prediction about a different schedule.
- **Leeches** are cards that lapsed at least eight times. The suggested action is to rewrite or
  suspend them, because repeating them unchanged rarely helps.

The heatmap is decorative only: every cell's count is also available in an exact-values table, and
the table is the accessible path. Colour is never the sole carrier of meaning.

## Privacy

Analytics responses contain counts, timings, and scheduling state. Deck titles appear only in the
per-deck breakdown the user is already looking at. No card text, tag text, or query text is logged.
