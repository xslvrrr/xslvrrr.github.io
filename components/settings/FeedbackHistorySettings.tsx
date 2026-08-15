"use client"

import * as React from "react"
import {
  IconBan,
  IconBrandGithub,
  IconBug,
  IconBulb,
  IconHistory,
  IconMessage,
  IconRefresh,
} from "@tabler/icons-react"

import { useFeedback } from "@/components/feedback/FeedbackProvider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { describeSuspensionRemaining } from "@/lib/feedback/duration"
import {
  bugCategoryLabel,
  feedbackStatusLabel,
  suggestionTypeLabel,
} from "@/lib/feedback/options"
import type { UserFeedbackReport } from "@/lib/feedback/reports"

function submittedAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString()
}

function reportSummary(report: UserFeedbackReport): string {
  if (report.kind === "bug") {
    const category = report.bugCategory === "other"
      ? report.bugCategoryOther || "Other"
      : bugCategoryLabel(report.bugCategory ?? "other")
    return `${report.area || "Millennium"} · ${category}`
  }
  return suggestionTypeLabel(report.suggestionType ?? "new-concept")
}

function statusVariant(report: UserFeedbackReport): "default" | "secondary" | "outline" {
  if (report.status === "accepted") return "default"
  if (report.status === "dismissed") return "secondary"
  return "outline"
}

/**
 * The reporter's own history: what they sent, what was decided, and what was said back.
 *
 * It reads the provider's overview rather than fetching again, so opening settings shows the same
 * state the toasts were raised from.
 */
export function FeedbackHistorySettings(): React.ReactElement {
  const feedback = useFeedback()
  const overview = feedback?.overview ?? { suspension: null, reports: [] }
  const loading = feedback?.loading ?? false
  const suspension = overview.suspension

  return (
    <div className="grid gap-5">
      {suspension?.active ? (
        <Card data-settings-anchor="feedback-suspension">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <IconBan size={18} />
              Suspended from reports
            </CardTitle>
            <CardDescription>
              {suspension.expiresAt
                ? `This suspension ends in ${describeSuspensionRemaining(suspension.expiresAt).replace(" left", "")}.`
                : "This suspension is permanent."}
              {suspension.appeal
                ? suspension.appeal.status === "pending"
                  ? " Your appeal is awaiting review."
                  : ` Your appeal was ${suspension.appeal.status}.`
                : " You can appeal once from the Bugs/Suggestions button."}
            </CardDescription>
          </CardHeader>
          {suspension.reason || suspension.appeal?.response ? (
            <CardContent className="grid gap-2">
              {suspension.reason ? (
                <div className="rounded-lg border border-border bg-muted/25 p-3">
                  <div className="text-xs font-medium text-muted-foreground">Reason given</div>
                  <div className="text-sm whitespace-pre-wrap break-words">{suspension.reason}</div>
                </div>
              ) : null}
              {suspension.appeal?.response ? (
                <div className="rounded-lg border border-border bg-muted/25 p-3">
                  <div className="text-xs font-medium text-muted-foreground">Reply to your appeal</div>
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {suspension.appeal.response}
                  </div>
                </div>
              ) : null}
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <Card data-settings-anchor="feedback-history">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <IconHistory className="text-[var(--accent-color)]" size={18} />
                Report history
              </CardTitle>
              <CardDescription>
                Every bug report and feature suggestion you have sent, and what came back.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                aria-label="Refresh report history"
                disabled={loading || !feedback}
                onClick={() => void feedback?.refresh()}
                size="icon"
                variant="outline"
              >
                <IconRefresh className={loading ? "animate-spin" : ""} />
              </Button>
              <Button onClick={() => feedback?.openFeedback()} size="sm" disabled={!feedback}>
                New report
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2">
          {loading && overview.reports.length === 0 ? (
            [0, 1, 2].map((item) => <Skeleton className="h-20 w-full" key={item} />)
          ) : overview.reports.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/25 p-6 text-center text-sm text-muted-foreground">
              You have not sent any reports yet.
            </div>
          ) : (
            overview.reports.map((report) => (
              <div
                className="grid gap-2 rounded-lg border border-border bg-muted/25 p-3"
                key={report.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      {report.kind === "bug" ? <IconBug size={15} /> : <IconBulb size={15} />}
                      {report.kind === "bug" ? "Bug report" : "Feature suggestion"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {reportSummary(report)} · {submittedAt(report.createdAt)}
                    </div>
                  </div>
                  <Badge variant={statusVariant(report)}>{feedbackStatusLabel(report.status)}</Badge>
                </div>

                <div className="line-clamp-3 text-sm whitespace-pre-wrap break-words">
                  {report.details}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {report.adminMessage ? (
                    <Button
                      onClick={() => feedback?.showMessage({
                        title: report.status === "accepted" ? "Report accepted" : "Report dismissed",
                        context: `Reply to your ${report.kind === "bug" ? "bug report" : "suggestion"}.`,
                        body: report.adminMessage as string,
                      })}
                      size="xs"
                      variant="outline"
                    >
                      <IconMessage />
                      View message
                    </Button>
                  ) : null}
                  {report.githubIssueUrl ? (
                    <Button
                      render={<a href={report.githubIssueUrl} rel="noreferrer noopener" target="_blank" />}
                      size="xs"
                      variant="outline"
                    >
                      <IconBrandGithub />
                      Issue #{report.githubIssueNumber}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
