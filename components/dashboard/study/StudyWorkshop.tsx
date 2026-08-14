"use client"

import * as React from "react"
import { IconAlertTriangle, IconCheck, IconLoader2, IconX } from "@tabler/icons-react"

import { StudyTabLoading } from "@/components/dashboard/study/StudyTabLoading"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { approveStudyDrafts, fetchStudyDrafts, rejectStudyDrafts } from "@/lib/study/client"
import type { StudyDeckSummary } from "@/lib/study/domain"
import { renderStudyCard } from "@/lib/study/note-types"
import type { StudyDraft } from "@/lib/study/workshop"

interface StudyWorkshopProps {
  decks: StudyDeckSummary[]
  selectedDeckId: string | null
  onApproved: () => void
}

interface DraftEdit {
  prompt: string
  answer: string
}

function draftEditFrom(draft: StudyDraft): DraftEdit {
  const rendered = renderStudyCard(draft.noteType as never, draft.fields, "forward")
  return { prompt: rendered.prompt, answer: rendered.answer }
}

export function StudyWorkshop({ decks, selectedDeckId, onApproved }: StudyWorkshopProps) {
  const [drafts, setDrafts] = React.useState<StudyDraft[]>([])
  const [edits, setEdits] = React.useState<Record<string, DraftEdit>>({})
  const [selected, setSelected] = React.useState<string[]>([])
  const [deckId, setDeckId] = React.useState(selectedDeckId ?? decks[0]?.id ?? "")
  const [isLoading, setLoading] = React.useState(true)
  const [isBusy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const pending = await fetchStudyDrafts()
      setDrafts(pending)
      setEdits(Object.fromEntries(pending.map((draft) => [draft.id, draftEditFrom(draft)])))
      setSelected(pending.map((draft) => draft.id))
      setError(null)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to load drafts.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  const approve = async () => {
    if (!deckId || selected.length === 0) return
    setBusy(true)
    try {
      await approveStudyDrafts({
        deckId,
        drafts: selected.map((draftId) => {
          const draft = drafts.find((entry) => entry.id === draftId)
          const edit = edits[draftId]
          return {
            draftId,
            // Only question-and-answer drafts are editable inline; richer types keep their fields.
            noteType: draft?.noteType === "basic" ? "basic" : (draft?.noteType ?? "basic"),
            fields: draft?.noteType === "basic"
              ? { prompt: edit?.prompt ?? "", answer: edit?.answer ?? "" }
              : (draft?.fields ?? {}),
            tags: draft?.tags ?? [],
          }
        }),
      })
      onApproved()
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Those cards could not be added.")
    } finally {
      setBusy(false)
    }
  }

  const reject = async (draftIds: string[]) => {
    if (draftIds.length === 0) return
    setBusy(true)
    try {
      await rejectStudyDrafts(draftIds)
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Those drafts could not be discarded.")
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) return <StudyTabLoading label="Loading suggested cards" />

  if (drafts.length === 0) {
    return (
      <Card className="border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
        <CardHeader>
          <CardTitle>No drafts waiting</CardTitle>
          <CardDescription>
            Suggested cards appear here before anything is added. You can always write cards
            yourself instead — nothing here is required.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      {error ? <p className="text-sm" role="alert">{error}</p> : null}

      <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
        <CardHeader>
          <CardTitle>{drafts.length} suggested card{drafts.length === 1 ? "" : "s"}</CardTitle>
          <CardDescription>
            Each one shows the source text it came from. Nothing is added to your sets until you
            approve it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="study-workshop-deck">Add approved cards to</Label>
            <Select value={deckId} onValueChange={(value: string | null) => setDeckId(value ?? "")}>
              <SelectTrigger id="study-workshop-deck" className="w-60"><SelectValue /></SelectTrigger>
              <SelectContent>
                {decks.map((deck) => (
                  <SelectItem key={deck.id} value={deck.id}>{deck.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button disabled={isBusy || !deckId || selected.length === 0} onClick={() => void approve()}>
            {isBusy ? <IconLoader2 className="animate-spin" /> : <IconCheck />}
            Add {selected.length} card{selected.length === 1 ? "" : "s"}
          </Button>
          <Button
            variant="outline"
            disabled={isBusy || drafts.length === 0}
            onClick={() => void reject(drafts.map((draft) => draft.id))}
          >
            <IconX /> Discard all
          </Button>
        </CardContent>
      </Card>

      <ul className="grid gap-3">
        {drafts.map((draft) => {
          const edit = edits[draft.id]
          const isSelected = selected.includes(draft.id)
          return (
            <li key={draft.id}>
              <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      aria-label="Include this card"
                      checked={isSelected}
                      onCheckedChange={() => setSelected((current) => (current.includes(draft.id)
                        ? current.filter((id) => id !== draft.id)
                        : [...current, draft.id]))}
                    />
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">
                        {draft.source?.title || "Suggested card"}
                      </CardTitle>
                      <CardDescription>
                        {draft.model ? `Drafted by ${draft.model}. ` : ""}
                        You can edit it before adding it.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {draft.lint.length > 0 ? (
                    <ul aria-label="Warnings" className="grid gap-1">
                      {draft.lint.map((warning, index) => (
                        <li className="flex items-start gap-2 text-sm text-[var(--text-tertiary)]" key={index}>
                          <IconAlertTriangle aria-hidden className="mt-0.5 shrink-0" />
                          {warning.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {draft.noteType === "basic" && edit ? (
                    <>
                      <div className="grid gap-2">
                        <Label htmlFor={`draft-prompt-${draft.id}`}>Question</Label>
                        <Textarea
                          id={`draft-prompt-${draft.id}`}
                          value={edit.prompt}
                          onChange={(event) => setEdits((current) => ({
                            ...current,
                            [draft.id]: { ...current[draft.id], prompt: event.target.value },
                          }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`draft-answer-${draft.id}`}>Answer</Label>
                        <Textarea
                          id={`draft-answer-${draft.id}`}
                          value={edit.answer}
                          onChange={(event) => setEdits((current) => ({
                            ...current,
                            [draft.id]: { ...current[draft.id], answer: event.target.value },
                          }))}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm">
                      {renderStudyCard(draft.noteType as never, draft.fields, "forward").prompt}
                    </p>
                  )}

                  <div className="rounded-lg border border-[var(--border-default)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                      From the source
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                      {draft.citation || "No supporting text was provided."}
                    </p>
                    {draft.source?.reference ? (
                      <p className="mt-1 text-xs text-[var(--text-tertiary)]">{draft.source.reference}</p>
                    ) : null}
                  </div>

                  <div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => void reject([draft.id])}
                    >
                      <IconX /> Discard this card
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
