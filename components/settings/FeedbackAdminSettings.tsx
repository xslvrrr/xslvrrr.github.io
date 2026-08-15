"use client"

import * as React from "react"
import {
  IconBan,
  IconGavel,
  IconInbox,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react"
import { toast } from "sonner"

import {
  EMPTY_FEEDBACK_ADMIN_SNAPSHOT,
  fetchFeedbackAdminSnapshot,
  resolveAppealRequest,
  revokeSuspensionRequest,
  suspendReporterRequest,
  type FeedbackAdminSnapshot,
} from "@/components/feedback/feedbackAdminClient"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  describeSuspensionRemaining,
  isSuspensionActive,
  parseSuspensionDuration,
} from "@/lib/feedback/duration"
import { FEEDBACK_ADMIN_MESSAGE_MAX_LENGTH } from "@/lib/feedback/options"

import { GithubIssuesSettings } from "./GithubIssuesSettings"

/**
 * Administrator controls for the bug report and suggestion queue.
 *
 * Reports themselves are answered in the review modal on the dashboard; this page owns what outlives
 * a single review — how many reports are waiting, the suspensions on record, and appeals against
 * them.
 */
export function FeedbackAdminSettings(): React.ReactElement {
  const [snapshot, setSnapshot] = React.useState<FeedbackAdminSnapshot>(EMPTY_FEEDBACK_ADMIN_SNAPSHOT)
  const [loading, setLoading] = React.useState(true)
  const [pendingUserId, setPendingUserId] = React.useState<string | null>(null)
  const [durations, setDurations] = React.useState<Record<string, string>>({})
  const [appealReplies, setAppealReplies] = React.useState<Record<string, string>>({})

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      setSnapshot(await fetchFeedbackAdminSnapshot(signal))
    } catch (error) {
      if (signal?.aborted) return
      toast.error(error instanceof Error ? error.message : "The report queue could not be loaded.")
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  /** Runs one suspension or appeal mutation, keeping its row busy until the reload finishes. */
  const runForUser = React.useCallback(async (
    userId: string,
    action: () => Promise<unknown>,
    successMessage: string,
    failureMessage: string,
  ) => {
    setPendingUserId(userId)
    try {
      await action()
      toast.success(successMessage)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failureMessage)
    } finally {
      setPendingUserId(null)
    }
  }, [load])

  const applyDuration = React.useCallback((userId: string) => {
    const typed = (durations[userId] ?? "").trim()
    if (!parseSuspensionDuration(typed)) {
      toast.error("Enter a length like 12h, 3d, 2w, 6m, 1y, or perm.")
      return
    }
    void runForUser(
      userId,
      async () => {
        await suspendReporterRequest(userId, typed)
        setDurations((current) => ({ ...current, [userId]: "" }))
      },
      "Suspension updated.",
      "The suspension could not be updated.",
    )
  }, [durations, runForUser])

  const answerAppeal = React.useCallback((userId: string, status: "accepted" | "declined") => {
    void runForUser(
      userId,
      async () => {
        await resolveAppealRequest(userId, status, (appealReplies[userId] ?? "").trim() || undefined)
        setAppealReplies((current) => ({ ...current, [userId]: "" }))
      },
      status === "accepted" ? "Appeal accepted and the suspension lifted." : "Appeal declined.",
      "The appeal could not be answered.",
    )
  }, [appealReplies, runForUser])

  const pendingAppeals = snapshot.appeals.filter((appeal) => appeal.status === "pending")

  return (
    <div className="grid gap-5">
      <Card data-settings-anchor="admin-feedback-queue">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <IconInbox className="text-[var(--accent-color)]" size={18} />
                Reports queue
              </CardTitle>
              <CardDescription>
                Bug reports and feature suggestions waiting for a decision. Answering one clears it
                for every administrator.
              </CardDescription>
            </div>
            <Button
              aria-label="Refresh report queue"
              disabled={loading}
              onClick={() => void load()}
              size="icon"
              variant="outline"
            >
              <IconRefresh className={loading ? "animate-spin" : ""} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/25 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <IconInbox size={15} />
              Reports waiting for review
            </div>
            <div className="mt-2 text-xl font-semibold">
              {loading ? "—" : snapshot.queue.pending.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/25 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <IconGavel size={15} />
              Appeals waiting for review
            </div>
            <div className="mt-2 text-xl font-semibold">
              {loading ? "—" : pendingAppeals.length.toLocaleString()}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-settings-anchor="admin-feedback-appeals">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconGavel className="text-[var(--accent-color)]" size={18} />
            Suspension appeals
          </CardTitle>
          <CardDescription>
            Each suspension can be appealed once. Accepting an appeal lifts the suspension
            immediately; either answer can carry a reply the account will see.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading && snapshot.appeals.length === 0 ? (
            <Skeleton className="h-24 w-full" />
          ) : snapshot.appeals.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/25 p-4 text-center text-sm text-muted-foreground">
              No appeals have been sent.
            </div>
          ) : (
            snapshot.appeals.map((appeal) => {
              const busy = pendingUserId === appeal.userId
              const answered = appeal.status !== "pending"
              return (
                <div
                  className="grid gap-2 rounded-lg border border-border bg-muted/25 p-3"
                  key={appeal.userId}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {appeal.name || "Unnamed user"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {appeal.email || appeal.userId}
                      </div>
                    </div>
                    <Badge variant={answered
                      ? appeal.status === "accepted" ? "secondary" : "outline"
                      : "default"}>
                      {answered ? appeal.status : "Awaiting review"}
                    </Badge>
                  </div>

                  {appeal.reason ? (
                    <div className="text-xs text-muted-foreground">
                      Suspended for: {appeal.reason}
                    </div>
                  ) : null}

                  <div className="rounded-md border border-border bg-background p-2 text-sm whitespace-pre-wrap break-words">
                    {appeal.message}
                  </div>

                  {answered ? (
                    appeal.response ? (
                      <div className="text-xs text-muted-foreground">
                        Replied: {appeal.response}
                      </div>
                    ) : null
                  ) : (
                    <>
                      <Textarea
                        aria-label={`Reply to the appeal from ${appeal.name || appeal.userId}`}
                        className="min-h-16"
                        maxLength={FEEDBACK_ADMIN_MESSAGE_MAX_LENGTH}
                        onChange={(event) => setAppealReplies((current) => ({
                          ...current,
                          [appeal.userId]: event.target.value,
                        }))}
                        placeholder="Optional reply shown to the account."
                        value={appealReplies[appeal.userId] ?? ""}
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          disabled={busy}
                          onClick={() => answerAppeal(appeal.userId, "declined")}
                          size="xs"
                          variant="outline"
                        >
                          {busy ? <IconLoader2 className="animate-spin" /> : null}
                          Decline
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() => answerAppeal(appeal.userId, "accepted")}
                          size="xs"
                        >
                          Accept and lift
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card data-settings-anchor="admin-feedback-suspensions">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconBan className="text-[var(--accent-color)]" size={18} />
            Report suspensions
          </CardTitle>
          <CardDescription>
            Revoke a suspension, or type a new length to extend or re-apply one. Lapsed suspensions
            stay listed so a repeat reporter is visible.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading && snapshot.suspensions.length === 0 ? (
            <div className="grid gap-2">
              {[0, 1, 2].map((item) => <Skeleton className="h-14 w-full" key={item} />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.suspensions.map((suspension) => {
                  const active = isSuspensionActive(suspension.expiresAt)
                  const busy = pendingUserId === suspension.userId
                  return (
                    <TableRow key={suspension.userId}>
                      <TableCell>
                        <div className="max-w-56">
                          <div className="truncate font-medium">{suspension.name || "Unnamed user"}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {suspension.email || suspension.userId}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant={active ? "destructive" : "outline"}>
                            {describeSuspensionRemaining(suspension.expiresAt)}
                          </Badge>
                          {suspension.appealStatus ? (
                            <span className="text-xs text-muted-foreground">
                              Appeal {suspension.appealStatus}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-64 truncate text-xs text-muted-foreground">
                          {suspension.reason || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Input
                            aria-label={`New suspension length for ${suspension.name || suspension.userId}`}
                            className="h-8 w-24"
                            maxLength={40}
                            onChange={(event) => setDurations((current) => ({
                              ...current,
                              [suspension.userId]: event.target.value,
                            }))}
                            placeholder="2w"
                            value={durations[suspension.userId] ?? ""}
                          />
                          <Button
                            disabled={busy || !(durations[suspension.userId] ?? "").trim()}
                            onClick={() => applyDuration(suspension.userId)}
                            size="xs"
                            variant="outline"
                          >
                            {busy ? <IconLoader2 className="animate-spin" /> : null}
                            Apply
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() => void runForUser(
                              suspension.userId,
                              () => revokeSuspensionRequest(suspension.userId),
                              "Suspension revoked.",
                              "The suspension could not be revoked.",
                            )}
                            size="xs"
                            variant="outline"
                          >
                            Revoke
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {snapshot.suspensions.length === 0 ? (
                  <TableRow>
                    <TableCell className="h-24 text-center text-muted-foreground" colSpan={4}>
                      No accounts are suspended from reporting.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <GithubIssuesSettings />
    </div>
  )
}
