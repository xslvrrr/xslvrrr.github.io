"use client"

import * as React from "react"
import {
  IconCards,
  IconDownload,
  IconFileImport,
  IconLoader2,
  IconPhoto,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"

import {
  DashboardPage,
  DashboardPageBody,
  DashboardPageHeader,
} from "@/components/dashboard/DashboardPage"
import { PageTransition } from "@/components/PageTransition"
import { useAnimationSettings } from "@/hooks/useAnimationSettings"
import { StudyAnalytics } from "@/components/dashboard/study/StudyAnalytics"
import { StudyBrowser } from "@/components/dashboard/study/StudyBrowser"
import { StudyDeckDetail } from "@/components/dashboard/study/StudyDeckDetail"
import { StudyDeckLibrary } from "@/components/dashboard/study/StudyDeckLibrary"
import { StudyImportDialog } from "@/components/dashboard/study/StudyImportDialog"
import { StudyNoteEditor } from "@/components/dashboard/study/StudyNoteEditor"
import { StudyOcclusionEditor } from "@/components/dashboard/study/StudyOcclusionEditor"
import { StudyPlanning } from "@/components/dashboard/study/StudyPlanning"
import { StudyPage } from "@/components/dashboard/study/StudyPage"
import { StudyReviewSession } from "@/components/dashboard/study/StudyReviewSession"
import { StudySmartSessions } from "@/components/dashboard/study/StudySmartSessions"
import { StudySyncStatus } from "@/components/dashboard/study/StudySyncStatus"
import { StudyUpgradeNotice } from "@/components/dashboard/study/StudyUpgradeNotice"
import { StudyWorkshop } from "@/components/dashboard/study/StudyWorkshop"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { formatStudyInterval, useStudy } from "@/hooks/useStudy"
import type {
  StudyDeckSummary,
  StudyExperienceMode,
  StudyNoteType,
  StudyNoteWithCards,
  StudyReviewRating,
} from "@/lib/study/domain"
import { renderStudyCard } from "@/lib/study/note-types"

interface StudyShellProps {
  cacheKey: string
  onDueCountChange?: (count: number) => void
}

type DeleteTarget =
  | { kind: "deck"; deck: StudyDeckSummary }
  | { kind: "note"; note: StudyNoteWithCards }

const STUDY_VIEWS = ["library", "sessions", "browser", "stats", "plan", "workshop"] as const

type StudyView = (typeof STUDY_VIEWS)[number]

export function StudyShell({ cacheKey, onDueCountChange }: StudyShellProps) {
  const { state, offline, activeItem, preview, actions } = useStudy(cacheKey, onDueCountChange)
  const [deckDialogOpen, setDeckDialogOpen] = React.useState(false)
  const [deckTitle, setDeckTitle] = React.useState("")
  const [deckDescription, setDeckDescription] = React.useState("")
  const [renamingDeck, setRenamingDeck] = React.useState<StudyDeckSummary | null>(null)
  const [renameTitle, setRenameTitle] = React.useState("")
  const [noteDialogOpen, setNoteDialogOpen] = React.useState(false)
  const [editingNote, setEditingNote] = React.useState<StudyNoteWithCards | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null)
  const [importDialogOpen, setImportDialogOpen] = React.useState(false)
  const [occlusionDialogOpen, setOcclusionDialogOpen] = React.useState(false)
  const [view, setView] = React.useState<StudyView>("library")
  const [pendingView, setPendingView] = React.useState<StudyView | null>(null)
  const animationSettings = useAnimationSettings()




  // Mirrors the dashboard's section switch: fade the current panel out, swap, then fade in.
  const viewTransitionDelay = animationSettings.animationsEnabled
    ? Math.round(150 * (100 / animationSettings.settings.animationSpeed))
    : 0
  React.useEffect(() => {
    if (!pendingView) return
    const swap = window.setTimeout(() => {
      setView(pendingView)
      setPendingView(null)
    }, viewTransitionDelay)
    return () => window.clearTimeout(swap)
  }, [pendingView, viewTransitionDelay])

  const lastErrorRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (state.error && state.error !== lastErrorRef.current) {
      lastErrorRef.current = state.error
      toast.error(state.error)
    }
    if (!state.error) lastErrorRef.current = null
  }, [state.error])

  const selectedDeck = state.decks.find((deck) => deck.id === state.selectedDeckId) ?? null
  const experienceMode = state.bootstrap?.preferences.experienceMode ?? "beginner"
  const pendingReviews = offline.status?.pendingCount ?? 0
  const offlineNotice = offline.isHost && (!offline.isOnline || pendingReviews > 0)
    ? `${offline.isOnline ? "Saved" : "No connection. Reviews are saved"} on this device. ${pendingReviews} waiting to sync.`
    : undefined

  const closeNoteDialog = () => {
    setNoteDialogOpen(false)
    setEditingNote(null)
  }

  const openNoteDialog = (note?: StudyNoteWithCards) => {
    setEditingNote(note ?? null)
    setNoteDialogOpen(true)
  }

  const submitDeck = async () => {
    try {
      await actions.createDeck(deckTitle.trim(), deckDescription.trim())
      setDeckTitle("")
      setDeckDescription("")
      setDeckDialogOpen(false)
      toast.success("Flashcard set created.")
    } catch {
      // Error surfaced through state.error.
    }
  }

  const submitRename = async () => {
    if (!renamingDeck) return
    try {
      await actions.updateDeck(renamingDeck, { title: renameTitle.trim() })
      setRenamingDeck(null)
      setRenameTitle("")
      toast.success("Flashcard set renamed.")
    } catch {
      // Error surfaced through state.error.
    }
  }

  const submitNote = async (input: {
    noteType: StudyNoteType
    fields: Record<string, unknown>
  }) => {
    if (!state.selectedDeckId) return
    try {
      await actions.saveNote({
        noteId: editingNote?.id,
        deckId: editingNote?.deckId ?? state.selectedDeckId,
        noteType: input.noteType,
        fields: input.fields,
        tags: editingNote?.tags,
        expectedRevision: editingNote?.revision,
      })
      closeNoteDialog()
      toast.success(editingNote ? "Flashcard updated." : "Flashcard added.")
    } catch {
      // Error surfaced through state.error.
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.kind === "deck") {
        await actions.removeDeck(deleteTarget.deck.id)
        toast.success("Flashcard set deleted.")
      } else {
        await actions.removeNote(deleteTarget.note.id, deleteTarget.note.deckId)
        toast.success("Flashcard deleted.")
      }
      setDeleteTarget(null)
    } catch {
      // Error surfaced through state.error.
    }
  }

  const startReview = async () => {
    const items = await actions.startReview(
      selectedDeck?.id ?? null,
      selectedDeck?.title ?? "Review",
    )
    if (items.length === 0) toast.info("Nothing is due in this set yet.")
  }

  if (state.isLoading) {
    return (
      <DashboardPage>
        <DashboardPageHeader title="Flashcards" description="Spaced repetition review" />
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

  // Accounts still on the legacy JSONB snapshot keep the previous experience until cutover.
  if (!state.bootstrap?.capabilities.normalizedStorage) {
    return (
      <StudyPage
        cacheKey={cacheKey}
        onDueCountChange={onDueCountChange}
        notice={state.bootstrap?.capabilities.cutoverAvailable
          ? <StudyUpgradeNotice onUpgraded={() => void actions.refresh()} />
          : undefined}
      />
    )
  }

  if (state.session && activeItem) {
    const intervalLabels = preview
      ? {
        again: formatStudyInterval(preview.again.nextIntervalSeconds),
        hard: formatStudyInterval(preview.hard.nextIntervalSeconds),
        good: formatStudyInterval(preview.good.nextIntervalSeconds),
        easy: formatStudyInterval(preview.easy.nextIntervalSeconds),
      }
      : undefined

    return (
      <StudyReviewSession
        title={state.session.deckTitle}
        card={{
          id: activeItem.cardId,
          ...renderStudyCard(activeItem.noteType, activeItem.fields, activeItem.templateKey),
        }}
        typedFields={activeItem.noteType === "typed" ? activeItem.fields : undefined}
        currentIndex={state.session.index}
        totalCards={state.session.items.length}
        isRevealed={state.session.isRevealed}
        isSaving={state.isSaving}
        experienceMode={experienceMode}
        intervalLabels={experienceMode === "beginner" ? undefined : intervalLabels}
        canUndo={Boolean(state.session.undoableEventId)}
        syncNotice={offlineNotice}
        onReveal={actions.reveal}
        onRate={(rating: StudyReviewRating) => void actions.rate(rating)}
        onUndo={() => void actions.undo()}
        onExit={actions.exitReview}
      />
    )
  }

  const reviewedEverything = Boolean(state.session) && !activeItem

  return (
    <DashboardPage data-tour-id="page-flashcards">
      <DashboardPageHeader
        title="Flashcards"
        description={`${state.bootstrap.dueCount} card${state.bootstrap.dueCount === 1 ? "" : "s"} due`}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
              <IconFileImport /> Import
            </Button>
            {state.bootstrap.capabilities.richNotes && state.selectedDeckId ? (
              <Button variant="outline" size="sm" onClick={() => setOcclusionDialogOpen(true)}>
                <IconPhoto /> Image card
              </Button>
            ) : null}
            {/* Downloads this account's own decks, cards, and review history. */}
            <Button variant="outline" size="sm" render={<a href="/api/study/export" download />}>
              <IconDownload /> Export
            </Button>
            <Button size="sm" onClick={() => setDeckDialogOpen(true)}><IconPlus /> New set</Button>
          </div>
        )}
      />
      <DashboardPageBody>
        <div className="mx-auto grid w-full max-w-6xl gap-5">

          <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
            <CardHeader>
              <CardTitle>Today</CardTitle>
              <CardDescription>
                {reviewedEverything
                  ? "Session finished. Reviews are saved and scheduled."
                  : `${state.bootstrap.dueCount} due now across ${state.decks.length} set${state.decks.length === 1 ? "" : "s"}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void startReview()}
                  disabled={state.isSaving || (selectedDeck?.dueCount ?? state.bootstrap.dueCount) === 0}
                >
                  {state.isSaving ? <IconLoader2 className="animate-spin" /> : <IconCards />}
                  Start review
                </Button>
                {selectedDeck ? (
                  <span className="text-sm text-[var(--text-tertiary)]">
                    Reviews {selectedDeck.title}. Clear the selection to review every set.
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Tabs
            aria-label="Study view"
            value={pendingView ?? view}
            onValueChange={(value: unknown) => {
              if (typeof value !== "string" || !STUDY_VIEWS.includes(value as StudyView)) return
              if (value === view) {
                setPendingView(null)
                return
              }
              setPendingView(value as StudyView)
            }}
          >
            <TabsList data-tour-id="flashcards-views">
              <TabsTrigger value="library">Sets</TabsTrigger>
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
              <TabsTrigger value="browser">Find cards</TabsTrigger>
              <TabsTrigger value="stats">Statistics</TabsTrigger>
              <TabsTrigger value="plan">Plan and share</TabsTrigger>
              {state.bootstrap.capabilities.aiWorkshop ? (
                <TabsTrigger value="workshop">Drafts</TabsTrigger>
              ) : null}
            </TabsList>
          </Tabs>

          <PageTransition isLoading={pendingView !== null}>
            <div className="grid gap-5">
          {view === "browser" ? <StudyBrowser decks={state.decks} /> : null}
          {view === "stats" ? <StudyAnalytics /> : null}
          {view === "plan" ? (
            <StudyPlanning
              decks={state.decks}
              selectedDeckId={state.selectedDeckId}
              onChanged={() => void actions.refresh()}
            />
          ) : null}
          {view === "workshop" ? (
            <StudyWorkshop
              decks={state.decks}
              selectedDeckId={state.selectedDeckId}
              onApproved={() => void actions.refresh()}
            />
          ) : null}
          {view === "sessions" ? (
            <StudySmartSessions
              onStart={(title, items, explanation) => {
                actions.startReviewWithItems(title, items)
                if (explanation) toast.info(explanation)
              }}
            />
          ) : null}

          {view === "library" && offline.isHost ? (
            <StudySyncStatus
              isOnline={offline.isOnline}
              isSyncing={offline.isSyncing}
              status={offline.status}
              conflicts={offline.conflicts}
              onSync={() => void actions.syncOffline()}
              onDiscardConflict={(operationId) => void actions.discardOfflineConflict(operationId)}
            />
          ) : null}

          {view === "library" && state.decks.length === 0 ? (
            <Card className="border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] py-12 text-center ring-0">
              <CardContent className="grid justify-items-center gap-3">
                <div className="grid size-12 place-items-center rounded-xl bg-[var(--hover-bg)] text-[var(--accent-color)]">
                  <IconCards />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">Create your first flashcard set</h3>
                  <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                    New cards are due immediately, then scheduled from how reliably you recall them.
                  </p>
                </div>
                <Button onClick={() => setDeckDialogOpen(true)}><IconPlus /> New set</Button>
              </CardContent>
            </Card>
          ) : view === "library" ? (
            <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
              <StudyDeckLibrary
                decks={state.decks}
                selectedDeckId={state.selectedDeckId}
                isSaving={state.isSaving}
                onSelect={actions.selectDeck}
                onTogglePin={(deck) => void actions.updateDeck(deck, { pinned: !deck.pinned })}
                onRename={(deck) => {
                  setRenamingDeck(deck)
                  setRenameTitle(deck.title)
                }}
                onDelete={(deck) => setDeleteTarget({ kind: "deck", deck })}
              />

              {selectedDeck ? (
                <StudyDeckDetail
                  deck={selectedDeck}
                  notes={state.notes}
                  isNotesLoading={state.isNotesLoading}
                  hasMoreNotes={Boolean(state.notesCursor)}
                  onAddNote={() => openNoteDialog()}
                  onEditNote={openNoteDialog}
                  onDeleteNote={(note) => setDeleteTarget({ kind: "note", note })}
                  onLoadMore={() => void actions.loadMoreNotes()}
                  onStartReview={() => void startReview()}
                />
              ) : null}
            </div>
          ) : null}
            </div>
          </PageTransition>
        </div>
      </DashboardPageBody>

      <StudyOcclusionEditor
        open={occlusionDialogOpen}
        isSaving={state.isSaving}
        onOpenChange={setOcclusionDialogOpen}
        onSubmit={async (fields) => {
          if (!state.selectedDeckId) return
          try {
            await actions.saveNote({
              deckId: state.selectedDeckId,
              noteType: "image-occlusion",
              fields,
            })
            setOcclusionDialogOpen(false)
            toast.success("Image card added.")
          } catch {
            // Error surfaced through state.error.
          }
        }}
      />

      <StudyImportDialog
        open={importDialogOpen}
        decks={state.decks}
        selectedDeckId={state.selectedDeckId}
        onOpenChange={setImportDialogOpen}
        onImported={() => void actions.refresh()}
      />

      <Dialog open={deckDialogOpen} onOpenChange={setDeckDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New flashcard set</DialogTitle>
            <DialogDescription>Group cards by subject, unit, or assessment.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Input
              aria-label="Set title"
              placeholder="Biology — Cell division"
              value={deckTitle}
              onChange={(event) => setDeckTitle(event.target.value)}
            />
            <Textarea
              aria-label="Set description"
              placeholder="Optional description"
              value={deckDescription}
              onChange={(event) => setDeckDescription(event.target.value)}
            />
          </div>
          <DialogFooter showCloseButton>
            <Button onClick={() => void submitDeck()} disabled={state.isSaving || !deckTitle.trim()}>
              {state.isSaving ? <IconLoader2 className="animate-spin" /> : null} Create set
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StudyNoteEditor
        open={noteDialogOpen}
        isSaving={state.isSaving}
        note={editingNote}
        allowRichTypes={Boolean(state.bootstrap?.capabilities.richNotes)}
        onOpenChange={(open: boolean) => {
          if (open) setNoteDialogOpen(true)
          else closeNoteDialog()
        }}
        onSubmit={submitNote}
      />

      <Dialog
        open={Boolean(renamingDeck)}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setRenamingDeck(null)
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
              if (event.key === "Enter" && renameTitle.trim() && !state.isSaving) void submitRename()
            }}
          />
          <DialogFooter showCloseButton>
            <Button onClick={() => void submitRename()} disabled={state.isSaving || !renameTitle.trim()}>
              {state.isSaving ? <IconLoader2 className="animate-spin" /> : null}
              Rename set
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open: boolean) => {
          if (!open && !state.isSaving) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.kind === "deck" ? "flashcard set" : "flashcard"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="line-clamp-3 break-words">
              {deleteTarget?.kind === "deck"
                ? `This removes “${deleteTarget.deck.title}” and every card in it. Review history is kept.`
                : `This removes the card “${deleteTarget?.note.fields.prompt ?? ""}”. Review history is kept.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={state.isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={state.isSaving} onClick={() => void confirmDelete()}>
              {state.isSaving ? <IconLoader2 className="animate-spin" /> : <IconTrash />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardPage>
  )
}
