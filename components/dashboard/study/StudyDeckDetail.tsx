"use client"

import { IconCards, IconEdit, IconLoader2, IconPlus, IconTrash } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { StudyDeckSummary, StudyNoteWithCards } from "@/lib/study/domain"
import { renderStudyCard } from "@/lib/study/note-types"

interface StudyDeckDetailProps {
  deck: StudyDeckSummary
  notes: StudyNoteWithCards[]
  isNotesLoading: boolean
  hasMoreNotes: boolean
  onAddNote: () => void
  onEditNote: (note: StudyNoteWithCards) => void
  onDeleteNote: (note: StudyNoteWithCards) => void
  onLoadMore: () => void
  onStartReview: () => void
}

function cardStateLabel(note: StudyNoteWithCards): string {
  const card = note.cards[0]
  if (!card) return "No card"
  if (card.isSuspended) return "Suspended"
  if (card.state === "new") return "New"
  return new Date(card.dueAt).getTime() <= Date.now() ? "Due now" : "Scheduled"
}

export function StudyDeckDetail({
  deck,
  notes,
  isNotesLoading,
  hasMoreNotes,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onLoadMore,
  onStartReview,
}: StudyDeckDetailProps) {
  return (
    <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{deck.title}</CardTitle>
            <CardDescription>{deck.description || "No description"}</CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={onAddNote}><IconPlus /> Add card</Button>
            <Button onClick={onStartReview} disabled={deck.dueCount === 0}>
              Review due{deck.dueCount > 0 ? ` · ${deck.dueCount}` : ""}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{deck.cardCount} cards</Badge>
          <Badge variant="outline">{deck.newCount} new</Badge>
          <Badge variant="outline">{deck.dueCount} due</Badge>
        </div>

        {notes.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-[var(--border-default)]">
            <ul className="max-h-[32rem] divide-y divide-[var(--border-default)] overflow-y-auto">
              {notes.map((note, index) => (
                <li className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" key={note.id}>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                      Question {index + 1} · {cardStateLabel(note)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--text-primary)]">
                      {renderStudyCard(note.noteType, note.fields, note.cards[0]?.templateKey ?? "forward").prompt}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Answer</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)]">
                      {renderStudyCard(note.noteType, note.fields, note.cards[0]?.templateKey ?? "forward").answer}
                    </p>
                  </div>
                  <div className="flex items-start gap-1">
                    <Button
                      aria-label={`Edit card ${index + 1}`}
                      size="icon-sm"
                      title="Edit card"
                      variant="ghost"
                      onClick={() => onEditNote(note)}
                    >
                      <IconEdit />
                    </Button>
                    <Button
                      aria-label={`Delete card ${index + 1}`}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      size="icon-sm"
                      title="Delete card"
                      variant="ghost"
                      onClick={() => onDeleteNote(note)}
                    >
                      <IconTrash />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {hasMoreNotes ? (
              <div className="border-t border-[var(--border-default)] p-3 text-center">
                <Button variant="outline" size="sm" disabled={isNotesLoading} onClick={onLoadMore}>
                  {isNotesLoading ? <IconLoader2 className="animate-spin" /> : null} Load more cards
                </Button>
              </div>
            ) : null}
          </div>
        ) : isNotesLoading ? (
          <p className="p-6 text-center text-sm text-[var(--text-tertiary)]" role="status">Loading cards…</p>
        ) : (
          <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-[var(--border-default)] p-10 text-center">
            <IconCards className="text-[var(--accent-color)]" />
            <p className="text-sm text-[var(--text-secondary)]">Add focused question and answer to begin.</p>
            <Button variant="outline" onClick={onAddNote}><IconPlus /> Add card</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
