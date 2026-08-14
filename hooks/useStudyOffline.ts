"use client"

import * as React from "react"

import { readDesktopIdentity } from "@/lib/desktop/storage"
import {
  discardStudyOfflineConflict,
  isStudyOfflineHost,
  readStudyOfflineConflicts,
  readStudyOfflineLibrary,
  readStudyOfflineStatus,
  recordStudyOfflineReview,
  synchronizeStudyOffline,
  type StudyOfflineConflict,
  type StudyOfflineLibrary,
  type StudyOfflineStatus,
} from "@/lib/study/desktop-sync"
import type { StudyCard, StudyQueueItem, StudyReviewRating } from "@/lib/study/domain"
import { FsrsStudyScheduler } from "@/lib/study/scheduler"

export interface StudyOfflineReviewInput {
  item: StudyQueueItem
  rating: StudyReviewRating
  durationMs: number
}

export interface StudyOfflineState {
  isHost: boolean
  isOnline: boolean
  ownerId: string | null
  status: StudyOfflineStatus | null
  conflicts: StudyOfflineConflict[]
  isSyncing: boolean
  error: string | null
}

/**
 * Offline previews use default scheduler parameters. The server recomputes the transition from the
 * account's own profile when the review is pushed and returns the authoritative card.
 */
const offlineScheduler = new FsrsStudyScheduler()

function projectOfflineCard(
  item: StudyQueueItem,
  rating: StudyReviewRating,
  reviewedAt: Date,
  ownerId: string,
): StudyCard {
  const transition = offlineScheduler.preview({
    state: item.state,
    dueAt: item.dueAt,
    stability: item.stability,
    difficulty: item.difficulty,
    elapsedDays: item.elapsedDays,
    scheduledDays: item.scheduledDays,
    learningSteps: item.learningSteps,
    repetitions: item.repetitions,
    lapses: item.lapses,
    lastReviewedAt: item.lastReviewedAt,
  }, reviewedAt)[rating]

  const timestamp = reviewedAt.toISOString()
  return {
    id: item.cardId,
    userId: ownerId,
    deckId: item.deckId,
    noteId: item.noteId,
    templateKey: item.templateKey,
    ordinal: 0,
    isSuspended: false,
    isBuried: false,
    ...transition.after,
    schedulerName: offlineScheduler.name,
    schedulerVersion: offlineScheduler.version,
    parametersVersion: offlineScheduler.parametersVersion,
    schedulerMetadata: { pendingSync: true },
    scheduleRevision: item.scheduleRevision + 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  }
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

export function useStudyOffline() {
  const isHost = isStudyOfflineHost()
  const [ownerId, setOwnerId] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<StudyOfflineStatus | null>(null)
  const [conflicts, setConflicts] = React.useState<StudyOfflineConflict[]>([])
  const [isSyncing, setSyncing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [isOnline, setOnline] = React.useState(true)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const update = () => setOnline(window.navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  React.useEffect(() => {
    if (!isHost) return
    let active = true
    void readDesktopIdentity()
      .then((identity) => {
        if (active) setOwnerId(identity?.ownerId ?? null)
      })
      .catch(() => {
        if (active) setOwnerId(null)
      })
    return () => { active = false }
  }, [isHost])

  const refreshStatus = React.useCallback(async () => {
    if (!ownerId) return null
    const [next, openConflicts] = await Promise.all([
      readStudyOfflineStatus(ownerId),
      readStudyOfflineConflicts(ownerId),
    ])
    setStatus(next)
    setConflicts(openConflicts)
    return next
  }, [ownerId])

  React.useEffect(() => {
    if (!ownerId) return
    void refreshStatus().catch(() => {
      // A missing local store simply means offline review is not set up on this device yet.
    })
  }, [ownerId, refreshStatus])

  const sync = React.useCallback(async () => {
    if (!ownerId || !isOnline) return null
    setSyncing(true)
    try {
      const next = await synchronizeStudyOffline(ownerId)
      setStatus(next)
      setConflicts(await readStudyOfflineConflicts(ownerId))
      setError(null)
      return next
    } catch (cause: unknown) {
      setError(errorMessage(cause, "Offline Study data could not be synced."))
      return null
    } finally {
      setSyncing(false)
    }
  }, [isOnline, ownerId])

  const loadLibrary = React.useCallback(async (): Promise<StudyOfflineLibrary | null> => {
    if (!ownerId) return null
    try {
      return await readStudyOfflineLibrary(ownerId)
    } catch {
      return null
    }
  }, [ownerId])

  /** Returns the queued operation so the caller can advance its session immediately. */
  const recordReview = React.useCallback(async (input: StudyOfflineReviewInput) => {
    if (!ownerId) throw new Error("Offline review is not available on this device.")
    const reviewedAt = new Date()
    const operationId = crypto.randomUUID()
    const card = projectOfflineCard(input.item, input.rating, reviewedAt, ownerId)

    await recordStudyOfflineReview(ownerId, {
      operationId,
      cardId: input.item.cardId,
      card,
      command: {
        cardId: input.item.cardId,
        clientOperationId: operationId,
        expectedScheduleRevision: input.item.scheduleRevision,
        rating: input.rating,
        reviewedAt: reviewedAt.toISOString(),
        durationMs: Math.min(3_600_000, Math.max(0, input.durationMs)),
        deviceId: status?.deviceId,
      },
    })
    await refreshStatus()
    return card
  }, [ownerId, refreshStatus, status?.deviceId])

  const discardConflict = React.useCallback(async (operationId: string) => {
    if (!ownerId) return
    await discardStudyOfflineConflict(ownerId, operationId)
    await refreshStatus()
  }, [ownerId, refreshStatus])

  return {
    state: {
      isHost,
      isOnline,
      ownerId,
      status,
      conflicts,
      isSyncing,
      error,
    } satisfies StudyOfflineState,
    actions: {
      sync,
      refreshStatus,
      loadLibrary,
      recordReview,
      discardConflict,
      clearError: () => setError(null),
    },
  }
}
