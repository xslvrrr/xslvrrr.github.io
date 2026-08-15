"use client"

import * as React from "react"
import { toast } from "sonner"

import type { UserFeedbackOverview, UserFeedbackReport } from "@/lib/feedback/reports"

import { FeedbackDialog } from "./FeedbackDialog"
import { FeedbackMessageDialog, type FeedbackMessage } from "./FeedbackMessageDialog"
import { SuspensionDialog } from "./SuspensionDialog"
import {
  EMPTY_FEEDBACK_OVERVIEW,
  fetchFeedbackOverview,
  markFeedbackNoticesSeenRequest,
} from "./feedbackClient"

/** Answers arrive while the reporter is elsewhere in the app, so the overview is re-read on a timer. */
const POLL_INTERVAL_MS = 60_000

interface FeedbackContextValue {
  overview: UserFeedbackOverview
  loading: boolean
  refresh: () => Promise<void>
  /** Opens the report form, or the suspension notice when the account cannot report. */
  openFeedback: () => void
  showMessage: (message: FeedbackMessage) => void
}

const FeedbackContext = React.createContext<FeedbackContextValue | null>(null)

/** Available to anything inside the provider; returns null on surfaces that do not mount it. */
export function useFeedback(): FeedbackContextValue | null {
  return React.useContext(FeedbackContext)
}

function reportNoun(report: UserFeedbackReport): string {
  return report.kind === "bug" ? "bug report" : "suggestion"
}

interface FeedbackProviderProps {
  /** False on marketing previews and logged-out surfaces, which make no requests at all. */
  enabled: boolean
  children: React.ReactNode
}

/**
 * Owns everything a reporter sees about their own reports.
 *
 * One overview backs the report dialog, the suspension notice, the settings history table, and the
 * toasts raised when an administrator answers something. Each outcome is announced once: the server
 * records that it was shown, and a local set stops a repeat between that write and the next poll.
 */
export function FeedbackProvider({ enabled, children }: FeedbackProviderProps): React.ReactElement {
  const [overview, setOverview] = React.useState<UserFeedbackOverview>(EMPTY_FEEDBACK_OVERVIEW)
  const [loading, setLoading] = React.useState(false)
  const [reportOpen, setReportOpen] = React.useState(false)
  const [suspensionOpen, setSuspensionOpen] = React.useState(false)
  const [message, setMessage] = React.useState<FeedbackMessage | null>(null)
  const announced = React.useRef(new Set<string>())

  const refresh = React.useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      setOverview(await fetchFeedbackOverview())
    } catch {
      // A failed read leaves the last known state in place; the next poll tries again.
    } finally {
      setLoading(false)
    }
  }, [enabled])

  React.useEffect(() => {
    if (!enabled) {
      setOverview(EMPTY_FEEDBACK_OVERVIEW)
      return
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [enabled, refresh])

  const showMessage = React.useCallback((next: FeedbackMessage) => setMessage(next), [])

  // Raise a toast for every outcome the reporter has not been shown yet, then record that it landed.
  React.useEffect(() => {
    if (!enabled) return

    const answeredReports = overview.reports.filter(
      (report) => report.status !== "pending" && !report.responseSeen,
    )
    const suspension = overview.suspension
    const announceSuspension = Boolean(suspension?.active && !suspension.seen)
    const appeal = suspension?.appeal
    const announceAppeal = Boolean(appeal && appeal.status !== "pending" && !appeal.seen)

    const fresh: string[] = []

    for (const report of answeredReports) {
      const key = `report:${report.id}`
      if (announced.current.has(key)) continue
      announced.current.add(key)
      fresh.push(key)

      const accepted = report.status === "accepted"
      const title = `Your ${reportNoun(report)} was ${accepted ? "accepted" : "dismissed"}.`
      const action = report.adminMessage
        ? {
          label: "View message",
          onClick: () => showMessage({
            title: accepted ? "Report accepted" : "Report dismissed",
            context: `Reply to your ${reportNoun(report)}.`,
            body: report.adminMessage as string,
          }),
        }
        : undefined
      if (accepted) toast.success(title, { action })
      else toast.error(title, { action })
    }

    if (announceSuspension && suspension && !announced.current.has("suspension")) {
      announced.current.add("suspension")
      fresh.push("suspension")
      toast.error("You have been suspended from sending reports.", {
        action: {
          label: "View details",
          onClick: () => setSuspensionOpen(true),
        },
      })
    }

    if (announceAppeal && appeal && !announced.current.has("appeal")) {
      announced.current.add("appeal")
      fresh.push("appeal")
      const accepted = appeal.status === "accepted"
      const action = appeal.response
        ? {
          label: "View message",
          onClick: () => showMessage({
            title: accepted ? "Appeal accepted" : "Appeal declined",
            context: "Reply to your suspension appeal.",
            body: appeal.response as string,
          }),
        }
        : undefined
      if (accepted) toast.success("Your appeal was accepted. You can send reports again.", { action })
      else toast.error("Your appeal was declined.", { action })
    }

    if (fresh.length === 0) return
    void markFeedbackNoticesSeenRequest({
      reportIds: answeredReports.map((report) => report.id),
      markSuspension: announceSuspension,
      markAppeal: announceAppeal,
    }).catch(() => {
      // If the write fails the outcome is re-announced on a later session, which is the safe way
      // for this to fail: a reporter seeing an answer twice beats never seeing it.
    })
  }, [enabled, overview, showMessage])

  const openFeedback = React.useCallback(() => {
    if (overview.suspension?.active) setSuspensionOpen(true)
    else setReportOpen(true)
  }, [overview.suspension])

  const value = React.useMemo<FeedbackContextValue>(
    () => ({ overview, loading, refresh, openFeedback, showMessage }),
    [loading, openFeedback, overview, refresh, showMessage],
  )

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {enabled ? (
        <>
          <FeedbackDialog open={reportOpen} onOpenChange={setReportOpen} onSent={() => void refresh()} />
          {overview.suspension ? (
            <SuspensionDialog
              onChanged={() => void refresh()}
              onOpenChange={setSuspensionOpen}
              open={suspensionOpen}
              suspension={overview.suspension}
            />
          ) : null}
          <FeedbackMessageDialog message={message} onOpenChange={() => setMessage(null)} />
        </>
      ) : null}
    </FeedbackContext.Provider>
  )
}
