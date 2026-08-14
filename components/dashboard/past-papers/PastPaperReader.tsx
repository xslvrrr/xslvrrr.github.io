import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence } from "motion/react"
import {
  IconAlertTriangle, IconArrowLeft, IconClockOff, IconClockPlay,
  IconLayoutBottombarCollapse, IconLayoutBottombarExpand,
} from "@tabler/icons-react"

import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExamTimerToolbar } from "@/components/pdf/ExamTimerToolbar"
import { PdfDocumentView } from "@/components/pdf/PdfDocumentView"
import type { DocumentAnnotation } from "@/lib/pdf/annotations"
import { isAnswerBearing, type PastPaper } from "@/lib/past-papers/domain"
import type { PastPaperPreferences } from "@/lib/past-papers/preferences"
import {
  clampDuration, createExamTimer, readTimer, startTimer, totalSeconds, type ExamTimerState,
} from "@/lib/past-papers/timer"

interface PastPaperReaderProps {
  paper: PastPaper
  preferences: PastPaperPreferences
  onBack: () => void
  onAttemptFinished?: (paper: PastPaper) => void
}

/**
 * Reading a paper.
 *
 * The viewer itself is shared with reports; what this adds is the exam layer — a timer whose
 * length comes from the paper, and the rules that make a timed attempt mean something. Chief among
 * those: while the clock runs, the answers stay shut and the text stops being selectable. A
 * practice exam you can copy out of or read the marking guidelines during is not a practice exam.
 */
export function PastPaperReader({ paper, preferences, onBack, onAttemptFinished }: PastPaperReaderProps) {
  const [annotations, setAnnotations] = useState<DocumentAnnotation[]>([])
  const [timerVisible, setTimerVisible] = useState(preferences.timerEnabled)
  const [toolbarHidden, setToolbarHidden] = useState(preferences.hideToolbarByDefault)
  const [timer, setTimer] = useState<ExamTimerState>(
    () => createExamTimer(workingSeconds(paper), readingSeconds(paper, preferences))
  )
  const [attemptId, setAttemptId] = useState<string | null>(null)
  /** Set once an attempt has been written up, so the debrief is offered exactly once. */
  const [debrief, setDebrief] = useState<AttemptDebrief | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Set once the student moves the dial themselves, so the detected length stops overriding it. */
  const durationTouched = useRef(false)
  /** One write-up per attempt: the clock running out and the student leaving must not both count. */
  const finishedRef = useRef(false)

  useEffect(() => setToolbarHidden(preferences.hideToolbarByDefault), [preferences.hideToolbarByDefault])

  const running = timer.status === "running"
  const answersLocked = preferences.hideAnswersDuringAttempt && running && isAnswerBearing(paper.documentKind)

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/past-papers/annotations?paperId=${encodeURIComponent(paper.id)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { data?: { annotations?: unknown } } | null) => {
        if (cancelled) return
        const stored = payload?.data?.annotations
        setAnnotations(Array.isArray(stored) ? (stored as DocumentAnnotation[]) : [])
      })
      .catch(() => {
        // The paper is still worth reading without its marks.
      })
    return () => { cancelled = true }
  }, [paper.id])

  const handleAnnotations = useCallback((next: DocumentAnnotation[]) => {
    setAnnotations(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void fetch("/api/past-papers/annotations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId: paper.id, annotations: next }),
      })
    }, 500)
  }, [paper.id])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  /**
   * Records the attempt server-side when the clock starts.
   *
   * The row is what makes an attempt count towards the paper's cohort difficulty and towards the
   * student's own history, and it has to be created at the start rather than the end — an attempt
   * abandoned halfway is exactly the signal that a paper is too hard, and one only written on
   * completion would silently discard it.
   */
  const handleTimerChange = useCallback((next: ExamTimerState) => {
    const wasIdle = timer.status === "idle"
    if (next.durationSeconds !== timer.durationSeconds || next.readingSeconds !== timer.readingSeconds) {
      durationTouched.current = true
    }
    setTimer(next)

    if (wasIdle && next.status === "running" && attemptId === null) {
      void fetch("/api/past-papers/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Reading time is part of how long the student sat there, so it is part of the attempt.
        body: JSON.stringify({ paperId: paper.id, durationSeconds: clampDuration(totalSeconds(next)) }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { data?: { attempt?: { id?: string } } } | null) => {
          if (payload?.data?.attempt?.id) setAttemptId(payload.data.attempt.id)
        })
        .catch(() => {
          // The clock still runs; only the record is lost, and the student is not interrupted.
        })
    }
  }, [attemptId, paper.id, timer.durationSeconds, timer.readingSeconds, timer.status])

  /**
   * Writes an attempt up.
   *
   * Called both when the clock runs out and when the student leaves mid-paper — an abandoned
   * attempt is a real result, and the one the cohort difficulty most wants to hear about. The
   * debrief that follows is what turns `promptForRating` and `offerFlashcardsAfterAttempt` into
   * something a student sees; without it the paper simply closed and nothing was ever asked.
   */
  const finishAttempt = useCallback((state: ExamTimerState, completed: boolean) => {
    if (!attemptId || finishedRef.current) return false
    finishedRef.current = true

    const reading = readTimer(state, Date.now())
    void fetch("/api/past-papers/attempts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId, elapsedSeconds: reading.elapsedSeconds, completed }),
    }).catch(() => undefined)

    onAttemptFinished?.(paper)

    const wanted = preferences.promptForRating || preferences.offerFlashcardsAfterAttempt
    if (!wanted) return false
    setDebrief({ attemptId, elapsedSeconds: reading.elapsedSeconds, completed })
    return true
  }, [
    attemptId, onAttemptFinished, paper,
    preferences.offerFlashcardsAfterAttempt, preferences.promptForRating,
  ])

  const handleFinished = useCallback((finished: ExamTimerState) => {
    finishAttempt(finished, true)
  }, [finishAttempt])

  /**
   * Leaving with a clock still on the paper.
   *
   * The attempt is closed as incomplete rather than left open forever, and the debrief is shown
   * before the listing comes back — asked after the paper has already closed, "how hard was it?"
   * arrives with nothing on screen to answer it about.
   */
  const handleBack = useCallback(() => {
    if (timer.status === "idle" || !attemptId) {
      onBack()
      return
    }
    if (!finishAttempt(timer, false)) onBack()
  }, [attemptId, finishAttempt, onBack, timer])

  /**
   * Keeps an unstarted clock on the paper's own length.
   *
   * The timer is created on first render, and at that moment the student's settings have not come
   * back from the server yet — so a reader whose reading-time preference is on used to see the
   * default length until they touched the dial. Re-seeding while the timer is still idle and
   * untouched means the clock always opens on the detected time.
   */
  const detectedWorking = workingSeconds(paper)
  const detectedReading = readingSeconds(paper, preferences)
  useEffect(() => {
    if (durationTouched.current) return
    setTimer((current) => {
      if (current.status !== "idle") return current
      if (current.durationSeconds === detectedWorking && current.readingSeconds === detectedReading) return current
      return createExamTimer(detectedWorking, detectedReading)
    })
  }, [detectedReading, detectedWorking])

  // Starting automatically is opt-in. Defaulting to it would start a clock on a student who only
  // meant to glance at the paper, and a spurious abandoned attempt is cohort evidence that a paper
  // is harder than it is.
  useEffect(() => {
    if (preferences.autoStartTimer && timer.status === "idle") {
      setTimer((current) => startTimer(current, Date.now()))
    }
    // Runs once per paper; re-running on every timer change would restart a paused clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.id])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={handleBack}>
          <IconArrowLeft className="size-4" /> Back
        </Button>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{paper.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {[paper.subject, paper.school, paper.year].filter(Boolean).join(" · ")}
          </span>
        </div>

        {paper.totalMarks ? <Badge variant="outline">{paper.totalMarks} marks</Badge> : null}

        {/* The two things a reader hides sit together, as one pair of plain buttons. Splitting them
            between a header control and an item inside the zoom group meant the toolbar could only
            be dismissed from a bar that was itself about to disappear. */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            aria-pressed={timerVisible}
            onClick={() => setTimerVisible((visible) => !visible)}
          >
            {timerVisible ? <IconClockOff className="size-4" /> : <IconClockPlay className="size-4" />}
            {timerVisible ? "Hide timer" : "Show timer"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            aria-pressed={!toolbarHidden}
            onClick={() => setToolbarHidden((hidden) => !hidden)}
          >
            {toolbarHidden
              ? <IconLayoutBottombarExpand className="size-4" />
              : <IconLayoutBottombarCollapse className="size-4" />}
            {toolbarHidden ? "Show tools" : "Hide tools"}
          </Button>
        </div>
      </div>

      {answersLocked ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <IconAlertTriangle className="size-4 shrink-0 text-amber-500" />
          <span className="min-w-0">
            This document contains answers and the timer is running. Pause the timer to open it, or
            turn this off in past papers settings.
          </span>
        </div>
      ) : (
        <PdfDocumentView
          documentId={paper.id}
          url={`/api/past-papers/pdf?id=${encodeURIComponent(paper.id)}`}
          annotations={annotations}
          onAnnotationsChange={handleAnnotations}
          annotationsEnabled={preferences.annotationsEnabled}
          initialScale={preferences.defaultZoom}
          toolbarsHidden={toolbarHidden}
          onToolbarsHiddenChange={setToolbarHidden}
          // Locked while the clock runs so a paper cannot be copied out mid-attempt.
          textSelectable={!(preferences.lockSelectionDuringAttempt && running)}
          emptyMessage="Save this paper to read it here."
          slotAboveToolbar={
            <AnimatePresence initial={false}>
              {timerVisible ? (
                <ExamTimerToolbar
                  key="timer"
                  state={timer}
                  onStateChange={handleTimerChange}
                  durationSource={paper.durationSource}
                  suggestedReadingMinutes={paper.readingMinutes ?? 0}
                  volume={preferences.timerAlerts ? preferences.timerVolume : 0}
                  rollingDigits={preferences.rollingDigits}
                  showProgress={preferences.showTimerProgress}
                  onFinished={handleFinished}
                />
              ) : null}
            </AnimatePresence>
          }
        />
      )}

      {debrief ? (
        <AttemptDebriefDialog
          paper={paper}
          debrief={debrief}
          askForRating={preferences.promptForRating}
          offerFlashcards={preferences.offerFlashcardsAfterAttempt}
          onClose={() => {
            setDebrief(null)
            onBack()
          }}
        />
      ) : null}
    </div>
  )
}

interface AttemptDebrief {
  attemptId: string
  elapsedSeconds: number
  completed: boolean
}

/**
 * What happens once the paper is over.
 *
 * The rating is the whole reason the cohort difficulty signal exists — a band nobody rated is a
 * band built from structure alone — so it is asked here, while the paper is still fresh, rather
 * than being buried in an attempt history nobody opens. Both halves are preferences, and with both
 * turned off this dialog never renders at all.
 */
function AttemptDebriefDialog({
  paper,
  debrief,
  askForRating,
  offerFlashcards,
  onClose,
}: {
  paper: PastPaper
  debrief: AttemptDebrief
  askForRating: boolean
  offerFlashcards: boolean
  onClose: () => void
}) {
  const [rating, setRating] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const submitRating = useCallback(async (value: number) => {
    setRating(value)
    setBusy(true)
    try {
      const response = await fetch("/api/past-papers/attempts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: debrief.attemptId,
          elapsedSeconds: debrief.elapsedSeconds,
          completed: debrief.completed,
          selfRating: value,
        }),
      })
      if (!response.ok) throw new Error("Could not save that rating")
      toast.success("Thanks — that rating feeds this paper's difficulty")
    } catch {
      setRating(null)
      toast.error("That rating could not be saved.")
    } finally {
      setBusy(false)
    }
  }, [debrief])

  /**
   * Starts a flashcard set for the paper and hands the student over to it.
   *
   * An empty set rather than generated cards: nothing here has read the paper, and inventing
   * questions from a title would produce cards a student has to unlearn.
   */
  const makeFlashcards = useCallback(async () => {
    setBusy(true)
    try {
      const response = await fetch("/api/study/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckId: crypto.randomUUID(),
          title: paper.title.slice(0, 120),
          description: [paper.subject, paper.school, paper.year].filter(Boolean).join(" · ").slice(0, 500),
        }),
      })
      if (!response.ok) throw new Error("Could not create that set")
      onClose()
      window.location.hash = "#flashcards"
    } catch {
      toast.error("That flashcard set could not be created.")
    } finally {
      setBusy(false)
    }
  }, [onClose, paper])

  return (
    <AlertDialog open onOpenChange={(next: boolean) => { if (!next && !busy) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{debrief.completed ? "Time" : "Attempt saved"}</AlertDialogTitle>
          <AlertDialogDescription>
            {formatElapsed(debrief.elapsedSeconds)} on {paper.title}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {askForRating ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">How hard was it?</span>
            <div className="flex items-center gap-1.5">
              {RATING_LABELS.map((label, index) => {
                const value = index + 1
                return (
                  <Button
                    key={label}
                    type="button"
                    size="sm"
                    variant={rating === value ? "default" : "outline"}
                    disabled={busy}
                    aria-pressed={rating === value}
                    onClick={() => void submitRating(value)}
                  >
                    {label}
                  </Button>
                )
              })}
            </div>
            <span className="text-xs text-muted-foreground">
              Ratings are pooled across everyone who sat this paper; yours is never shown on its own.
            </span>
          </div>
        ) : null}

        <AlertDialogFooter>
          {offerFlashcards ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void makeFlashcards()}>
              Make flashcards
            </Button>
          ) : null}
          <AlertDialogAction type="button" disabled={busy} onClick={onClose}>Done</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** 1-5, in the words a student would use rather than as bare numbers. */
const RATING_LABELS = ["Easy", "Fair", "Solid", "Hard", "Brutal"] as const

function formatElapsed(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

/**
 * Where the timer starts.
 *
 * The paper's own stated working time wherever it has one — which, for NSW papers, is nearly
 * always. Falls back to three hours, the standard HSC allowance, when the paper says nothing.
 */
function workingSeconds(paper: PastPaper): number {
  return (paper.durationMinutes ?? 180) * 60
}

/**
 * Reading time is a phase, not padding.
 *
 * It runs before the working clock rather than being added to it, because nothing may be written
 * during it — folding the two together would train a student to start writing at minute zero.
 * Pre-filled only when the student asked for it; the setup strip offers it either way.
 */
function readingSeconds(paper: PastPaper, preferences: PastPaperPreferences): number {
  return preferences.includeReadingTime ? (paper.readingMinutes ?? 0) * 60 : 0
}
