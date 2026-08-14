"use client"

import * as React from "react"

import { MAX_CHANGELOG_BUMPS } from "@/lib/changelog"

export type BumpStatus = "bumped" | "already_bumped" | "no_bumps_remaining"

export interface ChangelogBumpState {
  readonly counts: Readonly<Record<string, number>>
  readonly bumped: readonly string[]
  readonly remaining: number
  readonly maxBumps: number
}

export interface ChangelogBumpsApi {
  readonly state: ChangelogBumpState
  readonly isReady: boolean
  readonly isSubmitting: boolean
  readonly error: string | null
  readonly bump: (sectionId: string) => Promise<BumpStatus | null>
}

const BUMPS_ENDPOINT = "/api/changelog/bumps"

/** Counts are global, so refresh often enough to feel live without hammering the endpoint. */
const POLL_INTERVAL_MS = 20_000

const EMPTY_STATE: ChangelogBumpState = {
  counts: {},
  bumped: [],
  remaining: MAX_CHANGELOG_BUMPS,
  maxBumps: MAX_CHANGELOG_BUMPS,
}

function normalize(payload: unknown): ChangelogBumpState {
  const record = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>
  const rawCounts = (record.counts && typeof record.counts === "object" ? record.counts : {}) as Record<string, unknown>

  const counts: Record<string, number> = {}
  for (const [sectionId, value] of Object.entries(rawCounts)) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) counts[sectionId] = Math.trunc(parsed)
  }

  return {
    counts,
    bumped: Array.isArray(record.bumped)
      ? record.bumped.filter((entry): entry is string => typeof entry === "string")
      : [],
    remaining: Math.max(0, Number(record.remaining) || 0),
    maxBumps: Math.max(1, Number(record.maxBumps) || MAX_CHANGELOG_BUMPS),
  }
}

/**
 * Reads the global bump totals and this visitor's own allowance, polling while the tab is visible.
 * All authorisation and the per-visitor cap live on the server; this hook only reflects them.
 */
export function useChangelogBumps(): ChangelogBumpsApi {
  const [state, setState] = React.useState<ChangelogBumpState>(EMPTY_STATE)
  const [isReady, setIsReady] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      if (document.visibilityState === "hidden") return
      try {
        const response = await fetch(BUMPS_ENDPOINT, { cache: "no-store", credentials: "same-origin" })
        if (!response.ok) throw new Error(`Bump state request failed with ${response.status}`)
        const payload = await response.json()
        if (!cancelled) setState(normalize(payload))
      } catch {
        // A failed refresh leaves the last known counts on screen; the next tick retries.
      } finally {
        if (!cancelled) setIsReady(true)
      }
    }

    void refresh()
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    document.addEventListener("visibilitychange", refresh)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [])

  const bump = React.useCallback(async (sectionId: string): Promise<BumpStatus | null> => {
    setIsSubmitting(true)
    setError(null)
    try {
      const response = await fetch(BUMPS_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId }),
      })

      if (!response.ok) {
        const message = response.status === 429
          ? "Too many bumps from this connection. Try again later."
          : "That bump could not be saved. Please try again."
        setError(message)
        return null
      }

      const payload = await response.json()
      setState(normalize(payload))
      const status = (payload as Record<string, unknown>)?.status
      return status === "bumped" || status === "already_bumped" || status === "no_bumps_remaining"
        ? status
        : null
    } catch {
      setError("That bump could not be saved. Please try again.")
      return null
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  return { state, isReady, isSubmitting, error, bump }
}
