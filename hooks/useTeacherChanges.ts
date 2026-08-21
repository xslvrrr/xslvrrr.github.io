"use client"

import * as React from "react"

import type { TeacherChangeKind } from "@/lib/portal-teacher-changes"

/**
 * The teacher changes waiting to be shown, and the dismissal that clears them.
 *
 * Two things can surface a change: the sync that found it, which reports it in its own response, and
 * a change found earlier — by a background refresh, or on another device — which is read once on
 * load. Both feed the same list, because from the student's side there is no difference.
 *
 * Acknowledgement is server-side rather than a local dismissal key. A change is a fact about the
 * account, not about this browser, and dismissing it on a laptop should not leave it waiting on a
 * phone.
 */

export interface TeacherChangeSummary {
  key: string
  week: "weekA" | "weekB"
  day: string
  period: string
  course: string
  classCode: string
  room: string
  previousTeacher: string
  currentTeacher: string
  kind: TeacherChangeKind
  lookaheadDate: string | null
  detectedAt: string
}

/** Dispatched by the sync client when a refresh comes back carrying changes. */
export const TEACHER_CHANGES_EVENT = "millennium-teacher-changes"

export function emitTeacherChanges(changes: TeacherChangeSummary[]): void {
  if (typeof window === "undefined" || changes.length === 0) return
  window.dispatchEvent(new CustomEvent(TEACHER_CHANGES_EVENT, { detail: changes }))
}

function isTeacherChangeKind(value: unknown): value is TeacherChangeKind {
  return value === "permanent" || value === "substitute" || value === "unconfirmed"
}

/**
 * Narrows whatever arrived into the shape the dialog renders.
 *
 * Applied to the API response as well as the event payload. Both cross a boundary, and a change is
 * rendered as a sentence about a named teacher — a field that is quietly undefined would read as a
 * statement about nobody.
 */
export function toTeacherChangeSummary(value: unknown): TeacherChangeSummary | null {
  if (!value || typeof value !== "object") return null
  const source = value as Record<string, unknown>
  const text = (key: string) => (typeof source[key] === "string" ? (source[key] as string) : "")

  const key = text("key")
  const previousTeacher = text("previousTeacher")
  const currentTeacher = text("currentTeacher")
  if (!key || !previousTeacher || !currentTeacher) return null

  return {
    key,
    week: source.week === "weekB" ? "weekB" : "weekA",
    day: text("day"),
    period: text("period"),
    course: text("course"),
    classCode: text("classCode"),
    room: text("room"),
    previousTeacher,
    currentTeacher,
    kind: isTeacherChangeKind(source.kind) ? source.kind : "unconfirmed",
    lookaheadDate: typeof source.lookaheadDate === "string" ? source.lookaheadDate : null,
    detectedAt: text("detectedAt") || new Date().toISOString(),
  }
}

function mergeChanges(
  existing: TeacherChangeSummary[],
  incoming: TeacherChangeSummary[],
): TeacherChangeSummary[] {
  if (incoming.length === 0) return existing
  const byKey = new Map(existing.map((change) => [change.key, change]))
  // The incoming copy wins: a re-detected change may have been reclassified since, and the newer
  // verdict is the one worth showing.
  for (const change of incoming) byKey.set(change.key, change)
  return [...byKey.values()]
}

export interface UseTeacherChangesResult {
  changes: TeacherChangeSummary[]
  dismiss: () => void
}

export function useTeacherChanges(enabled: boolean): UseTeacherChangesResult {
  const [changes, setChanges] = React.useState<TeacherChangeSummary[]>([])

  React.useEffect(() => {
    if (!enabled) {
      setChanges([])
      return
    }

    const controller = new AbortController()

    const handleIncoming = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!Array.isArray(detail)) return
      const parsed = detail.map(toTeacherChangeSummary).filter(Boolean) as TeacherChangeSummary[]
      setChanges((current) => mergeChanges(current, parsed))
    }

    window.addEventListener(TEACHER_CHANGES_EVENT, handleIncoming)

    void (async () => {
      try {
        const response = await fetch("/api/portal/teacher-changes", {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        })
        if (!response.ok) return
        const body = await response.json()
        const parsed = (Array.isArray(body?.changes) ? body.changes : [])
          .map(toTeacherChangeSummary)
          .filter(Boolean) as TeacherChangeSummary[]
        setChanges((current) => mergeChanges(current, parsed))
      } catch {
        // A teacher-change check that cannot reach the server is not worth an error surface. The
        // change is still recorded, and the next load asks again.
      }
    })()

    return () => {
      controller.abort()
      window.removeEventListener(TEACHER_CHANGES_EVENT, handleIncoming)
    }
  }, [enabled])

  const dismiss = React.useCallback(() => {
    // Cleared locally first. The acknowledgement is what stops it coming back on the next load, but
    // the dialog must close on the click rather than on the round trip.
    setChanges([])
    void fetch("/api/portal/teacher-changes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changeKeys: [] }),
    }).catch(() => {
      // Left unacknowledged on the server, so it reappears next load rather than being lost.
    })
  }, [])

  return { changes, dismiss }
}
