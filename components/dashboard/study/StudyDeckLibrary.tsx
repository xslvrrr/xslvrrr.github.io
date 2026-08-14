"use client"

import { IconChevronRight, IconEdit, IconPin, IconPinFilled, IconTrash } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { StudyDeckSummary } from "@/lib/study/domain"

interface StudyDeckLibraryProps {
  decks: StudyDeckSummary[]
  selectedDeckId: string | null
  isSaving: boolean
  onSelect: (deckId: string) => void
  onTogglePin: (deck: StudyDeckSummary) => void
  onRename: (deck: StudyDeckSummary) => void
  onDelete: (deck: StudyDeckSummary) => void
}

export function StudyDeckLibrary({
  decks,
  selectedDeckId,
  isSaving,
  onSelect,
  onTogglePin,
  onRename,
  onDelete,
}: StudyDeckLibraryProps) {
  return (
    <Card className="h-fit border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
      <CardHeader>
        <CardTitle>Flashcard sets</CardTitle>
        <CardDescription>{decks.length} total</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1">
        {decks.map((deck) => (
          <ContextMenu key={deck.id}>
            <ContextMenuTrigger
              render={(
                <div className="w-full" onContextMenu={() => onSelect(deck.id)} />
              )}
            >
              <Button
                className="h-auto w-full justify-between px-3 py-2.5 text-left"
                onClick={() => onSelect(deck.id)}
                variant={selectedDeckId === deck.id ? "secondary" : "ghost"}
              >
                <span className="min-w-0">
                  <span className="block truncate">{deck.title}</span>
                  <span className="block text-xs font-normal text-[var(--text-tertiary)]">
                    {deck.cardCount} cards
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {deck.pinned ? (
                    <IconPinFilled aria-label="Pinned" className="text-[var(--accent-color)]" size={15} />
                  ) : null}
                  {deck.dueCount > 0 ? (
                    <Badge>{deck.dueCount}</Badge>
                  ) : (
                    <IconChevronRight className="text-[var(--text-tertiary)]" size={16} />
                  )}
                </span>
              </Button>
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-44">
              <ContextMenuItem disabled={isSaving} onClick={() => onTogglePin(deck)}>
                {deck.pinned ? <IconPin /> : <IconPinFilled />}
                {deck.pinned ? "Unpin set" : "Pin set"}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onRename(deck)}>
                <IconEdit /> Rename set
              </ContextMenuItem>
              <ContextMenuItem variant="destructive" onClick={() => onDelete(deck)}>
                <IconTrash /> Delete set
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </CardContent>
    </Card>
  )
}
