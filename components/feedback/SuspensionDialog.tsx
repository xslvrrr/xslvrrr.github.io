"use client"

import * as React from "react"
import { IconBan, IconLoader2, IconSend } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { describeSuspensionRemaining } from "@/lib/feedback/duration"
import {
  FEEDBACK_APPEAL_MAX_LENGTH,
  FEEDBACK_APPEAL_MIN_LENGTH,
} from "@/lib/feedback/options"
import type { UserSuspensionState } from "@/lib/feedback/reports"

import { acknowledgeSuspensionRequest, submitAppealRequest } from "./feedbackClient"

interface SuspensionDialogProps {
  open: boolean
  suspension: UserSuspensionState
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}

function suspensionLength(suspension: UserSuspensionState): string {
  if (!suspension.expiresAt) return "This suspension is permanent."
  return `This suspension ends in ${describeSuspensionRemaining(suspension.expiresAt).replace(" left", "")}.`
}

/**
 * Told to a suspended account instead of the report form.
 *
 * Appeals are allowed once per suspension. The database owns that rule; this only decides whether to
 * offer the button, and shows the appeal's state once one has been sent.
 */
export function SuspensionDialog({
  open,
  suspension,
  onOpenChange,
  onChanged,
}: SuspensionDialogProps): React.ReactElement {
  const [appealing, setAppealing] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [working, setWorking] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setAppealing(false)
    setMessage("")
    setWorking(false)
  }, [open])

  const close = React.useCallback(async () => {
    onOpenChange(false)
    if (suspension.acknowledged) return
    try {
      await acknowledgeSuspensionRequest()
      onChanged()
    } catch {
      // Acknowledgement is a record, not a gate. Failing to store it changes nothing the user sees.
    }
  }, [onChanged, onOpenChange, suspension.acknowledged])

  const sendAppeal = React.useCallback(async () => {
    setWorking(true)
    try {
      await submitAppealRequest(message.trim())
      toast.success("Appeal sent. An administrator will review it.")
      onOpenChange(false)
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Your appeal could not be sent.")
      setWorking(false)
    }
  }, [message, onChanged, onOpenChange])

  const trimmedLength = message.trim().length
  const appealReady = trimmedLength >= FEEDBACK_APPEAL_MIN_LENGTH
    && trimmedLength <= FEEDBACK_APPEAL_MAX_LENGTH
  const appeal = suspension.appeal

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !working) void close() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <IconBan size={17} />
            You are suspended from sending reports
          </DialogTitle>
          <DialogDescription>
            {suspensionLength(suspension)} You cannot send bug reports or feature suggestions until
            it ends or an administrator lifts it.
          </DialogDescription>
        </DialogHeader>

        {suspension.reason ? (
          <div className="grid gap-1 rounded-lg border border-border bg-muted/25 p-3">
            <div className="text-xs font-medium text-muted-foreground">Reason given</div>
            <div className="text-sm whitespace-pre-wrap break-words">{suspension.reason}</div>
          </div>
        ) : null}

        {appeal ? (
          <div className="grid gap-1 rounded-lg border border-border bg-muted/25 p-3">
            <div className="text-xs font-medium text-muted-foreground">
              {appeal.status === "pending"
                ? "Your appeal is awaiting review"
                : appeal.status === "accepted"
                  ? "Your appeal was accepted"
                  : "Your appeal was declined"}
            </div>
            <div className="text-sm whitespace-pre-wrap break-words">{appeal.message}</div>
            {appeal.response ? (
              <div className="mt-2 border-t border-border pt-2">
                <div className="text-xs font-medium text-muted-foreground">Administrator reply</div>
                <div className="text-sm whitespace-pre-wrap break-words">{appeal.response}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {appealing ? (
          <div className="grid gap-1.5">
            <Label className="text-sm font-medium" htmlFor="feedback-appeal-message">
              Why should this suspension be lifted?
            </Label>
            <p className="text-xs text-muted-foreground">
              You can appeal once. At least {FEEDBACK_APPEAL_MIN_LENGTH} characters —{" "}
              {trimmedLength}/{FEEDBACK_APPEAL_MAX_LENGTH}.
            </p>
            <Textarea
              autoFocus
              className="min-h-28"
              id="feedback-appeal-message"
              maxLength={FEEDBACK_APPEAL_MAX_LENGTH}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Explain what happened, in your own words."
              value={message}
            />
          </div>
        ) : null}

        <DialogFooter>
          {appealing ? (
            <>
              <Button disabled={working} onClick={() => setAppealing(false)} variant="outline">
                Back
              </Button>
              <Button disabled={working || !appealReady} onClick={() => void sendAppeal()}>
                {working ? <IconLoader2 className="animate-spin" /> : <IconSend />}
                Send appeal
              </Button>
            </>
          ) : (
            <>
              {appeal ? null : (
                <Button disabled={working} onClick={() => setAppealing(true)} variant="outline">
                  Appeal
                </Button>
              )}
              <Button disabled={working} onClick={() => void close()}>
                I understand
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
