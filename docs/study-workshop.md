# Source-grounded drafting, media, and image occlusion

## The draft boundary

Model output never becomes a card. It becomes a **draft**: a stored suggestion the user reads
beside its supporting source, edits, and approves. Approval is the only code path that writes
notes, and it always originates from the user.

```
source text -> extraction (bounded, untrusted) -> model -> drafts -> lint + support check
  -> user reviews, edits, rejects, approves -> atomic commit with citations
```

- `POST /api/study/workshop` with `action: "draft"` stores drafts. It writes nothing to Study
  content.
- `action: "approve"` commits the user's edited version — not the model's original — in one
  transaction, together with the source citation for each note.
- `action: "reject"` discards drafts.

Drafts expire after 72 hours and are pruned by `prune_study_drafts_v1`. Extracted source text with
`retention: 'session'` is deleted once no committed note cites it.

## Source grounding

`verifyDraftSupport` checks that the citation the model attached actually appears in the source,
normalized for case and punctuation, with a strong word-overlap fallback so ordinary paraphrase in
a quote does not read as fabricated.

This is a **support** check, not a truth check. It can only show that the quoted material is
present. An unsupported draft is therefore flagged for the user — visibly, in the card's own
warning list — rather than silently dropped or silently trusted.

Every draft also runs the same deterministic quality lint the manual editor uses. AI drafts are
held to the standard human cards are, not a lower one.

## Assistant behaviour

For accounts on normalized storage, the assistant's Study tools no longer write cards. They create
drafts and say so: "Drafted 8 cards for your review. Nothing was added to your sets."

This also fixes a real correctness bug. Those tools wrote to `public.users.flashcard_sets`, which a
cutover account no longer reads — so the assistant reported success while the user saw nothing.

The manual authoring path is always available and never requires the assistant.

## Media

Images live in a private Supabase Storage bucket (`study-media`). There are no public reads and no
client-side policies; access is a short-lived signed URL issued by the server.

- The declared content type is ignored. Magic bytes decide, because a mislabelled upload is the
  ordinary way an image endpoint becomes a file-serving endpoint.
- PNG, JPEG, and WebP only. SVG is deliberately unsupported: it can carry script, and rasterizing
  it safely is a bigger commitment than image cards need.
- 5 MB per image, deduplicated per account by checksum.
- **Alt text is required**, enforced by a database constraint. A card whose only content is an
  image is unusable without it.

## Image occlusion

Regions are stored as percentages of the image, so they survive any display size. Every region
carries a written label.

That label is not decoration — it is the textual equivalent. The rendered card states the image's
alt text, lists the visible regions by name, and gives the hidden region's label as the answer, so
the card is answerable without seeing the image at all. This is why the accessible path was built
first: a visual mask editor without it produces cards that simply do not work for some users.

Modes: `hide-one` makes one card per region; `hide-all` makes a single card covering every region.
Card identity is `occlusion-<region id>`, so editing labels or adding regions preserves the
schedules of the cards that remain.

The drag-to-draw mask editor is not built. Regions are authored as labelled numeric bounds, which
is the keyboard-operable path; a pointer-driven editor can be added on top of it later, but not in
place of it.

## Rollout

`STUDY_AI_WORKSHOP_ENABLED` gates `capabilities.aiWorkshop` and defaults to on. Set to `"false"`, the assistant cannot
propose Study drafts at all and the Drafts view is hidden. Turning it off does not delete drafts
already awaiting review.

## Privacy

- Source text, citations, prompts, and card text never appear in logs or telemetry.
- Only the material the user selected as a source is sent to a provider. No unrelated dashboard,
  portal, or classroom data is included.
- Provider, model, generation time, source hash, and lint outcome are recorded with each draft, so
  a committed card can always be traced to what produced it.
