"use client"

import * as React from "react"
import { IconAlertTriangle, IconLoader2, IconPlus, IconTrash } from "@tabler/icons-react"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { StudyNoteType, StudyNoteWithCards } from "@/lib/study/domain"
import {
  deriveStudyCardTemplates,
  lintStudyNote,
  studyAuthorableNoteTypes,
  type StudyAuthorableNoteType,
} from "@/lib/study/note-types"

interface StudyNoteEditorProps {
  open: boolean
  isSaving: boolean
  note: StudyNoteWithCards | null
  /** Server-owned capability. Without it only question-and-answer cards can be authored. */
  allowRichTypes: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: {
    noteType: StudyNoteType
    fields: Record<string, unknown>
  }) => Promise<void> | void
}

const NOTE_TYPE_LABELS: Record<StudyAuthorableNoteType, { label: string; hint: string }> = {
  basic: { label: "Question and answer", hint: "One card: question on the front, answer on the back." },
  "basic-reversed": { label: "Question and answer, both ways", hint: "Two cards, one in each direction." },
  typed: { label: "Type the answer", hint: "You type your answer before revealing it." },
  cloze: { label: "Fill in the blank", hint: "Mark hidden text with {{c1::like this}}. One card per number." },
  sequence: { label: "Ordered steps", hint: "Recall a process in order." },
  "compare-contrast": { label: "Tell two things apart", hint: "Practise the difference between similar concepts." },
  application: { label: "Apply it to a case", hint: "A short scenario followed by a question." },
  "image-occlusion": {
    label: "Label parts of an image",
    hint: "Add an image in the workshop. Every region needs a written label.",
  },
}

function asString(fields: Record<string, unknown>, key: string): string {
  return typeof fields[key] === "string" ? (fields[key] as string) : ""
}

function asStringList(fields: Record<string, unknown>, key: string): string[] {
  const value = fields[key]
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []
}

export function StudyNoteEditor({
  open,
  isSaving,
  note,
  allowRichTypes,
  onOpenChange,
  onSubmit,
}: StudyNoteEditorProps) {
  // Image occlusion is authored where its image lives, so it is not offered in this dialog.
  const availableTypes = studyAuthorableNoteTypes.filter((type) => (
    type !== "image-occlusion" && (allowRichTypes || type === "basic")
  ))
  const [noteType, setNoteType] = React.useState<StudyAuthorableNoteType>("basic")
  const [fields, setFields] = React.useState<Record<string, unknown>>({})

  React.useEffect(() => {
    if (!open) return
    const type = (note?.noteType ?? "basic") as StudyAuthorableNoteType
    setNoteType(studyAuthorableNoteTypes.includes(type) ? type : "basic")
    setFields(note?.fields ?? {})
  }, [note, open])

  const setField = (key: string, value: unknown) => {
    setFields((current) => ({ ...current, [key]: value }))
  }

  const steps = asStringList(fields, "steps")
  const warnings = React.useMemo(() => lintStudyNote(noteType, fields), [fields, noteType])
  const cardCount = React.useMemo(
    () => deriveStudyCardTemplates(noteType, fields).length,
    [fields, noteType],
  )

  const isComplete = (() => {
    if (noteType === "cloze") return cardCount > 0 && asString(fields, "text").trim().length > 0
    if (noteType === "sequence") {
      return asString(fields, "prompt").trim().length > 0
        && steps.filter((step) => step.trim()).length >= 2
    }
    if (noteType === "compare-contrast") {
      return ["conceptA", "conceptB", "difference"].every((key) => asString(fields, key).trim())
    }
    if (noteType === "application") {
      return ["scenario", "question", "answer"].every((key) => asString(fields, key).trim())
    }
    return asString(fields, "prompt").trim().length > 0 && asString(fields, "answer").trim().length > 0
  })()

  const submit = async () => {
    const cleaned: Record<string, unknown> = { ...fields }
    if (noteType === "sequence") {
      cleaned.steps = steps.map((step) => step.trim()).filter(Boolean)
    }
    if (noteType === "typed") {
      cleaned.aliases = asStringList(fields, "aliases").map((alias) => alias.trim()).filter(Boolean)
    }
    await onSubmit({ noteType, fields: cleaned })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{note ? "Edit flashcard" : "Add flashcard"}</DialogTitle>
          <DialogDescription>
            Keep the question focused enough to retrieve one useful idea.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="study-note-type">Card type</Label>
            <Select
              value={noteType}
              onValueChange={(value: string | null) => {
                if (value) setNoteType(value as StudyAuthorableNoteType)
              }}
            >
              <SelectTrigger id="study-note-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableTypes.map((type) => (
                  <SelectItem key={type} value={type}>{NOTE_TYPE_LABELS[type].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-[var(--text-tertiary)]">{NOTE_TYPE_LABELS[noteType].hint}</p>
          </div>

          {noteType === "cloze" ? (
            <div className="grid gap-2">
              <Label htmlFor="study-note-cloze">Text with hidden parts</Label>
              <Textarea
                id="study-note-cloze"
                placeholder="The powerhouse of the cell is the {{c1::mitochondrion}}."
                value={asString(fields, "text")}
                onChange={(event) => setField("text", event.target.value)}
              />
            </div>
          ) : null}

          {noteType === "sequence" ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="study-note-prompt">Question</Label>
                <Textarea
                  id="study-note-prompt"
                  value={asString(fields, "prompt")}
                  onChange={(event) => setField("prompt", event.target.value)}
                />
              </div>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Steps in order</legend>
                {(steps.length > 0 ? steps : ["", ""]).map((step, index) => (
                  <div className="flex items-center gap-2" key={index}>
                    <Input
                      aria-label={`Step ${index + 1}`}
                      value={step}
                      onChange={(event) => {
                        const next = [...(steps.length > 0 ? steps : ["", ""])]
                        next[index] = event.target.value
                        setField("steps", next)
                      }}
                    />
                    <Button
                      aria-label={`Remove step ${index + 1}`}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setField("steps", steps.filter((_step, position) => position !== index))}
                    >
                      <IconTrash />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setField("steps", [...(steps.length > 0 ? steps : ["", ""]), ""])}
                >
                  <IconPlus /> Add step
                </Button>
              </fieldset>
            </>
          ) : null}

          {noteType === "compare-contrast" ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="study-note-concept-a">First concept</Label>
                  <Input
                    id="study-note-concept-a"
                    value={asString(fields, "conceptA")}
                    onChange={(event) => setField("conceptA", event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="study-note-concept-b">Second concept</Label>
                  <Input
                    id="study-note-concept-b"
                    value={asString(fields, "conceptB")}
                    onChange={(event) => setField("conceptB", event.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="study-note-difference">How they differ</Label>
                <Textarea
                  id="study-note-difference"
                  value={asString(fields, "difference")}
                  onChange={(event) => setField("difference", event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="study-note-similarity">What they share (optional)</Label>
                <Textarea
                  id="study-note-similarity"
                  value={asString(fields, "similarity")}
                  onChange={(event) => setField("similarity", event.target.value)}
                />
              </div>
            </>
          ) : null}

          {noteType === "application" ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="study-note-scenario">Scenario</Label>
                <Textarea
                  id="study-note-scenario"
                  value={asString(fields, "scenario")}
                  onChange={(event) => setField("scenario", event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="study-note-question">Question</Label>
                <Textarea
                  id="study-note-question"
                  value={asString(fields, "question")}
                  onChange={(event) => setField("question", event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="study-note-application-answer">Answer</Label>
                <Textarea
                  id="study-note-application-answer"
                  value={asString(fields, "answer")}
                  onChange={(event) => setField("answer", event.target.value)}
                />
              </div>
            </>
          ) : null}

          {["basic", "basic-reversed", "typed"].includes(noteType) ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="study-note-prompt-basic">Question</Label>
                <Textarea
                  id="study-note-prompt-basic"
                  value={asString(fields, "prompt")}
                  onChange={(event) => setField("prompt", event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="study-note-answer">Answer</Label>
                <Textarea
                  id="study-note-answer"
                  value={asString(fields, "answer")}
                  onChange={(event) => setField("answer", event.target.value)}
                />
              </div>
            </>
          ) : null}

          {noteType === "typed" ? (
            <div className="grid gap-2">
              <Label htmlFor="study-note-aliases">Also accept (one per line)</Label>
              <Textarea
                id="study-note-aliases"
                value={asStringList(fields, "aliases").join("\n")}
                onChange={(event) => setField("aliases", event.target.value.split("\n"))}
              />
              <p className="text-xs text-[var(--text-tertiary)]">
                Typing checks give feedback only. You still choose how well you recalled it.
              </p>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="study-note-explanation">Explanation (optional)</Label>
            <Textarea
              id="study-note-explanation"
              value={asString(fields, "explanation")}
              onChange={(event) => setField("explanation", event.target.value)}
            />
          </div>

          <p className="text-sm text-[var(--text-tertiary)]" role="status" aria-live="polite">
            This makes {cardCount} card{cardCount === 1 ? "" : "s"}.
            {note && cardCount < note.cards.length
              ? " Cards that no longer exist on this note will be removed, along with their schedule."
              : ""}
          </p>

          {warnings.length > 0 ? (
            <ul className="grid gap-1" aria-label="Suggestions">
              {warnings.map((warning) => (
                <li className="flex items-start gap-2 text-sm text-[var(--text-tertiary)]" key={warning.code}>
                  <IconAlertTriangle aria-hidden className="mt-0.5 shrink-0" />
                  {warning.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <DialogFooter showCloseButton>
          <Button disabled={isSaving || !isComplete} onClick={() => void submit()}>
            {isSaving ? <IconLoader2 className="animate-spin" /> : null}
            {note ? "Save changes" : "Add card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
