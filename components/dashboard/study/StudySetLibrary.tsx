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
import { countDueFlashcards, type FlashcardSet } from "@/lib/study"

interface StudySetLibraryProps {
  sets: FlashcardSet[]
  selectedSetId: string | null
  isSaving: boolean
  onSelect: (setId: string) => void
  onTogglePin: (set: FlashcardSet) => void
  onRename: (set: FlashcardSet) => void
  onDelete: (set: FlashcardSet) => void
}

export function StudySetLibrary({
  sets,
  selectedSetId,
  isSaving,
  onSelect,
  onTogglePin,
  onRename,
  onDelete,
}: StudySetLibraryProps) {
  return (
    <Card className="h-fit border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
      <CardHeader>
        <CardTitle>Flashcard sets</CardTitle>
        <CardDescription>{sets.length} total</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1">
        {sets.map((set) => {
          const dueCount = countDueFlashcards([set])
          return (
            <ContextMenu key={set.id}>
              <ContextMenuTrigger
                render={(
                  <div
                    className="w-full"
                    onContextMenu={() => onSelect(set.id)}
                  />
                )}
              >
                <Button
                  className="h-auto w-full justify-between px-3 py-2.5 text-left"
                  onClick={() => onSelect(set.id)}
                  variant={selectedSetId === set.id ? "secondary" : "ghost"}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{set.title}</span>
                    <span className="block text-xs font-normal text-[var(--text-tertiary)]">{set.cards.length} cards</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {set.pinned ? <IconPinFilled aria-label="Pinned" className="text-[var(--accent-color)]" size={15} /> : null}
                    {dueCount > 0 ? <Badge>{dueCount}</Badge> : <IconChevronRight className="text-[var(--text-tertiary)]" size={16} />}
                  </span>
                </Button>
              </ContextMenuTrigger>
              <ContextMenuContent className="min-w-44">
                <ContextMenuItem disabled={isSaving} onClick={() => onTogglePin(set)}>
                  {set.pinned ? <IconPin /> : <IconPinFilled />}
                  {set.pinned ? "Unpin set" : "Pin set"}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => onRename(set)}>
                  <IconEdit /> Rename set
                </ContextMenuItem>
                <ContextMenuItem variant="destructive" onClick={() => onDelete(set)}>
                  <IconTrash /> Delete set
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
      </CardContent>
    </Card>
  )
}
