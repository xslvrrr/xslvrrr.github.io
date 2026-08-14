"use client"

import * as React from "react"
import {
  IconCards,
  IconLoader2,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"

import {
  DashboardPage,
  DashboardPageBody,
  DashboardPageHeader,
} from "@/components/dashboard/DashboardPage"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { StudyReviewSession } from "@/components/dashboard/study/StudyReviewSession"
import { StudySetDetail } from "@/components/dashboard/study/StudySetDetail"
import { StudySetLibrary } from "@/components/dashboard/study/StudySetLibrary"
import type { Flashcard, FlashcardReviewRating, FlashcardSet } from "@/lib/study"
import { countDueFlashcards } from "@/lib/study"

interface StudyPageProps {
  cacheKey: string
  onDueCountChange?: (count: number) => void
  /** Rendered above the set list. Used to offer the move onto normalized storage. */
  notice?: React.ReactNode
}

interface StudyPageCache {
  sets: FlashcardSet[]
}

type DeleteTarget =
  | { kind: "set"; setId: string; label: string }
  | { kind: "card"; setId: string; cardId: string; label: string }

const studyPageCache = new Map<string, StudyPageCache>()

function orderedSets(sets: FlashcardSet[]) {
  return [...sets].sort((left, right) => Number(right.pinned) - Number(left.pinned))
}

async function studyRequest(method: string, body?: Record<string, unknown>) {
  const response = await fetch("/api/study/flashcards", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || "Study request failed.")
  return data
}

export function StudyPage({ cacheKey, onDueCountChange, notice }: StudyPageProps) {
  const initialCache = studyPageCache.get(cacheKey)
  const [sets, setSets] = React.useState<FlashcardSet[]>(() => initialCache?.sets || [])
  const [selectedSetId, setSelectedSetId] = React.useState<string | null>(() => initialCache?.sets[0]?.id || null)
  const [reviewCards, setReviewCards] = React.useState<Flashcard[]>([])
  const [reviewIndex, setReviewIndex] = React.useState(0)
  const [flipped, setFlipped] = React.useState(false)
  const [loading, setLoading] = React.useState(!initialCache)
  const [saving, setSaving] = React.useState(false)
  const [setDialogOpen, setSetDialogOpen] = React.useState(false)
  const [cardDialogOpen, setCardDialogOpen] = React.useState(false)
  const [editingCards, setEditingCards] = React.useState(false)
  const [editingCardId, setEditingCardId] = React.useState<string | null>(null)
  const [renamingSetId, setRenamingSetId] = React.useState<string | null>(null)
  const [renameTitle, setRenameTitle] = React.useState("")
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null)
  const [setTitle, setSetTitle] = React.useState("")
  const [setDescription, setSetDescription] = React.useState("")
  const [cardFront, setCardFront] = React.useState("")
  const [cardBack, setCardBack] = React.useState("")

  const selectedSet = sets.find((set) => set.id === selectedSetId) || null
  const dueCount = countDueFlashcards(sets)
  const activeCard = reviewCards[reviewIndex] || null

  const applySets = React.useCallback((nextSets: FlashcardSet[]) => {
    const ordered = orderedSets(nextSets)
    setSets(ordered)
    onDueCountChange?.(countDueFlashcards(ordered))
    setSelectedSetId((current) => current && ordered.some((set) => set.id === current)
      ? current
      : ordered[0]?.id || null)
    studyPageCache.set(cacheKey, { sets: ordered })
  }, [cacheKey, onDueCountChange])

  React.useEffect(() => {
    let active = true
    void studyRequest("GET")
      .then((data) => {
        if (!active) return
        applySets(Array.isArray(data.sets) ? data.sets : [])
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load flashcards."))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [applySets])

  const createSet = async () => {
    setSaving(true)
    try {
      const data = await studyRequest("POST", {
        action: "create-set",
        title: setTitle,
        description: setDescription,
      })
      applySets(data.sets)
      setSetTitle("")
      setSetDescription("")
      setSetDialogOpen(false)
      toast.success("Flashcard set created.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create set.")
    } finally {
      setSaving(false)
    }
  }

  const openCardDialog = (card?: Flashcard) => {
    setEditingCardId(card?.id || null)
    setCardFront(card?.front || "")
    setCardBack(card?.back || "")
    setCardDialogOpen(true)
  }

  const closeCardDialog = () => {
    setCardDialogOpen(false)
    setEditingCardId(null)
    setCardFront("")
    setCardBack("")
  }

  const saveCard = async () => {
    if (!selectedSet) return
    setSaving(true)
    try {
      const data = await studyRequest(editingCardId ? "PUT" : "POST", {
        action: editingCardId ? "update-card" : "create-card",
        setId: selectedSet.id,
        cardId: editingCardId || undefined,
        front: cardFront,
        back: cardBack,
      })
      applySets(data.sets)
      closeCardDialog()
      toast.success(editingCardId ? "Flashcard updated." : "Flashcard added.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save flashcard.")
    } finally {
      setSaving(false)
    }
  }

  const openRenameDialog = (set: FlashcardSet) => {
    setRenamingSetId(set.id)
    setRenameTitle(set.title)
  }

  const renameSet = async () => {
    const set = sets.find((entry) => entry.id === renamingSetId)
    if (!set) return
    setSaving(true)
    try {
      const data = await studyRequest("PUT", {
        action: "update-set",
        setId: set.id,
        title: renameTitle,
        description: set.description,
      })
      applySets(data.sets)
      setRenamingSetId(null)
      setRenameTitle("")
      toast.success("Flashcard set renamed.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename set.")
    } finally {
      setSaving(false)
    }
  }

  const setPinned = async (set: FlashcardSet, pinned: boolean) => {
    setSaving(true)
    try {
      const data = await studyRequest("PUT", {
        action: "pin-set",
        setId: set.id,
        pinned,
      })
      applySets(data.sets)
      toast.success(pinned ? "Flashcard set pinned." : "Flashcard set unpinned.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update set.")
    } finally {
      setSaving(false)
    }
  }

  const deleteSelection = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setSaving(true)
    try {
      const data = await studyRequest("DELETE", {
        setId: target.setId,
        cardId: target.kind === "card" ? target.cardId : undefined,
      })
      applySets(data.sets)
      setDeleteTarget(null)
      if (target.kind === "set") {
        setEditingCards(false)
        setReviewCards([])
      }
      toast.success(target.kind === "set" ? "Flashcard set deleted." : "Flashcard deleted.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete flashcard.")
    } finally {
      setSaving(false)
    }
  }

  const startReview = () => {
    if (!selectedSet) return
    const now = Date.now()
    const due = selectedSet.cards.filter((card) => new Date(card.dueAt).getTime() <= now)
    setReviewCards(due)
    setReviewIndex(0)
    setFlipped(false)
    setEditingCards(false)
    if (due.length === 0) toast.info("Nothing is due in this set yet.")
  }

  const rateCard = async (rating: FlashcardReviewRating) => {
    if (!selectedSet || !activeCard) return
    setSaving(true)
    try {
      const data = await studyRequest("PUT", {
        action: "review-card",
        setId: selectedSet.id,
        cardId: activeCard.id,
        rating,
      })
      applySets(data.sets)
      setReviewIndex((current) => current + 1)
      setFlipped(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save review.")
    } finally {
      setSaving(false)
    }
  }


  if (loading) {
    return (
      <DashboardPage>
        <DashboardPageHeader title="Study" description="Flashcards and spaced repetition" />
        <DashboardPageBody>
          <div className="mx-auto grid w-full max-w-6xl gap-5" aria-label="Loading flashcards" role="status">
            <Skeleton className="h-32 w-full rounded-xl" />
            <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
              <Skeleton className="h-72 w-full rounded-xl" />
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
            <span className="sr-only">Loading flashcards</span>
          </div>
        </DashboardPageBody>
      </DashboardPage>
    )
  }

  if (reviewCards.length > 0 && reviewIndex < reviewCards.length && activeCard) {
    return (
      <StudyReviewSession
        title={selectedSet?.title || "Review"}
        card={{ id: activeCard.id, prompt: activeCard.front, answer: activeCard.back }}
        currentIndex={reviewIndex}
        totalCards={reviewCards.length}
        isRevealed={flipped}
        isSaving={saving}
        experienceMode="beginner"
        intervalLabels={{ again: "10m" }}
        onReveal={() => setFlipped(true)}
        onRate={(rating) => void rateCard(rating)}
        onExit={() => setReviewCards([])}
      />
    )
  }

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Study"
        description={`${dueCount} card${dueCount === 1 ? "" : "s"} due`}
        actions={<Button size="sm" onClick={() => setSetDialogOpen(true)}><IconPlus /> New set</Button>}
      />
      <DashboardPageBody>
        <div className="mx-auto grid w-full max-w-6xl gap-5">
          {notice}

          {sets.length === 0 ? (
            <Card className="border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] py-12 text-center ring-0">
              <CardContent className="grid justify-items-center gap-3">
                <div className="grid size-12 place-items-center rounded-xl bg-[var(--hover-bg)] text-[var(--accent-color)]"><IconCards /></div>
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">Create your first flashcard set</h3>
                  <p className="mt-1 text-sm text-[var(--text-tertiary)]">New cards are due immediately, then scheduled from your recall rating.</p>
                </div>
                <Button onClick={() => setSetDialogOpen(true)}><IconPlus /> New set</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
              <StudySetLibrary
                sets={sets}
                selectedSetId={selectedSet?.id || null}
                isSaving={saving}
                onSelect={(setId) => {
                  setSelectedSetId(setId)
                  setReviewCards([])
                  setEditingCards(false)
                }}
                onTogglePin={(set) => void setPinned(set, !set.pinned)}
                onRename={openRenameDialog}
                onDelete={(set) => setDeleteTarget({ kind: "set", setId: set.id, label: set.title })}
              />

              {selectedSet ? (
                <StudySetDetail
                  set={selectedSet}
                  isEditing={editingCards}
                  onStartEditing={() => setEditingCards(true)}
                  onStopEditing={() => setEditingCards(false)}
                  onAddCard={() => openCardDialog()}
                  onEditCard={openCardDialog}
                  onDeleteCard={(card) => setDeleteTarget({
                    kind: "card",
                    setId: selectedSet.id,
                    cardId: card.id,
                    label: card.front,
                  })}
                  onStartReview={startReview}
                />
              ) : null}
            </div>
          )}
        </div>
      </DashboardPageBody>

      <Dialog open={setDialogOpen} onOpenChange={setSetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New flashcard set</DialogTitle>
            <DialogDescription>Group cards by subject, unit, or assessment.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Input aria-label="Set title" placeholder="Biology — Cell division" value={setTitle} onChange={(event) => setSetTitle(event.target.value)} />
            <Textarea aria-label="Set description" placeholder="Optional description" value={setDescription} onChange={(event) => setSetDescription(event.target.value)} />
          </div>
          <DialogFooter showCloseButton>
            <Button onClick={createSet} disabled={saving || !setTitle.trim()}>
              {saving ? <IconLoader2 className="animate-spin" /> : null} Create set
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cardDialogOpen}
        onOpenChange={(open) => {
          if (open) setCardDialogOpen(true)
          else closeCardDialog()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCardId ? "Edit flashcard" : "Add flashcard"}</DialogTitle>
            <DialogDescription>Keep the question focused enough to retrieve one useful idea.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Textarea aria-label="Flashcard question" placeholder="Question or cue" value={cardFront} onChange={(event) => setCardFront(event.target.value)} />
            <Textarea aria-label="Flashcard answer" placeholder="Answer" value={cardBack} onChange={(event) => setCardBack(event.target.value)} />
          </div>
          <DialogFooter showCloseButton>
            <Button onClick={saveCard} disabled={saving || !cardFront.trim() || !cardBack.trim()}>
              {saving ? <IconLoader2 className="animate-spin" /> : null}
              {editingCardId ? "Save changes" : "Add card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renamingSetId)}
        onOpenChange={(open) => {
          if (!open) {
            setRenamingSetId(null)
            setRenameTitle("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename flashcard set</DialogTitle>
            <DialogDescription>Choose a clear name that is easy to find in your set list.</DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Set name"
            autoFocus
            maxLength={120}
            value={renameTitle}
            onChange={(event) => setRenameTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && renameTitle.trim() && !saving) void renameSet()
            }}
          />
          <DialogFooter showCloseButton>
            <Button onClick={renameSet} disabled={saving || !renameTitle.trim()}>
              {saving ? <IconLoader2 className="animate-spin" /> : null}
              Rename set
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !saving) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.kind === "set" ? "flashcard set" : "flashcard"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="line-clamp-3 break-words">
              {deleteTarget?.kind === "set"
                ? `This permanently deletes “${deleteTarget.label}” and every card in it.`
                : `This permanently deletes the card “${deleteTarget?.label}”.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={saving} onClick={deleteSelection}>
              {saving ? <IconLoader2 className="animate-spin" /> : <IconTrash />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardPage>
  )
}
