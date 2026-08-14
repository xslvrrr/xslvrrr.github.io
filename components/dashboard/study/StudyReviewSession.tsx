"use client"

import * as React from "react"
import { IconArrowBackUp, IconChevronLeft, IconEye } from "@tabler/icons-react"

import {
  DashboardPage,
  DashboardPageBody,
  DashboardPageHeader,
} from "@/components/dashboard/DashboardPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import CardFlip from "@/src/components/kokonutui/card-flip"
import type { FlashcardReviewRating } from "@/lib/study"
import type { StudyExperienceMode } from "@/lib/study/domain"
import { matchTypedAnswer, type StudyAnswerMode } from "@/lib/study/note-types"

export interface StudyReviewCardContent {
  id: string
  prompt: string
  answer: string
  explanation?: string
  answerMode?: StudyAnswerMode
  instruction?: string
}

interface StudyReviewSessionProps {
  title: string
  card: StudyReviewCardContent
  currentIndex: number
  totalCards: number
  isRevealed: boolean
  isSaving: boolean
  experienceMode?: StudyExperienceMode
  intervalLabels?: Partial<Record<FlashcardReviewRating, string>>
  canUndo?: boolean
  /** Short, plain-language sync state, e.g. "Saved on this device. 3 reviews waiting to sync." */
  syncNotice?: string
  /** Present for typed cards. Answer checking is feedback only; the learner still picks a rating. */
  typedFields?: Record<string, unknown>
  onReveal: () => void
  onRate: (rating: FlashcardReviewRating) => void
  onUndo?: () => void
  onExit: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
}

export function StudyReviewSession({
  title,
  card,
  currentIndex,
  totalCards,
  isRevealed,
  isSaving,
  experienceMode = "beginner",
  intervalLabels,
  canUndo = false,
  syncNotice,
  typedFields,
  onReveal,
  onRate,
  onUndo,
  onExit,
}: StudyReviewSessionProps) {
  const isBeginner = experienceMode === "beginner"
  const progress = totalCards > 0 ? ((currentIndex + 1) / totalCards) * 100 : 0
  const revealButtonRef = React.useRef<HTMLButtonElement>(null)
  const isTyped = card.answerMode === "typed" && Boolean(typedFields)
  const [typedAnswer, setTypedAnswer] = React.useState("")

  // Flipping back is presentation only. Once revealed the ratings stay available,
  // so re-reading the question never costs the learner their place.
  const [isFlipped, setFlipped] = React.useState(false)

  React.useEffect(() => {
    setTypedAnswer("")
    setFlipped(false)
  }, [card.id])

  const reveal = React.useCallback(() => {
    setFlipped(true)
    if (!isRevealed) onReveal()
  }, [isRevealed, onReveal])

  const typedResult = isRevealed && isTyped && typedFields
    ? matchTypedAnswer(typedAnswer, typedFields)
    : null

  React.useEffect(() => {
    revealButtonRef.current?.focus()
  }, [card.id])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || isSaving) return
      if (event.key === "Escape") {
        event.preventDefault()
        onExit()
        return
      }
      if (!isRevealed && (event.key === " " || event.key === "Enter")) {
        event.preventDefault()
        reveal()
        return
      }
      if (!isRevealed) return

      const rating = isBeginner
        ? ({ "1": "again", "2": "good" } as const)[event.key as "1" | "2"]
        : ({ "1": "again", "2": "hard", "3": "good", "4": "easy" } as const)[event.key as "1" | "2" | "3" | "4"]
      if (rating) {
        event.preventDefault()
        onRate(rating)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isBeginner, isRevealed, isSaving, onExit, onRate, reveal])

  return (
    <DashboardPage>
      <DashboardPageHeader
        title={title}
        description={`Card ${currentIndex + 1} of ${totalCards}`}
        actions={(
          <div className="flex items-center gap-2">
            {canUndo && onUndo ? (
              <Button variant="outline" size="sm" disabled={isSaving} onClick={onUndo}>
                <IconArrowBackUp /> Undo
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={onExit}>
              <IconChevronLeft /> Exit review
            </Button>
          </div>
        )}
      />
      <DashboardPageBody className="mx-auto flex w-full max-w-3xl flex-col justify-center gap-5">
        {syncNotice ? (
          <p className="text-center text-sm text-[var(--text-tertiary)]" role="status" aria-live="polite">
            {syncNotice}
          </p>
        ) : null}

        <Progress value={progress} aria-label={`Review progress: ${currentIndex + 1} of ${totalCards}`}>
          <ProgressLabel>Review progress</ProgressLabel>
          <span className="ml-auto text-sm tabular-nums text-muted-foreground">{currentIndex + 1} / {totalCards}</span>
        </Progress>

        <CardFlip
          isFlipped={isFlipped}
          frontLabel="Question. Select to reveal the answer."
          backLabel="Answer. Select to show the question again."
          onFlip={(next: boolean) => (next ? reveal() : setFlipped(false))}
          front={(
            <div className="grid gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-color)]">
                Question
              </p>
              <p
                className="whitespace-pre-wrap text-xl leading-relaxed text-[var(--text-primary)]"
                id="study-review-question"
              >
                {card.prompt}
              </p>
              {card.instruction ? (
                <p className="text-sm text-[var(--text-tertiary)]">{card.instruction}</p>
              ) : null}
            </div>
          )}
          back={(
            <div className="grid gap-3" aria-live="polite">
              {typedResult ? (
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {typedAnswer.trim()
                    ? (typedResult.isCorrect
                      ? "What you typed matches the answer."
                      : `What you typed does not match. You wrote: ${typedAnswer.trim()}`)
                    : "No answer typed."}
                </p>
              ) : null}
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                Answer
              </p>
              <div className="whitespace-pre-wrap text-lg leading-relaxed text-[var(--text-primary)]">
                {card.answer}
              </div>
              {card.explanation ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-tertiary)]">
                  {card.explanation}
                </p>
              ) : null}
            </div>
          )}
        />

        {!isRevealed ? (
          <div className="grid gap-3">
            {isTyped ? (
              <div className="grid gap-2">
                <Label htmlFor="study-typed-answer">Type your answer</Label>
                <Input
                  id="study-typed-answer"
                  autoComplete="off"
                  value={typedAnswer}
                  onChange={(event) => setTypedAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      reveal()
                    }
                  }}
                />
                <p className="text-xs text-[var(--text-tertiary)]">
                  Typing is optional. You can reveal the answer without filling this in.
                </p>
              </div>
            ) : null}
            <Button ref={revealButtonRef} size="lg" onClick={reveal}>
              <IconEye /> {isTyped ? "Check answer" : "Reveal answer"} <Kbd>Space</Kbd>
            </Button>
          </div>
        ) : null}

        {isRevealed ? (
          <div className="grid gap-2" aria-label="Rate your recall">
            {isBeginner ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="destructive" size="lg" disabled={isSaving} onClick={() => onRate("again")}>
                  Forgot {intervalLabels?.again ? `· ${intervalLabels.again}` : ""} <Kbd>1</Kbd>
                </Button>
                <Button size="lg" disabled={isSaving} onClick={() => onRate("good")}>
                  Remembered {intervalLabels?.good ? `· ${intervalLabels.good}` : ""} <Kbd>2</Kbd>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Button variant="destructive" disabled={isSaving} onClick={() => onRate("again")}>
                  Again {intervalLabels?.again ? `· ${intervalLabels.again}` : ""} <Kbd>1</Kbd>
                </Button>
                <Button variant="outline" disabled={isSaving} onClick={() => onRate("hard")}>
                  Hard {intervalLabels?.hard ? `· ${intervalLabels.hard}` : ""} <Kbd>2</Kbd>
                </Button>
                <Button variant="outline" disabled={isSaving} onClick={() => onRate("good")}>
                  Good {intervalLabels?.good ? `· ${intervalLabels.good}` : ""} <Kbd>3</Kbd>
                </Button>
                <Button disabled={isSaving} onClick={() => onRate("easy")}>
                  Easy {intervalLabels?.easy ? `· ${intervalLabels.easy}` : ""} <Kbd>4</Kbd>
                </Button>
              </div>
            )}
            <p className="text-center text-sm text-[var(--text-tertiary)]">
              Choose Forgot only when retrieval failed. Difficulty alone does not mean failure.
            </p>
          </div>
        ) : (
          <p className="text-center text-sm text-[var(--text-tertiary)]">
            Try to retrieve answer before revealing it. No timer or typed response required.
          </p>
        )}
      </DashboardPageBody>
    </DashboardPage>
  )
}
