"use client"

import * as React from "react"
import {
  IconBan,
  IconBrandGithub,
  IconBug,
  IconBulb,
  IconCheck,
  IconLoader2,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  describeSuspensionDuration,
  parseSuspensionDuration,
} from "@/lib/feedback/duration"
import {
  bugCategoryLabel,
  FEEDBACK_ADMIN_MESSAGE_MAX_LENGTH,
  FEEDBACK_SUSPENSION_REASON_MAX_LENGTH,
  suggestionTypeLabel,
} from "@/lib/feedback/options"
import type { FeedbackQueueReport } from "@/lib/feedback/reports"

import { resolveFeedbackReportRequest } from "./feedbackAdminClient"

/** The dialog walks one report through a decision and its single follow-up question. */
type ReviewStage = "review" | "suspend-ask" | "suspend-duration" | "github-ask"

interface AdminFeedbackReviewDialogProps {
  report: FeedbackQueueReport | null
  pending: number
  githubRepository: string
  /** Called after a report leaves the queue so the caller can re-read the counter. */
  onResolved: () => void
  onSnooze: (reportId: string) => void
}

function reportedAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString()
}

function AnswerRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-sm whitespace-pre-wrap break-words">{value}</div>
    </div>
  )
}

/**
 * The review surface every administrator sees while reports are waiting.
 *
 * The queue is shared: whoever answers first resolves the report for everyone, and a second
 * administrator acting on the same row is told it was already handled rather than overwriting it.
 */
export function AdminFeedbackReviewDialog({
  report,
  pending,
  githubRepository,
  onResolved,
  onSnooze,
}: AdminFeedbackReviewDialogProps): React.ReactElement | null {
  const [stage, setStage] = React.useState<ReviewStage>("review")
  const [durationInput, setDurationInput] = React.useState("")
  const [reply, setReply] = React.useState("")
  const [suspensionReason, setSuspensionReason] = React.useState("")
  const [working, setWorking] = React.useState(false)

  const reportId = report?.id ?? null
  React.useEffect(() => {
    setStage("review")
    setDurationInput("")
    setReply("")
    setSuspensionReason("")
    setWorking(false)
  }, [reportId])

  const parsedDuration = React.useMemo(
    () => parseSuspensionDuration(durationInput),
    [durationInput],
  )

  const submit = React.useCallback(async (input: {
    status: "accepted" | "dismissed"
    suspensionDuration?: string
    createGithubIssue?: boolean
  }) => {
    if (!report) return
    setWorking(true)
    try {
      const { issue } = await resolveFeedbackReportRequest({
        reportId: report.id,
        adminMessage: reply.trim() || undefined,
        suspensionReason: input.suspensionDuration ? suspensionReason.trim() || undefined : undefined,
        ...input,
      })
      if (issue) {
        toast.success(`Accepted. GitHub issue #${issue.number} created.`)
      } else if (input.status === "accepted") {
        toast.success("Report accepted.")
      } else if (input.suspensionDuration) {
        toast.success("Report dismissed and the reporter was suspended.")
      } else {
        toast.success("Report dismissed.")
      }
      onResolved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The report could not be reviewed.")
      setWorking(false)
    }
  }, [onResolved, reply, report, suspensionReason])

  if (!report) return null

  const isBug = report.kind === "bug"
  const reporterName = report.reporter.name || report.reporter.email || "Deleted account"

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !working) onSnooze(report.id)
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2">
              {isBug ? <IconBug size={17} /> : <IconBulb size={17} />}
              {isBug ? "Bug report" : "Feature suggestion"}
            </DialogTitle>
            <Badge variant="secondary">
              {pending} report{pending === 1 ? "" : "s"} left
            </Badge>
          </div>
          <DialogDescription>
            From {reporterName}
            {report.reporter.school ? ` · ${report.reporter.school}` : ""} · {reportedAt(report.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[52vh] gap-3 overflow-y-auto rounded-lg border border-border bg-muted/25 p-3 pr-3">
          {isBug ? (
            <>
              <AnswerRow label="Part of the site" value={report.area || "—"} />
              <AnswerRow
                label="Kind of bug"
                value={report.bugCategory === "other"
                  ? `Other — ${report.bugCategoryOther || "—"}`
                  : bugCategoryLabel(report.bugCategory ?? "other")}
              />
              <AnswerRow label="Description and steps to reproduce" value={report.details} />
            </>
          ) : (
            <>
              <AnswerRow
                label="Type of suggestion"
                value={suggestionTypeLabel(report.suggestionType ?? "new-concept")}
              />
              <AnswerRow label="Requested behaviour" value={report.details} />
            </>
          )}
          {report.reporter.suspended ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconBan size={13} />
              This account is already suspended from reporting.
            </div>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label className="text-sm font-medium" htmlFor="feedback-admin-reply">
            Reply to the reporter <span className="text-muted-foreground">(optional)</span>
          </Label>
          <p className="text-xs text-muted-foreground">
            Shown to them with the outcome. Leave blank to send the decision on its own.
          </p>
          <Textarea
            className="min-h-20"
            id="feedback-admin-reply"
            maxLength={FEEDBACK_ADMIN_MESSAGE_MAX_LENGTH}
            onChange={(event) => setReply(event.target.value)}
            placeholder="Thanks — this is fixed in the next release."
            value={reply}
          />
        </div>

        {stage === "suspend-ask" ? (
          <div className="rounded-lg border border-border p-3">
            <div className="text-sm font-medium">Suspend this account from reports?</div>
            <p className="mt-1 text-xs text-muted-foreground">
              A suspended account cannot send bug reports or suggestions until the suspension lapses
              or an administrator revokes it.
            </p>
          </div>
        ) : null}

        {stage === "suspend-duration" ? (
          <div className="grid gap-1.5 rounded-lg border border-border p-3">
            <Label className="text-sm font-medium" htmlFor="feedback-suspension-length">
              How long?
            </Label>
            <p className="text-xs text-muted-foreground">
              Use h for hours, d for days, w for weeks, m for months, y for years, or perm for
              permanent. Segments combine, like 1y 6m.
            </p>
            <Input
              autoFocus
              id="feedback-suspension-length"
              maxLength={40}
              onChange={(event) => setDurationInput(event.target.value)}
              placeholder="2w"
              value={durationInput}
            />
            <div className="text-xs text-muted-foreground">
              {durationInput.trim().length === 0
                ? "Nothing entered yet."
                : parsedDuration
                  ? describeSuspensionDuration(parsedDuration)
                  : "That is not a length this field understands."}
            </div>

            <Label className="mt-2 text-sm font-medium" htmlFor="feedback-suspension-reason">
              Reason <span className="text-muted-foreground">(optional)</span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Shown to the account on the suspension notice.
            </p>
            <Input
              id="feedback-suspension-reason"
              maxLength={FEEDBACK_SUSPENSION_REASON_MAX_LENGTH}
              onChange={(event) => setSuspensionReason(event.target.value)}
              placeholder="Repeated reports that were not about Millennium."
              value={suspensionReason}
            />
          </div>
        ) : null}

        {stage === "github-ask" ? (
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <IconBrandGithub size={15} />
              Create a GitHub issue?
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              The report&apos;s answers are filed as an issue on {githubRepository}. The reporter&apos;s
              identity is not included.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          {stage === "review" ? (
            <>
              <Button
                disabled={working}
                onClick={() => setStage("suspend-ask")}
                variant="outline"
              >
                <IconX />
                Dismiss
              </Button>
              <Button disabled={working} onClick={() => setStage("github-ask")}>
                <IconCheck />
                Accept
              </Button>
            </>
          ) : null}

          {stage === "suspend-ask" ? (
            <>
              <Button
                disabled={working}
                onClick={() => void submit({ status: "dismissed" })}
                variant="outline"
              >
                {working ? <IconLoader2 className="animate-spin" /> : null}
                No, just dismiss
              </Button>
              <Button
                disabled={working}
                onClick={() => setStage("suspend-duration")}
                variant="destructive"
              >
                <IconBan />
                Yes, suspend
              </Button>
            </>
          ) : null}

          {stage === "suspend-duration" ? (
            <>
              <Button disabled={working} onClick={() => setStage("suspend-ask")} variant="outline">
                Back
              </Button>
              <Button
                disabled={working || !parsedDuration}
                onClick={() => void submit({
                  status: "dismissed",
                  suspensionDuration: durationInput.trim(),
                })}
                variant="destructive"
              >
                {working ? <IconLoader2 className="animate-spin" /> : <IconBan />}
                Dismiss and suspend
              </Button>
            </>
          ) : null}

          {stage === "github-ask" ? (
            <>
              <Button
                disabled={working}
                onClick={() => void submit({ status: "accepted" })}
                variant="outline"
              >
                {working ? <IconLoader2 className="animate-spin" /> : null}
                No, accept only
              </Button>
              <Button
                disabled={working}
                onClick={() => void submit({ status: "accepted", createGithubIssue: true })}
              >
                {working ? <IconLoader2 className="animate-spin" /> : <IconBrandGithub />}
                Yes, create issue
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
