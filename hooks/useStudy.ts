"use client"

import * as React from "react"

import {
  deleteStudyDeck,
  deleteStudyNote,
  fetchStudyBootstrap,
  fetchStudyDeckContents,
  fetchStudyQueue,
  fetchStudyUndoableReview,
  saveStudyDeck,
  saveStudyNote,
  saveStudyPreferences,
  submitStudyReview,
  undoStudyReview,
} from "@/lib/study/client"
import type {
  StudyBootstrap,
  StudyDeckSummary,
  StudyNoteType,
  StudyNoteWithCards,
  StudyPreferences,
  StudyQueueItem,
  StudyReviewPreview,
  StudyReviewRating,
} from "@/lib/study/domain"
import { StudyServiceError } from "@/lib/study/errors"
import {
  buildStudyOfflineBootstrap,
  buildStudyOfflineQueue,
} from "@/lib/study/offline-queue"
import { FsrsStudyScheduler } from "@/lib/study/scheduler"
import { useStudyOffline } from "@/hooks/useStudyOffline"

const QUEUE_LIMIT = 60
const CONTENTS_PAGE_SIZE = 50

export interface StudyReviewSessionState {
  deckId: string | null
  deckTitle: string
  items: StudyQueueItem[]
  index: number
  isRevealed: boolean
  undoableEventId: string | null
}

export interface StudyState {
  isLoading: boolean
  isSaving: boolean
  error: string | null
  bootstrap: StudyBootstrap | null
  decks: StudyDeckSummary[]
  selectedDeckId: string | null
  notes: StudyNoteWithCards[]
  notesCursor: string | null
  isNotesLoading: boolean
  session: StudyReviewSessionState | null
}

interface StudyCacheEntry {
  bootstrap: StudyBootstrap
  decks: StudyDeckSummary[]
}

const studyCache = new Map<string, StudyCacheEntry>()

// Display-only estimate. The server recomputes and commits the authoritative transition.
const previewScheduler = new FsrsStudyScheduler()

export function formatStudyInterval(seconds: number): string {
  if (seconds < 60) return "<1m"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.round(days / 365)}y`
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useStudy(cacheKey: string, onDueCountChange?: (count: number) => void) {
  const cached = studyCache.get(cacheKey)
  const [bootstrap, setBootstrap] = React.useState<StudyBootstrap | null>(cached?.bootstrap ?? null)
  const [decks, setDecks] = React.useState<StudyDeckSummary[]>(cached?.decks ?? [])
  const [selectedDeckId, setSelectedDeckId] = React.useState<string | null>(cached?.decks[0]?.id ?? null)
  const [notes, setNotes] = React.useState<StudyNoteWithCards[]>([])
  const [notesCursor, setNotesCursor] = React.useState<string | null>(null)
  const [isNotesLoading, setNotesLoading] = React.useState(false)
  const [isLoading, setLoading] = React.useState(!cached)
  const [isSaving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [session, setSession] = React.useState<StudyReviewSessionState | null>(null)

  const dueCountRef = React.useRef(onDueCountChange)
  dueCountRef.current = onDueCountChange

  const applyBootstrap = React.useCallback((next: StudyBootstrap) => {
    setBootstrap(next)
    setDecks(next.decks)
    studyCache.set(cacheKey, { bootstrap: next, decks: next.decks })
    dueCountRef.current?.(next.dueCount)
    setSelectedDeckId((current) => (current && next.decks.some((deck) => deck.id === current)
      ? current
      : next.decks[0]?.id ?? null))
  }, [cacheKey])

  const offline = useStudyOffline()
  const offlineActionsRef = React.useRef(offline.actions)
  offlineActionsRef.current = offline.actions
  const canReviewOffline = offline.state.isHost && Boolean(offline.state.ownerId)

  const refresh = React.useCallback(async () => {
    try {
      const next = await fetchStudyBootstrap()
      applyBootstrap(next)
      if (next.capabilities.offlineSync) void offlineActionsRef.current.sync()
      return next
    } catch (cause: unknown) {
      // Falling back to local data only works once a sync has stored it on this device.
      const library = await offlineActionsRef.current.loadLibrary()
      if (!library || library.cards.length === 0) throw cause
      const next = buildStudyOfflineBootstrap(library, new Date())
      applyBootstrap(next)
      return next
    }
  }, [applyBootstrap])

  React.useEffect(() => {
    let active = true
    void refresh()
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause, "Failed to load Study data."))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [refresh])

  const loadDeckContents = React.useCallback(async (deckId: string, cursor?: string) => {
    setNotesLoading(true)
    try {
      const page = await fetchStudyDeckContents(deckId, cursor, CONTENTS_PAGE_SIZE)
      setNotes((current) => (cursor ? [...current, ...page.notes] : page.notes))
      setNotesCursor(page.nextCursor)
      setError(null)
    } catch (cause: unknown) {
      setError(errorMessage(cause, "Failed to load flashcards."))
    } finally {
      setNotesLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (!selectedDeckId || !bootstrap?.capabilities.normalizedStorage) {
      setNotes([])
      setNotesCursor(null)
      return
    }
    void loadDeckContents(selectedDeckId)
  }, [bootstrap?.capabilities.normalizedStorage, loadDeckContents, selectedDeckId])

  const runMutation = React.useCallback(async <T,>(
    operation: () => Promise<T>,
    fallbackMessage: string,
  ): Promise<T | null> => {
    setSaving(true)
    try {
      const result = await operation()
      setError(null)
      return result
    } catch (cause: unknown) {
      setError(errorMessage(cause, fallbackMessage))
      throw cause
    } finally {
      setSaving(false)
    }
  }, [])

  const createDeck = React.useCallback(async (title: string, description: string) => {
    await runMutation(
      () => saveStudyDeck({ deckId: crypto.randomUUID(), title, description }),
      "Failed to create flashcard set.",
    )
    const next = await refresh()
    return next
  }, [refresh, runMutation])

  const updateDeck = React.useCallback(async (
    deck: StudyDeckSummary,
    changes: { title?: string; description?: string; pinned?: boolean },
  ) => {
    await runMutation(() => saveStudyDeck({
      deckId: deck.id,
      title: changes.title ?? deck.title,
      description: changes.description ?? deck.description,
      pinned: changes.pinned ?? deck.pinned,
      expectedRevision: deck.revision,
    }), "Failed to update flashcard set.")
    await refresh()
  }, [refresh, runMutation])

  const removeDeck = React.useCallback(async (deckId: string) => {
    await runMutation(() => deleteStudyDeck(deckId), "Failed to delete flashcard set.")
    await refresh()
  }, [refresh, runMutation])

  const saveNote = React.useCallback(async (input: {
    noteId?: string
    deckId: string
    noteType: StudyNoteType
    fields: Record<string, unknown>
    tags?: string[]
    expectedRevision?: number
  }) => {
    await runMutation(() => saveStudyNote({
      noteId: input.noteId ?? crypto.randomUUID(),
      deckId: input.deckId,
      noteType: input.noteType,
      fields: input.fields,
      tags: input.tags ?? [],
      expectedRevision: input.expectedRevision,
    }), "Failed to save flashcard.")
    await Promise.all([refresh(), loadDeckContents(input.deckId)])
  }, [loadDeckContents, refresh, runMutation])

  const removeNote = React.useCallback(async (noteId: string, deckId: string) => {
    await runMutation(() => deleteStudyNote(noteId), "Failed to delete flashcard.")
    await Promise.all([refresh(), loadDeckContents(deckId)])
  }, [loadDeckContents, refresh, runMutation])

  const beginSession = React.useCallback((
    deckId: string | null,
    deckTitle: string,
    items: StudyQueueItem[],
  ) => {
    setSession({ deckId, deckTitle, items, index: 0, isRevealed: false, undoableEventId: null })
    return items
  }, [])

  const loadOfflineQueue = React.useCallback(async (deckId: string | null) => {
    const library = await offlineActionsRef.current.loadLibrary()
    if (!library) return null
    return buildStudyOfflineQueue(library, {
      deckId,
      limit: QUEUE_LIMIT,
      includeNew: true,
      now: new Date(),
    })
  }, [])

  const startReview = React.useCallback(async (deckId: string | null, deckTitle: string) => {
    if (canReviewOffline && !offline.state.isOnline) {
      const items = await loadOfflineQueue(deckId)
      if (!items) {
        setError("Offline review is not available on this device yet.")
        return []
      }
      return beginSession(deckId, deckTitle, items)
    }

    const items = await runMutation(
      () => fetchStudyQueue(deckId ?? undefined, QUEUE_LIMIT, true),
      "Failed to start review.",
    )
    if (!items) return []
    return beginSession(deckId, deckTitle, items)
  }, [beginSession, canReviewOffline, loadOfflineQueue, offline.state.isOnline, runMutation])

  const reveal = React.useCallback(() => {
    setSession((current) => (current ? { ...current, isRevealed: true } : current))
  }, [])

  const exitReview = React.useCallback(() => {
    setSession(null)
    void refresh().catch(() => {
      // Review results already committed server-side; a failed refresh is not a data loss.
    })
  }, [refresh])

  const activeItem = session && session.index < session.items.length
    ? session.items[session.index]
    : null

  const preview: StudyReviewPreview | null = React.useMemo(() => {
    if (!activeItem) return null
    return previewScheduler.preview({
      state: activeItem.state,
      dueAt: activeItem.dueAt,
      stability: activeItem.stability,
      difficulty: activeItem.difficulty,
      elapsedDays: activeItem.elapsedDays,
      scheduledDays: activeItem.scheduledDays,
      learningSteps: activeItem.learningSteps,
      repetitions: activeItem.repetitions,
      lapses: activeItem.lapses,
      lastReviewedAt: activeItem.lastReviewedAt,
    })
  }, [activeItem])

  // Response time is measured from when the card was shown, not from when the request starts.
  const cardShownAtRef = React.useRef(Date.now())
  React.useEffect(() => {
    cardShownAtRef.current = Date.now()
  }, [activeItem?.cardId])

  const advanceSession = React.useCallback((undoableEventId: string | null) => {
    setSession((current) => (current ? {
      ...current,
      index: current.index + 1,
      isRevealed: false,
      undoableEventId,
    } : current))
  }, [])

  const rate = React.useCallback(async (rating: StudyReviewRating) => {
    if (!session || !activeItem) return
    const durationMs = Date.now() - cardShownAtRef.current

    const queueOffline = async (): Promise<boolean> => {
      try {
        await offlineActionsRef.current.recordReview({ item: activeItem, rating, durationMs })
        setError(null)
        // Undo needs the server's review event, so it is unavailable until this review syncs.
        advanceSession(null)
        return true
      } catch (cause: unknown) {
        setError(errorMessage(cause, "Failed to save this review on this device."))
        return false
      }
    }

    if (canReviewOffline && !offline.state.isOnline) {
      await queueOffline()
      return
    }

    try {
      await runMutation(() => submitStudyReview({
        cardId: activeItem.cardId,
        clientOperationId: crypto.randomUUID(),
        expectedScheduleRevision: activeItem.scheduleRevision,
        rating,
        reviewedAt: new Date().toISOString(),
        durationMs: Math.min(3_600_000, Math.max(0, durationMs)),
      }), "Failed to save review.")
    } catch (cause: unknown) {
      // A typed Study failure means the server answered, so the review must not be queued again.
      if (canReviewOffline && !(cause instanceof StudyServiceError)) await queueOffline()
      return
    }

    const undoable = await fetchStudyUndoableReview(activeItem.cardId).catch(() => null)
    advanceSession(undoable?.eventId ?? null)
  }, [activeItem, advanceSession, canReviewOffline, offline.state.isOnline, runMutation, session])

  const undo = React.useCallback(async () => {
    if (!session?.undoableEventId) return
    const targetEventId = session.undoableEventId
    try {
      const result = await runMutation(() => undoStudyReview({
        targetEventId,
        clientOperationId: crypto.randomUUID(),
      }), "Failed to undo review.")
      if (!result) return
      setSession((current) => {
        if (!current) return current
        const restoredIndex = Math.max(0, current.index - 1)
        const restored = current.items[restoredIndex]
        return {
          ...current,
          index: restoredIndex,
          isRevealed: false,
          undoableEventId: null,
          items: restored
            ? current.items.map((item, position) => (position === restoredIndex
              ? { ...item, scheduleRevision: result.card.scheduleRevision }
              : item))
            : current.items,
        }
      })
    } catch {
      // Message already surfaced through error state.
    }
  }, [runMutation, session])

  const updatePreferences = React.useCallback(async (changes: Partial<StudyPreferences>) => {
    if (!bootstrap) return
    const preferences = await runMutation(() => saveStudyPreferences({
      ...changes,
      expectedRevision: bootstrap.preferences.revision,
    }), "Failed to save Study preferences.")
    if (!preferences) return
    setBootstrap((current) => (current ? { ...current, preferences } : current))
  }, [bootstrap, runMutation])

  const selectDeck = React.useCallback((deckId: string | null) => {
    setSelectedDeckId(deckId)
    setNotes([])
    setNotesCursor(null)
  }, [])

  return {
    state: {
      isLoading,
      isSaving,
      error,
      bootstrap,
      decks,
      selectedDeckId,
      notes,
      notesCursor,
      isNotesLoading,
      session,
    } satisfies StudyState,
    offline: offline.state,
    activeItem,
    preview,
    actions: {
      refresh,
      selectDeck,
      loadMoreNotes: () => (selectedDeckId && notesCursor
        ? loadDeckContents(selectedDeckId, notesCursor)
        : Promise.resolve()),
      createDeck,
      updateDeck,
      removeDeck,
      saveNote,
      removeNote,
      startReview,
      // Smart Sessions supply their own ordered queue; the session flow is otherwise identical.
      startReviewWithItems: (title: string, items: StudyQueueItem[]) => beginSession(null, title, items),
      reveal,
      rate,
      undo,
      exitReview,
      updatePreferences,
      syncOffline: offline.actions.sync,
      discardOfflineConflict: offline.actions.discardConflict,
      clearError: () => setError(null),
    },
  }
}
