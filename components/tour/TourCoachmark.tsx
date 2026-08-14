"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { IconArrowLeft, IconArrowRight, IconCheck, IconPlayerPlay, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { TourPlacement, TourStep } from "@/hooks/useTour"
import styles from "./Tour.module.css"

interface Position {
  left: number
  top: number
}

interface Size {
  width: number
  height: number
}

interface TourCoachmarkProps {
  step: TourStep
  stepIndex: number
  stepCount: number
  targetRect: DOMRect | null
  isFirstStep: boolean
  isLastStep: boolean
  onBack: () => void
  onNext: () => void
  onSkipPage: () => void
  onSkipTour: () => void
  onAction: () => Promise<void>
}

const VIEWPORT_GAP = 12
const TARGET_GAP = 16
const COACHMARK_WIDTH = 380
const DEFAULT_SIZE: Size = { width: COACHMARK_WIDTH, height: 280 }

function getPosition(rect: DOMRect | null, placement: TourPlacement, size: Size): Position {
  if (!rect) {
    return { left: Math.max(VIEWPORT_GAP, window.innerWidth - size.width - VIEWPORT_GAP), top: VIEWPORT_GAP }
  }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const positions: Record<Exclude<TourPlacement, "auto">, Position> = {
    top: { left: rect.left + rect.width / 2 - size.width / 2, top: rect.top - size.height - TARGET_GAP },
    right: { left: rect.right + TARGET_GAP, top: rect.top + rect.height / 2 - size.height / 2 },
    bottom: { left: rect.left + rect.width / 2 - size.width / 2, top: rect.bottom + TARGET_GAP },
    left: { left: rect.left - size.width - TARGET_GAP, top: rect.top + rect.height / 2 - size.height / 2 },
  }
  const sides: Array<Exclude<TourPlacement, "auto">> = placement === "auto"
    ? ["bottom", "top", "right", "left"]
    : [placement, ...(["bottom", "top", "right", "left"] as const).filter((side) => side !== placement)]
  const score = (position: Position) => {
    const overflow = Math.max(0, VIEWPORT_GAP - position.left)
      + Math.max(0, position.left + size.width + VIEWPORT_GAP - viewportWidth)
      + Math.max(0, VIEWPORT_GAP - position.top)
      + Math.max(0, position.top + size.height + VIEWPORT_GAP - viewportHeight)
    const overlapWidth = Math.max(0, Math.min(position.left + size.width, rect.right) - Math.max(position.left, rect.left))
    const overlapHeight = Math.max(0, Math.min(position.top + size.height, rect.bottom) - Math.max(position.top, rect.top))
    return overflow * 10_000 + overlapWidth * overlapHeight
  }
  const position = sides.map((side) => positions[side]).sort((a, b) => score(a) - score(b))[0]

  return {
    left: Math.max(VIEWPORT_GAP, Math.min(position.left, viewportWidth - size.width - VIEWPORT_GAP)),
    top: Math.max(VIEWPORT_GAP, Math.min(position.top, viewportHeight - size.height - VIEWPORT_GAP)),
  }
}

export function TourCoachmark({
  step,
  stepIndex,
  stepCount,
  targetRect,
  isFirstStep,
  isLastStep,
  onBack,
  onNext,
  onSkipPage,
  onSkipTour,
  onAction,
}: TourCoachmarkProps): React.ReactPortal | null {
  const headingId = React.useId()
  const descriptionId = React.useId()
  const cardRef = React.useRef<HTMLDivElement>(null)
  const [size, setSize] = React.useState<Size>(DEFAULT_SIZE)
  const [actionState, setActionState] = React.useState<"idle" | "working" | "done">("idle")

  React.useEffect(() => {
    setActionState("idle")
  }, [step.id])

  React.useEffect(() => {
    const card = cardRef.current
    if (!card || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width, height: entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height })
    })
    observer.observe(card)
    return () => observer.disconnect()
  }, [step.id])

  if (typeof document === "undefined") return null

  const position = getPosition(targetRect, step.placement ?? "auto", size)

  return createPortal(
    <Card
      ref={cardRef}
      className={styles.coachmark}
      style={{ left: position.left, top: position.top }}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          onSkipTour()
        }
      }}
    >
      <CardHeader className={styles.coachmarkHeader}>
        <div className={styles.coachmarkMeta}>
          <span aria-label={`Step ${stepIndex + 1} of ${stepCount}`}>Guide · {stepIndex + 1} of {stepCount}</span>
          <Button size="icon-xs" variant="ghost" onClick={onSkipTour} aria-label="Close tour"><IconX /></Button>
        </div>
        <CardTitle id={headingId} className={styles.coachmarkTitle}>{step.title}</CardTitle>
        <CardDescription id={descriptionId}>{step.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={styles.progressTrack} aria-hidden="true">
          <div
            className={styles.progressValue}
            style={{ width: `${((stepIndex + 1) / stepCount) * 100}%` }}
          />
        </div>
        {step.action && !step.action.auto && (
          <Button
            variant="secondary"
            className="mt-4 w-full justify-start"
            disabled={actionState !== "idle"}
            onClick={() => {
              setActionState("working")
              onAction().then(() => setActionState("done")).catch(() => setActionState("idle"))
            }}
          >
            {actionState === "done" ? <IconCheck /> : <IconPlayerPlay />}
            {actionState === "done" ? step.action.completedLabel ?? "Done" : step.action.label}
          </Button>
        )}
      </CardContent>
      <CardFooter className={styles.coachmarkFooter}>
        <Button size="sm" variant="ghost" onClick={onSkipPage}>Skip page</Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={onBack} disabled={isFirstStep}><IconArrowLeft />Back</Button>
          <Button size="sm" onClick={onNext}>{isLastStep ? <IconCheck /> : null}{isLastStep ? "Finish" : "Next"}{!isLastStep ? <IconArrowRight /> : null}</Button>
        </div>
      </CardFooter>
    </Card>,
    document.body
  )
}
