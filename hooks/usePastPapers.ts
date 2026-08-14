import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { PastPaper, SyllabusEra } from "@/lib/past-papers/domain"
import type { PaperSave } from "@/lib/past-papers/repository"
import type { PaperFolder, PaperLadder } from "@/lib/past-papers/repository-library"
import type { Recommendation } from "@/lib/past-papers/recommendations"
import {
  DEFAULT_PAST_PAPER_PREFERENCES,
  parsePastPaperPreferences,
  type PastPaperPreferences,
} from "@/lib/past-papers/preferences"
import type { PaperSort } from "@/lib/past-papers/query"
import {
  hasEnoughForRecommendations,
  readLocalIndex,
  recordInteraction,
  removePaperLocally,
  storePaperLocally,
  type LocalPaperRecord,
} from "@/lib/past-papers/local-library"

/**
 * Data for the past papers page.
 *
 * One hook rather than several because the pieces are read together on every render of the
 * browser — a listing without its saves cannot draw a star, and without its folders cannot draw
 * the tree. Splitting them would mean the page renders three times as each settles.
 */

export interface PastPapersQuery {
  yearLevel?: string
  subjects: string[]
  categories: string[]
  schools: string[]
  difficulty: string[]
  yearFrom: number | null
  yearTo: number | null
  era: string | null
  sort: PaperSort
  search: string
  requireSolutions: boolean
  savedOnly: boolean
  /** Set by the sidebar's folder tree. Null is "not scoped to a folder". */
  folderId: string | null
  /** Only papers whose document has actually been fetched for this account. */
  downloadedOnly: boolean
}

export const EMPTY_QUERY: PastPapersQuery = {
  subjects: [],
  categories: [],
  schools: [],
  difficulty: [],
  yearFrom: null,
  yearTo: null,
  era: null,
  sort: "relevance",
  search: "",
  requireSolutions: false,
  savedOnly: false,
  folderId: null,
  downloadedOnly: false,
}

/** One page. Small enough that the first paint is quick, large enough to fill a wide grid. */
export const PAPER_PAGE_SIZE = 48

export interface PastPapersFacets {
  subjects: Array<{ slug: string; label: string; count: number }>
  schools: string[]
  years: number[]
}

interface BrowseResponse {
  papers: PastPaper[]
  recommendations: Recommendation[]
  savedPaperIds: string[]
  facets: PastPapersFacets
  eras: SyllabusEra[]
  offset: number
  hasMore: boolean
}

export interface PastPapersState {
  papers: PastPaper[]
  recommendations: Recommendation[]
  savedPaperIds: Set<string>
  saves: PaperSave[]
  folders: PaperFolder[]
  ladders: PaperLadder[]
  facets: PastPapersFacets
  eras: SyllabusEra[]
  preferences: PastPaperPreferences
  loading: boolean
  /** True only while an additional page is being appended, so the grid does not blank out. */
  loadingMore: boolean
  hasMore: boolean
  preferencesLoaded: boolean
  error: string | null
}

/**
 * Download progress, 0-1.
 *
 * `null` for a download in flight whose size the server did not declare — an indeterminate bar is
 * honest there, where a fabricated percentage is not.
 */
export type DownloadProgress = number | null

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  })
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string } | null
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || "Request failed")
  }
  return payload.data as T
}

export function usePastPapers(query: PastPapersQuery, accountId: string) {
  const [state, setState] = useState<PastPapersState>({
    papers: [],
    recommendations: [],
    savedPaperIds: new Set(),
    saves: [],
    folders: [],
    ladders: [],
    facets: { subjects: [], schools: [], years: [] },
    eras: [],
    preferences: DEFAULT_PAST_PAPER_PREFERENCES,
    loading: true,
    loadingMore: false,
    hasMore: false,
    preferencesLoaded: false,
    error: null,
  })

  // Mirrors the on-device library. Held in state as well as localStorage so a download re-renders
  // the card that triggered it; localStorage alone would change under React without telling it.
  const [localPapers, setLocalPapers] = useState<Record<string, LocalPaperRecord>>(
    () => readLocalIndex(accountId).papers,
  )
  const [downloading, setDownloading] = useState<ReadonlyMap<string, DownloadProgress>>(() => new Map())
  const [interactions, setInteractions] = useState(() => readLocalIndex(accountId).interactions.length)

  useEffect(() => {
    const index = readLocalIndex(accountId)
    setLocalPapers(index.papers)
    setInteractions(index.interactions.length)
  }, [accountId])

  /**
   * Guards against an out-of-order response overwriting a newer one.
   *
   * Filter changes fire in quick succession as a student clicks through a facet row, and a slow
   * early request landing after a fast later one would repaint the list with results for a filter
   * that is no longer selected.
   */
  const requestIdRef = useRef(0)

  // Read inside callbacks rather than captured, so starring and downloading do not need the whole
  // save set in their dependency lists — which would rebuild every card handler on every star.
  const savedIdsRef = useRef(state.savedPaperIds)
  savedIdsRef.current = state.savedPaperIds
  const downloadingRef = useRef(downloading)
  downloadingRef.current = downloading
  const localPapersRef = useRef(localPapers)
  localPapersRef.current = localPapers

  const searchParams = useMemo(() => {
    const params = new URLSearchParams()
    if (query.yearLevel) params.set("yearLevel", query.yearLevel)
    if (query.subjects.length) params.set("subjects", query.subjects.join(","))
    if (query.categories.length) params.set("categories", query.categories.join(","))
    if (query.schools.length) params.set("schools", query.schools.join(","))
    if (query.difficulty.length) params.set("difficulty", query.difficulty.join(","))
    if (query.yearFrom !== null) params.set("yearFrom", String(query.yearFrom))
    if (query.yearTo !== null) params.set("yearTo", String(query.yearTo))
    if (query.era) params.set("era", query.era)
    if (query.search.trim()) params.set("search", query.search.trim())
    if (query.requireSolutions) params.set("requireSolutions", "true")
    if (query.savedOnly) params.set("savedOnly", "true")
    if (query.folderId) params.set("folderId", query.folderId)
    if (query.downloadedOnly) params.set("downloadedOnly", "true")
    params.set("sort", query.sort)
    params.set("limit", String(PAPER_PAGE_SIZE))
    return params.toString()
  }, [query])

  const refreshLibrary = useCallback(async () => {
    const [saves, libraryData] = await Promise.all([
      request<{ saves: PaperSave[] }>("/api/past-papers/saves"),
      request<{ folders: PaperFolder[]; ladders: PaperLadder[] }>("/api/past-papers/library"),
    ])
    setState((current) => ({
      ...current,
      saves: saves.saves,
      savedPaperIds: new Set(saves.saves.map((save) => save.paperId)),
      folders: libraryData.folders,
      ladders: libraryData.ladders,
    }))
  }, [])

  // Search is debounced so typing does not issue a request per keystroke; every other filter
  // change is a deliberate click and applies immediately.
  const [debouncedParams, setDebouncedParams] = useState(searchParams)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedParams(searchParams), query.search ? 280 : 0)
    return () => clearTimeout(timer)
  }, [query.search, searchParams])

  useEffect(() => {
    const id = ++requestIdRef.current
    setState((current) => ({ ...current, loading: true, error: null }))

    void request<BrowseResponse>(`/api/past-papers/browse?${debouncedParams}&offset=0`)
      .then((data) => {
        if (id !== requestIdRef.current) return
        setState((current) => ({
          ...current,
          papers: data.papers,
          recommendations: data.recommendations,
          savedPaperIds: new Set(data.savedPaperIds),
          facets: data.facets,
          eras: data.eras,
          hasMore: data.hasMore,
          loading: false,
          loadingMore: false,
        }))
      })
      .catch((error: unknown) => {
        if (id !== requestIdRef.current) return
        setState((current) => ({
          ...current,
          loading: false,
          loadingMore: false,
          error: error instanceof Error ? error.message : "Could not load past papers",
        }))
      })
  }, [debouncedParams])

  /**
   * Appends the next page.
   *
   * Offset paging against a listing the student is also editing can repeat a row when the ordering
   * shifts underneath it, so ids already on the page are dropped rather than rendered twice with
   * duplicate React keys.
   */
  const loadMore = useCallback(() => {
    setState((current) => {
      if (current.loading || current.loadingMore || !current.hasMore) return current

      const offset = current.papers.length
      const id = requestIdRef.current

      void request<BrowseResponse>(`/api/past-papers/browse?${debouncedParams}&offset=${offset}`)
        .then((data) => {
          if (id !== requestIdRef.current) return
          setState((latest) => {
            const seen = new Set(latest.papers.map((paper) => paper.id))
            return {
              ...latest,
              papers: [...latest.papers, ...data.papers.filter((paper) => !seen.has(paper.id))],
              hasMore: data.hasMore,
              loadingMore: false,
            }
          })
        })
        .catch(() => {
          if (id !== requestIdRef.current) return
          // A failed page leaves what is already on screen and stops asking; the sentinel will try
          // again the next time the reader scrolls it back into view.
          setState((latest) => ({ ...latest, loadingMore: false, hasMore: false }))
        })

      return { ...current, loadingMore: true }
    })
  }, [debouncedParams])

  useEffect(() => {
    void Promise.all([
      refreshLibrary(),
      request<{ preferences: unknown }>("/api/past-papers/preferences")
        .then((data) => setState((current) => ({
          ...current,
          preferences: parsePastPaperPreferences(data.preferences),
          preferencesLoaded: true,
        }))),
    ]).catch(() => {
      // The catalogue is still usable without the personal layer; the browser shows it unsaved
      // rather than failing the page.
      setState((current) => ({ ...current, preferencesLoaded: true }))
    })
  }, [refreshLibrary])

  /**
   * Downloads a paper onto the device.
   *
   * The server hands over the bytes once; from then on the paper opens from IndexedDB, works
   * offline, and never asks the library for it again. Saving server-side happens first because the
   * pdf route only serves papers the account has saved — that is the authorisation check.
   *
   * Read as a stream rather than with `.blob()` so the card can show real progress. Papers here run
   * to ten megabytes, and a spinner that sits still for that long is indistinguishable from one
   * that has hung.
   */
  const downloadPaper = useCallback(async (paper: PastPaper): Promise<boolean> => {
    if (downloadingRef.current.has(paper.id)) return false
    setDownloading((current) => new Map(current).set(paper.id, null))

    try {
      if (!savedIdsRef.current.has(paper.id)) {
        await request("/api/past-papers/saves", {
          method: "POST",
          body: JSON.stringify({ paperId: paper.id, folderId: null, download: true }),
        })
      }

      const response = await fetch(`/api/past-papers/pdf?id=${encodeURIComponent(paper.id)}`, {
        cache: "no-store",
      })
      if (!response.ok) throw new Error("Could not download that paper")

      const blob = await readWithProgress(response, (fraction) => {
        setDownloading((current) => new Map(current).set(paper.id, fraction))
      })

      const record = await storePaperLocally(accountId, {
        paperId: paper.id,
        title: paper.title,
        subject: paper.subject,
        year: paper.year,
        school: paper.school,
      }, blob)

      setLocalPapers((current) => ({ ...current, [paper.id]: record }))
      setInteractions(readLocalIndex(accountId).interactions.length)
      await refreshLibrary()
      return true
    } catch (error: unknown) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Could not download that paper",
      }))
      return false
    } finally {
      setDownloading((current) => {
        const next = new Map(current)
        next.delete(paper.id)
        return next
      })
    }
  }, [accountId, refreshLibrary])

  const toggleSave = useCallback(async (paper: PastPaper, folderId: string | null = null) => {
    const saved = savedIdsRef.current.has(paper.id)

    // Optimistic: starring should feel instantaneous even though a save may also be downloading a
    // document from a distant server. Reverted below if the request fails.
    setState((current) => {
      const next = new Set(current.savedPaperIds)
      if (saved) next.delete(paper.id)
      else next.add(paper.id)
      return { ...current, savedPaperIds: next }
    })

    try {
      if (saved) {
        await request("/api/past-papers/saves", {
          method: "DELETE",
          body: JSON.stringify({ paperId: paper.id }),
        })
        await refreshLibrary()
      } else {
        await request("/api/past-papers/saves", {
          method: "POST",
          body: JSON.stringify({ paperId: paper.id, folderId, download: true }),
        })
        await refreshLibrary()

        /*
         * Starring means "I am going to sit this", so the document is fetched onto the device in
         * the background rather than waiting for the student to press download separately. Not
         * awaited: the star has already turned, and a paper on a slow source must not hold the
         * interaction open. A failure here leaves the paper starred and undownloaded, which is
         * exactly what the card's download button is for.
         */
        if (!localPapersRef.current[paper.id]) void downloadPaper(paper)
      }
    } catch (error: unknown) {
      setState((current) => {
        const next = new Set(current.savedPaperIds)
        if (saved) next.add(paper.id)
        else next.delete(paper.id)
        return {
          ...current,
          savedPaperIds: next,
          error: error instanceof Error ? error.message : "Could not update that paper",
        }
      })
    }
  }, [downloadPaper, refreshLibrary])

  const forgetPaper = useCallback(async (paperId: string) => {
    await removePaperLocally(accountId, paperId)
    setLocalPapers((current) => {
      const next = { ...current }
      delete next[paperId]
      return next
    })
  }, [accountId])

  /** Opening a paper is engagement, and engagement is what unlocks recommendations. */
  const noteInteraction = useCallback((paperId: string) => {
    setInteractions(recordInteraction(accountId, paperId))
  }, [accountId])

  const savePreferences = useCallback(async (update: Partial<PastPaperPreferences>) => {
    setState((current) => ({ ...current, preferences: { ...current.preferences, ...update } }))
    await request<{ preferences: unknown }>("/api/past-papers/preferences", {
      method: "PUT",
      body: JSON.stringify(update),
    }).catch(() => undefined)
  }, [])

  return {
    ...state,
    toggleSave,
    refreshLibrary,
    savePreferences,
    downloadPaper,
    forgetPaper,
    noteInteraction,
    loadMore,
    localPapers,
    downloadProgress: downloading,
    interactionCount: interactions,
    // Recommendations stay hidden until the student has given them something to work with.
    canRecommend: hasEnoughForRecommendations(accountId) || interactions >= 3,
  }
}

/**
 * Reads a response body, reporting how far through it is.
 *
 * Falls back to the whole-body read when the server does not declare a length or the platform has
 * no streaming body — a compressed or chunked response has no honest denominator, and inventing
 * one produces a bar that reaches 90% and stops.
 */
async function readWithProgress(
  response: Response,
  onProgress: (fraction: DownloadProgress) => void,
): Promise<Blob> {
  const declared = Number(response.headers.get("Content-Length") ?? "")
  const total = Number.isFinite(declared) && declared > 0 ? declared : null

  if (!response.body || total === null) return await response.blob()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    received += value.length
    onProgress(Math.min(1, received / total))
  }

  return new Blob(chunks as BlobPart[], { type: response.headers.get("Content-Type") ?? "application/pdf" })
}
