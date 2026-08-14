# Exam plans and deck sharing

## Exam plans

A plan is arithmetic on the account's own cards and the time budget the user stated: how much is
unseen, how many days remain, and what that implies per day. It does not predict a grade, and it
does not claim that following it guarantees recall.

`buildStudyExamOutlook` reports:

- days remaining, new cards per day, and an estimated minutes-per-day figure
- whether that estimate exceeds the stated budget
- one action, chosen by situation: cover the weakest cards when the exam is days away, narrow the
  plan when it does not fit the budget, or rewrite leeches when there is time and nothing unseen

Every figure is presented as an estimate, because the inputs — how long a card takes, how much is
already known — are estimates. A date that has passed reports that, rather than producing a plan.

Limits: 20 active plans per account, 60 sets per plan.

## Sharing

Sharing separates content from personal state, which is what makes updates safe.

**Publishing** (`action: "publish"`) writes an immutable content snapshot: note type, fields, and
tags. Republishing adds a version; it never edits an existing one. Scheduling, review history,
lapses, and preferences are not part of a publication and are never sent.

Image-occlusion notes are excluded from publications: they depend on private media, which sharing
does not copy.

**Subscribing** (`action: "subscribe"`) copies the current version into a set the subscriber
already owns. Each copied note is theirs: their own ID, their own cards, their own fresh schedule.

**Updating** re-runs subscribe. The subscription keeps a map from published note keys to the
subscriber's own note IDs, so an update adds only what is new. Cards the subscriber has been
reviewing are untouched — no reset, no rebase, no schedule change.

**Revoking** stops new subscribers. Copies that subscribers already hold remain theirs; revoking a
link does not reach into another account's data.

Shared content is untrusted input. Every note is revalidated against the same strict per-type
schemas as anything a user types, so a malformed or unsupported note is dropped rather than stored.

Share codes are generated from a cryptographic source. The code is the whole access control for a
link-shared set, so a guessable code would be the vulnerability.

## What is not built

- Suggestions and change proposals from subscribers back to the publisher. The version and
  changelog structure is in place for it; the review workflow is not.
- Public discovery. Sharing is link-only, which avoids needing a moderation design first.
- Incremental reading and long-form source ingestion, which the plan places after a privacy and
  moderation design.
