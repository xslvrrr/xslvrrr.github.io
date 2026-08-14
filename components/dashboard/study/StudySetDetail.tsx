"use client"

import { IconCards, IconCheck, IconEdit, IconPlus, IconTrash } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { countDueFlashcards, type Flashcard, type FlashcardSet } from "@/lib/study"
import CardStack from "@/src/components/kokonutui/card-stack"

interface StudySetDetailProps {
  set: FlashcardSet
  isEditing: boolean
  onStartEditing: () => void
  onStopEditing: () => void
  onAddCard: () => void
  onEditCard: (card: Flashcard) => void
  onDeleteCard: (card: Flashcard) => void
  onStartReview: () => void
}

export function StudySetDetail({
  set,
  isEditing,
  onStartEditing,
  onStopEditing,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onStartReview,
}: StudySetDetailProps) {
  const dueCount = countDueFlashcards([set])

  return (
    <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{set.title}</CardTitle>
            <CardDescription>{set.description || "No description"}</CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={onAddCard}><IconPlus /> Add card</Button>
            {isEditing ? (
              <Button onClick={onStopEditing}><IconCheck /> Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={onStartEditing} disabled={set.cards.length === 0}>
                  <IconEdit /> Edit cards
                </Button>
                <Button onClick={onStartReview} disabled={dueCount === 0}>
                  Review due{dueCount > 0 ? ` · ${dueCount}` : ""}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isEditing && set.cards.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-[var(--border-default)]">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] bg-[var(--hover-bg)]/40 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Card editor</p>
                <p className="text-xs text-[var(--text-tertiary)]">{set.cards.length} cards in this set</p>
              </div>
              <Button size="sm" variant="outline" onClick={onAddCard}><IconPlus /> Add card</Button>
            </div>
            <div className="max-h-[32rem] divide-y divide-[var(--border-default)] overflow-y-auto">
              {set.cards.map((card, index) => (
                <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" key={card.id}>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Question {index + 1}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--text-primary)]">{card.front}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Answer</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)]">{card.back}</p>
                  </div>
                  <div className="flex items-start gap-1">
                    <Button
                      aria-label={`Edit card ${index + 1}`}
                      size="icon-sm"
                      title="Edit card"
                      variant="ghost"
                      onClick={() => onEditCard(card)}
                    >
                      <IconEdit />
                    </Button>
                    <Button
                      aria-label={`Delete card ${index + 1}`}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      size="icon-sm"
                      title="Delete card"
                      variant="ghost"
                      onClick={() => onDeleteCard(card)}
                    >
                      <IconTrash />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : set.cards.length > 0 ? (
          <>
            <CardStack
              aria-label={`${set.title} card preview`}
              items={set.cards.slice(0, 5).map((card) => ({
                id: card.id,
                content: (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-color)]">Question</div>
                    <div className="mt-3 line-clamp-4 text-lg font-semibold leading-relaxed text-[var(--text-primary)]">{card.front}</div>
                  </div>
                ),
              }))}
            />
            <p className="text-center text-xs text-[var(--text-tertiary)]">Select stack to fan out preview.</p>
          </>
        ) : (
          <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-[var(--border-default)] p-10 text-center">
            <IconCards className="text-[var(--accent-color)]" />
            <p className="text-sm text-[var(--text-secondary)]">Add focused question and answer to begin.</p>
            <Button variant="outline" onClick={onAddCard}><IconPlus /> Add card</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
