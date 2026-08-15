/**
 * Browser-side calls to `/api/admin/feedback`.
 *
 * The review modal and the administrator settings page both talk to the same endpoint, so the fetch
 * shapes and error unwrapping live here rather than being written twice.
 */

import type { GithubIssueSummary } from "@/lib/feedback/github"
import type { FeedbackAppeal, FeedbackQueue, FeedbackSuspension } from "@/lib/feedback/reports"

export interface FeedbackAdminSnapshot {
  queue: FeedbackQueue
  suspensions: FeedbackSuspension[]
  appeals: FeedbackAppeal[]
  github: { repository: string }
}

export const EMPTY_FEEDBACK_ADMIN_SNAPSHOT: FeedbackAdminSnapshot = {
  queue: { pending: 0, reports: [] },
  suspensions: [],
  appeals: [],
  github: { repository: "" },
}

async function requestPath<T>(
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

function request<T>(init: RequestInit, fallbackMessage: string): Promise<T> {
  return requestPath<T>("/api/admin/feedback", init, fallbackMessage)
}

export function fetchFeedbackAdminSnapshot(signal?: AbortSignal): Promise<FeedbackAdminSnapshot> {
  return request<FeedbackAdminSnapshot>(
    { method: "GET", cache: "no-store", signal },
    "The report queue could not be loaded.",
  )
}

export interface ResolveReportInput {
  reportId: string
  status: "accepted" | "dismissed"
  /** Only read for a dismissal. Omitted entirely when the administrator answers "no". */
  suspensionDuration?: string
  suspensionReason?: string
  createGithubIssue?: boolean
  /** Optional reply shown to the reporter alongside the outcome. */
  adminMessage?: string
}

export function resolveFeedbackReportRequest(input: ResolveReportInput): Promise<{
  result: { id: string; pending: number }
  issue: { number: number; url: string } | null
}> {
  return request(
    { method: "POST", body: JSON.stringify(input) },
    "The report could not be reviewed.",
  )
}

export function suspendReporterRequest(userId: string, duration: string, reason?: string): Promise<{
  suspension: { userId: string; expiresAt: string | null }
}> {
  return request(
    { method: "PATCH", body: JSON.stringify({ userId, duration, reason }) },
    "The suspension could not be updated.",
  )
}

export function revokeSuspensionRequest(userId: string): Promise<{ revoked: string }> {
  return request(
    { method: "PATCH", body: JSON.stringify({ userId, action: "revoke" }) },
    "The suspension could not be revoked.",
  )
}

export function resolveAppealRequest(
  userId: string,
  status: "accepted" | "declined",
  response?: string,
): Promise<{ appeal: { userId: string; status: string } }> {
  return request(
    { method: "PUT", body: JSON.stringify({ userId, status, response }) },
    "The appeal could not be answered.",
  )
}

export interface GithubIssueListing {
  issues: GithubIssueSummary[]
  repository: string
  state: "open" | "closed" | "all"
}

export function fetchGithubIssues(
  state: "open" | "closed" | "all",
  signal?: AbortSignal,
): Promise<GithubIssueListing> {
  return requestPath<GithubIssueListing>(
    `/api/admin/github-issues?state=${state}`,
    { method: "GET", cache: "no-store", signal },
    "The issue list could not be loaded.",
  )
}
