"use client"

import * as React from "react"
import { IconAlertTriangle, IconFileImport, IconLoader2 } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  commitStudyImport,
  previewStudyImport,
  rollbackStudyImport,
} from "@/lib/study/client"
import type { StudyDeckSummary } from "@/lib/study/domain"
import {
  STUDY_IMPORT_MAX_BYTES,
  buildStudyImportErrorReport,
  inspectStudyImportFile,
  type StudyImportSummary,
} from "@/lib/study/imports"

interface StudyImportDialogProps {
  open: boolean
  decks: StudyDeckSummary[]
  selectedDeckId: string | null
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

type Stage = "choose" | "map" | "preview" | "done"

const NEW_DECK_VALUE = "new-set"

function downloadText(fileName: string, contents: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }))
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function StudyImportDialog({
  open,
  decks,
  selectedDeckId,
  onOpenChange,
  onImported,
}: StudyImportDialogProps) {
  const [stage, setStage] = React.useState<Stage>("choose")
  const [fileName, setFileName] = React.useState("")
  const [content, setContent] = React.useState("")
  const [hasHeader, setHasHeader] = React.useState(true)
  const [columns, setColumns] = React.useState<string[]>([])
  const [promptColumn, setPromptColumn] = React.useState("")
  const [answerColumn, setAnswerColumn] = React.useState("")
  const [tagsColumn, setTagsColumn] = React.useState("")
  const [deckChoice, setDeckChoice] = React.useState<string>(selectedDeckId ?? NEW_DECK_VALUE)
  const [deckTitle, setDeckTitle] = React.useState("")
  const [skipDuplicates, setSkipDuplicates] = React.useState(true)
  const [summary, setSummary] = React.useState<StudyImportSummary | null>(null)
  const [jobId, setJobId] = React.useState<string | null>(null)
  const [importedNotes, setImportedNotes] = React.useState(0)
  const [isBusy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const reset = React.useCallback(() => {
    setStage("choose")
    setFileName("")
    setContent("")
    setColumns([])
    setPromptColumn("")
    setAnswerColumn("")
    setTagsColumn("")
    setSummary(null)
    setJobId(null)
    setImportedNotes(0)
    setError(null)
  }, [])

  const readFile = async (file: File) => {
    if (file.size > STUDY_IMPORT_MAX_BYTES) {
      setError("This file is larger than 2 MB. Split it into smaller files.")
      return
    }
    const text = await file.text()
    const inspection = inspectStudyImportFile(text, hasHeader)
    setFileName(file.name)
    setContent(text)
    setColumns(inspection.columns)
    setPromptColumn(inspection.columns[0] ?? "")
    setAnswerColumn(inspection.columns[1] ?? "")
    setDeckTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 120))
    setError(null)
    setStage("map")
  }

  const runPreview = async () => {
    setBusy(true)
    try {
      const result = await previewStudyImport({
        fileName,
        content,
        hasHeader,
        mapping: {
          prompt: promptColumn,
          answer: answerColumn,
          ...(tagsColumn ? { tags: tagsColumn } : {}),
        },
        deckId: deckChoice === NEW_DECK_VALUE ? null : deckChoice,
        deckTitle: deckChoice === NEW_DECK_VALUE ? deckTitle.trim() : "",
        duplicatePolicy: skipDuplicates ? "skip" : "import",
        tagDelimiter: ",",
      })
      setSummary(result.summary)
      setJobId(result.jobId)
      setError(null)
      setStage("preview")
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "This file could not be previewed.")
    } finally {
      setBusy(false)
    }
  }

  const runCommit = async () => {
    if (!jobId) return
    setBusy(true)
    try {
      const result = await commitStudyImport(jobId)
      setImportedNotes(result.importedNotes)
      setError(null)
      setStage("done")
      onImported()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "This import could not be applied.")
    } finally {
      setBusy(false)
    }
  }

  const runRollback = async () => {
    if (!jobId) return
    setBusy(true)
    try {
      const result = await rollbackStudyImport(jobId)
      setImportedNotes(0)
      setError(result.keptReviewedNotes > 0
        ? `Removed ${result.removedNotes} cards. ${result.keptReviewedNotes} were kept because they already have review history.`
        : `Removed ${result.removedNotes} cards.`)
      onImported()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "This import could not be undone.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import flashcards from a file</DialogTitle>
          <DialogDescription>
            CSV and TSV files. Nothing is added until you review the preview and confirm.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="flex items-start gap-2 text-sm text-[var(--text-primary)]" role="alert">
            <IconAlertTriangle aria-hidden className="mt-0.5 shrink-0" />
            {error}
          </p>
        ) : null}

        {stage === "choose" ? (
          <div className="grid gap-3">
            <Label htmlFor="study-import-file">Choose a file</Label>
            <Input
              id="study-import-file"
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void readFile(file)
              }}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="study-import-header"
                checked={hasHeader}
                onCheckedChange={(checked: boolean) => setHasHeader(checked === true)}
              />
              <Label htmlFor="study-import-header">The first row holds column names</Label>
            </div>
          </div>
        ) : null}

        {stage === "map" ? (
          <div className="grid gap-4">
            <p className="text-sm text-[var(--text-tertiary)]">{fileName}</p>

            <div className="grid gap-2">
              <Label htmlFor="study-import-prompt">Question column</Label>
              <Select value={promptColumn} onValueChange={(value: string | null) => setPromptColumn(value ?? "")}>
                <SelectTrigger id="study-import-prompt"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {columns.map((column) => (
                    <SelectItem key={column} value={column}>{column}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="study-import-answer">Answer column</Label>
              <Select value={answerColumn} onValueChange={(value: string | null) => setAnswerColumn(value ?? "")}>
                <SelectTrigger id="study-import-answer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {columns.map((column) => (
                    <SelectItem key={column} value={column}>{column}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="study-import-deck">Add to</Label>
              <Select value={deckChoice} onValueChange={(value: string | null) => setDeckChoice(value ?? NEW_DECK_VALUE)}>
                <SelectTrigger id="study-import-deck"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_DECK_VALUE}>A new set</SelectItem>
                  {decks.map((deck) => (
                    <SelectItem key={deck.id} value={deck.id}>{deck.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {deckChoice === NEW_DECK_VALUE ? (
              <div className="grid gap-2">
                <Label htmlFor="study-import-title">New set name</Label>
                <Input
                  id="study-import-title"
                  maxLength={120}
                  value={deckTitle}
                  onChange={(event) => setDeckTitle(event.target.value)}
                />
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Checkbox
                id="study-import-duplicates"
                checked={skipDuplicates}
                onCheckedChange={(checked: boolean) => setSkipDuplicates(checked === true)}
              />
              <Label htmlFor="study-import-duplicates">Skip rows that match a card you already have</Label>
            </div>
          </div>
        ) : null}

        {stage === "preview" && summary ? (
          <div className="grid gap-3">
            <dl className="grid gap-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt>Rows read</dt>
                <dd className="tabular-nums">{summary.totalRows}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Cards that will be added</dt>
                <dd className="tabular-nums font-medium">{summary.importedRows}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Skipped as duplicates</dt>
                <dd className="tabular-nums">{summary.skippedDuplicates}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Rows with problems</dt>
                <dd className="tabular-nums">{summary.skippedInvalid}</dd>
              </div>
            </dl>

            {summary.sample.length > 0 ? (
              <div className="grid gap-2">
                <h3 className="text-sm font-semibold">First cards</h3>
                <ul className="grid gap-2">
                  {summary.sample.slice(0, 3).map((row, index) => (
                    <li key={index} className="rounded-lg border border-[var(--border-default)] p-3 text-sm">
                      <p className="font-medium">{row.prompt}</p>
                      <p className="text-[var(--text-tertiary)]">{row.answer}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {summary.errors.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadText(
                  "study-import-problems.csv",
                  buildStudyImportErrorReport(summary.errors),
                  "text/csv",
                )}
              >
                Download the rows that were skipped
              </Button>
            ) : null}
          </div>
        ) : null}

        {stage === "done" ? (
          <div className="grid gap-3">
            <p className="text-sm">
              {importedNotes > 0
                ? `Added ${importedNotes} card${importedNotes === 1 ? "" : "s"}.`
                : "This import was undone."}
            </p>
            {importedNotes > 0 ? (
              <Button variant="outline" size="sm" disabled={isBusy} onClick={() => void runRollback()}>
                Undo this import
              </Button>
            ) : null}
          </div>
        ) : null}

        <DialogFooter showCloseButton>
          {stage === "map" ? (
            <Button
              disabled={isBusy || !promptColumn || !answerColumn
                || (deckChoice === NEW_DECK_VALUE && !deckTitle.trim())}
              onClick={() => void runPreview()}
            >
              {isBusy ? <IconLoader2 className="animate-spin" /> : <IconFileImport />}
              Preview import
            </Button>
          ) : null}
          {stage === "preview" ? (
            <Button disabled={isBusy || (summary?.importedRows ?? 0) === 0} onClick={() => void runCommit()}>
              {isBusy ? <IconLoader2 className="animate-spin" /> : <IconFileImport />}
              Add {summary?.importedRows ?? 0} cards
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
