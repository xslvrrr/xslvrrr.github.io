"use client"

import * as React from "react"

import { bulkUpdateStudyCards, searchStudyCards } from "@/lib/study/client"
import {
  STUDY_BROWSER_PAGE_SIZE,
  type StudyBrowserItem,
  type StudyBrowserQuery,
  type StudyBulkAction,
  type StudyBulkCommand,
} from "@/lib/study/browser"

export interface StudyBrowserState {
  items: StudyBrowserItem[]
  total: number
  offset: number
  isLoading: boolean
  isSaving: boolean
  error: string | null
  filter: Partial<StudyBrowserQuery>
  selectedIds: string[]
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

export function useStudyBrowser(enabled: boolean) {
  const [filter, setFilter] = React.useState<Partial<StudyBrowserQuery>>({ sort: "due" })
  const [offset, setOffset] = React.useState(0)
  const [items, setItems] = React.useState<StudyBrowserItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [isLoading, setLoading] = React.useState(false)
  const [isSaving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async (nextOffset = offset) => {
    if (!enabled) return
    setLoading(true)
    try {
      const page = await searchStudyCards({
        ...filter,
        limit: STUDY_BROWSER_PAGE_SIZE,
        offset: nextOffset,
      })
      setItems(page.items)
      setTotal(page.total)
      setOffset(nextOffset)
      setError(null)
    } catch (cause: unknown) {
      setError(errorMessage(cause, "Failed to search flashcards."))
    } finally {
      setLoading(false)
    }
  }, [enabled, filter, offset])

  React.useEffect(() => {
    // A filter change restarts at the first page; keeping the old offset would show an empty page.
    void load(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, filter])

  const runBulk = React.useCallback(async (command: StudyBulkAction) => {
    if (selectedIds.length === 0) return 0
    setSaving(true)
    try {
      const result = await bulkUpdateStudyCards({ ...command, cardIds: selectedIds } as StudyBulkCommand)
      setSelectedIds([])
      await load(offset)
      setError(null)
      return result.affected
    } catch (cause: unknown) {
      setError(errorMessage(cause, "Failed to update flashcards."))
      return 0
    } finally {
      setSaving(false)
    }
  }, [load, offset, selectedIds])

  return {
    state: {
      items,
      total,
      offset,
      isLoading,
      isSaving,
      error,
      filter,
      selectedIds,
    } satisfies StudyBrowserState,
    actions: {
      setFilter,
      goToPage: (nextOffset: number) => void load(nextOffset),
      refresh: () => void load(offset),
      toggleSelected: (cardId: string) => setSelectedIds((current) => (current.includes(cardId)
        ? current.filter((id) => id !== cardId)
        : [...current, cardId])),
      selectAllOnPage: () => setSelectedIds(items.map((item) => item.cardId)),
      clearSelection: () => setSelectedIds([]),
      runBulk,
      clearError: () => setError(null),
    },
  }
}
