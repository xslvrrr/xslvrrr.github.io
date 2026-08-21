"use client"

import * as React from "react"
import {
  IconArrowNarrowRight,
  IconCalendarQuestion,
  IconUserCheck,
  IconUserPause,
  type TablerIcon,
} from "@tabler/icons-react"

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
import type { TeacherChangeKind } from "@/lib/portal-teacher-changes"
import type { TeacherChangeSummary } from "@/hooks/useTeacherChanges"

/**
 * Tells the student their teacher changed, and whether it is permanent.
 *
 * The verdict is the whole point of the dialog, so it leads: each row says what happened in a
 * sentence before it shows the class it happened to. "Someone is covering Friday period 3" and
 * "you have a new teacher for the rest of the year" prompt completely different reactions, and the
 * portal itself distinguishes them nowhere.
 *
 * Dismissing acknowledges every change listed. There is no per-row dismissal because there is no
 * per-row decision to make — this is news, not a queue of work.
 */

interface TeacherChangeDialogProps {
  changes: TeacherChangeSummary[]
  onDismiss: () => void
}

const KIND_COPY: Record<TeacherChangeKind, {
  badge: string
  tone: string
  icon: TablerIcon
}> = {
  permanent: {
    badge: "Permanent",
    tone: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300",
    icon: IconUserCheck,
  },
  substitute: {
    badge: "Substitute",
    tone: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300",
    icon: IconUserPause,
  },
  unconfirmed: {
    badge: "Unconfirmed",
    tone: "border-transparent bg-muted text-muted-foreground",
    icon: IconCalendarQuestion,
  },
}

function explain(change: TeacherChangeSummary): string {
  if (change.kind === "permanent") {
    return `${change.currentTeacher} has taken this class over. The change is still there a fortnight from now, so it looks permanent.`
  }
  if (change.kind === "substitute") {
    return `${change.currentTeacher} is covering. ${change.previousTeacher} is back on the timetable a fortnight from now.`
  }
  return "Whether this is permanent could not be confirmed against a later week yet."
}

function describeSlot(change: TeacherChangeSummary): string {
  const week = change.week === "weekB" ? "Week B" : "Week A"
  return [change.day, change.period, week, change.room && `Room ${change.room}`]
    .filter(Boolean)
    .join(" · ")
}

function TeacherChangeRow({ change }: { change: TeacherChangeSummary }) {
  const copy = KIND_COPY[change.kind]
  const Icon = copy.icon

  return (
    <li className="rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{change.course || change.classCode || "A class"}</p>
          <p className="truncate text-xs text-muted-foreground">{describeSlot(change)}</p>
        </div>
        <Badge className={copy.tone}>
          <Icon className="size-3.5" stroke={2} />
          {copy.badge}
        </Badge>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-muted-foreground line-through">{change.previousTeacher}</span>
        <IconArrowNarrowRight className="size-4 text-muted-foreground" aria-label="replaced by" />
        <span className="font-medium">{change.currentTeacher}</span>
      </p>

      <p className="mt-1.5 text-xs text-muted-foreground">{explain(change)}</p>
    </li>
  )
}

export function TeacherChangeDialog({
  changes,
  onDismiss,
}: TeacherChangeDialogProps): React.ReactElement | null {
  if (changes.length === 0) return null

  // Permanent changes first: they are the ones that alter the rest of the year, and a student who
  // reads only the top of the list should read the part that matters most.
  const order: Record<TeacherChangeKind, number> = { permanent: 0, substitute: 1, unconfirmed: 2 }
  const ordered = [...changes].sort((left, right) => order[left.kind] - order[right.kind])
  const permanentCount = ordered.filter((change) => change.kind === "permanent").length

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onDismiss()
      }}
    >
      <DialogContent className="sm:max-w-lg" aria-describedby="teacher-change-description">
        <DialogHeader>
          <DialogTitle>
            {ordered.length === 1 ? "A teacher changed" : `${ordered.length} teachers changed`}
          </DialogTitle>
          <DialogDescription id="teacher-change-description">
            {permanentCount > 0
              ? "Your timetable was checked a fortnight ahead to work out which of these are permanent."
              : "Your timetable was checked a fortnight ahead to work out whether these are permanent."}
          </DialogDescription>
        </DialogHeader>

        <ul className="flex max-h-[50vh] list-none flex-col gap-2 overflow-y-auto pr-0.5">
          {ordered.map((change) => (
            <TeacherChangeRow key={change.key} change={change} />
          ))}
        </ul>

        <DialogFooter>
          <Button onClick={onDismiss}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
