/**
 * Browser-side calls a reporter makes about their own reports.
 *
 * The report dialog, the suspension notice, the settings history table, and the outcome toasts all
 * read the same overview, so the fetch shapes live here instead of in each of them.
 */

import type { FeedbackSubmission } from "@/lib/feedback/options"
import type { UserFeedbackOverview } from "@/lib/feedback/reports"

export const EMPTY_FEEDBACK_OVERVIEW: UserFeedbackOverview = { suspension: null, reports: [] }

async function feedbackRequest<T>(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: init.body ? { "Content-Type": "application/json", ...init.headers } : init.headers,
  })
  const body = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    throw new Error(typeof body?.message === "string" ? body.message : fallbackMessage)
  }
  return body as T
}

export function fetchFeedbackOverview(signal?: AbortSignal): Promise<UserFeedbackOverview> {
  return feedbackRequest<UserFeedbackOverview>(
    "/api/feedback/reports",
    { method: "GET", cache: "no-store", signal },
    "Your reports could not be loaded.",
  )
}

export function submitFeedbackRequest(submission: FeedbackSubmission): Promise<unknown> {
  return feedbackRequest(
    "/api/feedback/reports",
    { method: "POST", body: JSON.stringify(submission) },
    "Your report could not be sent.",
  )
}

export interface NoticeAcknowledgement {
  reportIds?: readonly string[]
  markSuspension?: boolean
  markAppeal?: boolean
}

export function markFeedbackNoticesSeenRequest(input: NoticeAcknowledgement): Promise<unknown> {
  return feedbackRequest(
    "/api/feedback/reports",
    { method: "PATCH", body: JSON.stringify(input) },
    "That could not be saved.",
  )
}

export function acknowledgeSuspensionRequest(): Promise<unknown> {
  return feedbackRequest(
    "/api/feedback/suspension",
    { method: "POST", body: JSON.stringify({ action: "acknowledge" }) },
    "That could not be saved.",
  )
}

export function submitAppealRequest(message: string): Promise<unknown> {
  return feedbackRequest(
    "/api/feedback/suspension",
    { method: "POST", body: JSON.stringify({ action: "appeal", message }) },
    "Your appeal could not be sent.",
  )
}
