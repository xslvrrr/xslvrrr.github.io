"use client"

import * as React from "react"

import {
  EMPTY_FEEDBACK_ADMIN_SNAPSHOT,
  fetchFeedbackAdminSnapshot,
  type FeedbackAdminSnapshot,
} from "./feedbackAdminClient"

/**
 * Reports arrive while an administrator is doing something else, so the dashboard polls instead of
 * holding a socket open. Thirty seconds is the delay a reporter waits before their report is on
 * screen; the endpoint's read budget is sized for it.
 */
const POLL_INTERVAL_MS = 30_000

interface FeedbackAdminQueueState {
  snapshot: FeedbackAdminSnapshot
  loading: boolean
  refresh: () => Promise<void>
}

/**
 * Keeps a live view of the pending report queue for administrators.
 *
 * Polling pauses while the tab is hidden and resumes with an immediate read, so a backgrounded
 * dashboard neither burns requests nor comes back showing a stale counter.
 */
export function useFeedbackAdminQueue(enabled: boolean): FeedbackAdminQueueState {
  const [snapshot, setSnapshot] = React.useState<FeedbackAdminSnapshot>(EMPTY_FEEDBACK_ADMIN_SNAPSHOT)
  const [loading, setLoading] = React.useState(false)
  const inFlight = React.useRef<AbortController | null>(null)

  const refresh = React.useCallback(async () => {
    if (!enabled) return
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setLoading(true)
    try {
      setSnapshot(await fetchFeedbackAdminSnapshot(controller.signal))
    } catch {
      // A failed poll is not worth a toast: the next tick retries and the counter simply holds.
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [enabled])

  React.useEffect(() => {
    if (!enabled) {
      setSnapshot(EMPTY_FEEDBACK_ADMIN_SNAPSHOT)
      return
    }

    let timer: number | null = null
    const stop = () => {
      if (timer !== null) window.clearInterval(timer)
      timer = null
    }
    const start = () => {
      stop()
      void refresh()
      timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible") start()
      else stop()
    }

    handleVisibility()
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      stop()
      inFlight.current?.abort()
      inFlight.current = null
    }
  }, [enabled, refresh])

  return { snapshot, loading, refresh }
}
