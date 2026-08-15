"use client"

import * as React from "react"
import { IconMessage } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface FeedbackMessage {
  title: string
  context: string
  body: string
}

/** Shows the reply an administrator wrote, reached from a toast or the report history table. */
export function FeedbackMessageDialog({
  message,
  onOpenChange,
}: {
  message: FeedbackMessage | null
  onOpenChange: (open: boolean) => void
}): React.ReactElement | null {
  if (!message) return null

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconMessage size={17} />
            {message.title}
          </DialogTitle>
          <DialogDescription>{message.context}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border bg-muted/25 p-3 text-sm whitespace-pre-wrap break-words">
          {message.body}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
