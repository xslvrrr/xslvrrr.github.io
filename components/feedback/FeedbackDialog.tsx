"use client"

import * as React from "react"
import { IconBug, IconBulb, IconLoader2, IconSend } from "@tabler/icons-react"
import { toast } from "sonner"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  BUG_CATEGORY_OPTIONS,
  buildFeedbackSubmission,
  EMPTY_FEEDBACK_DRAFT,
  FEEDBACK_AREA_MAX_LENGTH,
  FEEDBACK_CATEGORY_OTHER_MAX_LENGTH,
  FEEDBACK_DETAILS_MAX_LENGTH,
  FEEDBACK_DETAILS_MIN_LENGTH,
  FEEDBACK_KIND_OPTIONS,
  feedbackSubmitLabel,
  SUGGESTION_TYPE_OPTIONS,
  type BugCategory,
  type FeedbackDraft,
  type FeedbackKind,
  type FeedbackOption,
  type SuggestionType,
} from "@/lib/feedback/options"

import { submitFeedbackRequest } from "./feedbackClient"

interface FeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Lets the caller re-read the report history once a new report exists. */
  onSent: () => void
}

/** Renders a combobox whose displayed text comes from the shared option list, not the stored value. */
function OptionSelect<Value extends string>({
  ariaLabel,
  onValueChange,
  options,
  placeholder,
  value,
}: {
  ariaLabel: string
  onValueChange: (value: Value) => void
  options: readonly FeedbackOption<Value>[]
  placeholder: string
  value: Value | null
}) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as Value)}>
      <SelectTrigger aria-label={ariaLabel} className="w-full">
        <SelectValue placeholder={placeholder}>
          {(selected) => options.find((option) => option.value === selected)?.label ?? placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Question({
  children,
  description,
  label,
}: {
  children: React.ReactNode
  description?: string
  label: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {children}
    </div>
  )
}

/**
 * The report form users open from the sidebar.
 *
 * Which questions appear depends on the first answer, and the send button stays disabled until
 * `buildFeedbackSubmission` accepts the draft — the same function the API validates with, so the
 * button never enables for something the server would reject.
 *
 * A suspended account never reaches this dialog: the provider opens the suspension notice instead.
 */
export function FeedbackDialog({
  open,
  onOpenChange,
  onSent,
}: FeedbackDialogProps): React.ReactElement {
  const [draft, setDraft] = React.useState<FeedbackDraft>(EMPTY_FEEDBACK_DRAFT)
  const [sending, setSending] = React.useState(false)

  // A fresh dialog every time avoids re-submitting yesterday's half-written report.
  React.useEffect(() => {
    if (!open) return
    setDraft(EMPTY_FEEDBACK_DRAFT)
    setSending(false)
  }, [open])

  const update = React.useCallback(<Key extends keyof FeedbackDraft>(
    key: Key,
    value: FeedbackDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }, [])

  const submission = React.useMemo(() => buildFeedbackSubmission(draft), [draft])
  const isBug = draft.kind === "bug"
  const isSuggestion = draft.kind === "suggestion"

  const send = React.useCallback(async () => {
    if (!submission) return
    setSending(true)
    try {
      await submitFeedbackRequest(submission)
      toast.success(submission.kind === "bug"
        ? "Bug report sent. Thank you for the detail."
        : "Suggestion sent. Thank you for the idea.")
      onOpenChange(false)
      onSent()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Your report could not be sent.")
    } finally {
      setSending(false)
    }
  }, [onOpenChange, onSent, submission])

  const detailsLength = draft.details.trim().length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSuggestion ? <IconBulb size={17} /> : <IconBug size={17} />}
            Bugs and suggestions
          </DialogTitle>
          <DialogDescription>
            Tell us what broke or what you would like Millennium to do. Every report reaches the team.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
          <Question label="Feature suggestion or bug report?">
            <OptionSelect
              ariaLabel="Report type"
              onValueChange={(kind: FeedbackKind) => update("kind", kind)}
              options={FEEDBACK_KIND_OPTIONS}
              placeholder="Choose a report type"
              value={draft.kind}
            />
          </Question>

          {isBug ? (
            <>
              <Question label="What part of the site does the bug relate to?">
                <Input
                  maxLength={FEEDBACK_AREA_MAX_LENGTH}
                  onChange={(event) => update("area", event.target.value)}
                  placeholder="Timetable, flashcards, notifications…"
                  value={draft.area}
                />
              </Question>

              <Question label="What kind of bug is this?">
                <OptionSelect
                  ariaLabel="Bug category"
                  onValueChange={(category: BugCategory) => update("bugCategory", category)}
                  options={BUG_CATEGORY_OPTIONS}
                  placeholder="Choose a category"
                  value={draft.bugCategory}
                />
              </Question>

              {draft.bugCategory === "other" ? (
                <Question label="Describe the kind of bug">
                  <Input
                    maxLength={FEEDBACK_CATEGORY_OTHER_MAX_LENGTH}
                    onChange={(event) => update("bugCategoryOther", event.target.value)}
                    placeholder="In a few words"
                    value={draft.bugCategoryOther}
                  />
                </Question>
              ) : null}
            </>
          ) : null}

          {isSuggestion ? (
            <Question label="What type of suggestion is this?">
              <OptionSelect
                ariaLabel="Suggestion type"
                onValueChange={(type: SuggestionType) => update("suggestionType", type)}
                options={SUGGESTION_TYPE_OPTIONS}
                placeholder="Choose a suggestion type"
                value={draft.suggestionType}
              />
            </Question>
          ) : null}

          {draft.kind ? (
            <Question
              description={`At least ${FEEDBACK_DETAILS_MIN_LENGTH} characters — ${detailsLength}/${FEEDBACK_DETAILS_MAX_LENGTH}.`}
              label={isBug
                ? "Describe the bug and the steps to reproduce it"
                : "Describe what you would like to see and how it would work"}
            >
              <Textarea
                className="min-h-32"
                maxLength={FEEDBACK_DETAILS_MAX_LENGTH}
                onChange={(event) => update("details", event.target.value)}
                placeholder={isBug
                  ? "What happened, what you expected, and what to click to see it again."
                  : "What it does, where it lives, and who it helps."}
                value={draft.details}
              />
            </Question>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose render={<Button disabled={sending} variant="outline" />}>
            Cancel
          </DialogClose>
          <Button disabled={!submission || sending} onClick={() => void send()}>
            {sending ? <IconLoader2 className="animate-spin" /> : <IconSend />}
            {feedbackSubmitLabel(draft.kind)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
