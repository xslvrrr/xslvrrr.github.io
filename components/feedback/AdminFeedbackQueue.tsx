"use client"

import * as React from "react"

import { AdminFeedbackReviewDialog } from "./AdminFeedbackReviewDialog"
import { useFeedbackAdminQueue } from "./useFeedbackAdminQueue"

interface AdminFeedbackQueueProps {
  /** Only administrators poll. Preview surfaces pass false so no request is made at all. */
  enabled: boolean
}

/**
 * Surfaces waiting reports to every administrator as a modal, oldest first.
 *
 * Closing the modal snoozes that one report rather than the queue, so an administrator who is busy
 * is not re-interrupted by the same row every poll, but a genuinely new report still opens it.
 */
export function AdminFeedbackQueue({ enabled }: AdminFeedbackQueueProps): React.ReactElement | null {
  const { snapshot, refresh } = useFeedbackAdminQueue(enabled)
  const [snoozedIds, setSnoozedIds] = React.useState<readonly string[]>([])

  const active = React.useMemo(
    () => snapshot.queue.reports.find((report) => !snoozedIds.includes(report.id)) ?? null,
    [snapshot.queue.reports, snoozedIds],
  )

  // Resolved reports leave the queue, so their snooze entries are dropped to keep the list bounded.
  React.useEffect(() => {
    setSnoozedIds((current) => {
      const queued = new Set(snapshot.queue.reports.map((report) => report.id))
      const retained = current.filter((id) => queued.has(id))
      return retained.length === current.length ? current : retained
    })
  }, [snapshot.queue.reports])

  const snooze = React.useCallback((reportId: string) => {
    setSnoozedIds((current) => current.includes(reportId) ? current : [...current, reportId])
  }, [])

  if (!enabled) return null

  return (
    <AdminFeedbackReviewDialog
      githubRepository={snapshot.github.repository}
      onResolved={() => void refresh()}
      onSnooze={snooze}
      pending={snapshot.queue.pending}
      report={active}
    />
  )
}
