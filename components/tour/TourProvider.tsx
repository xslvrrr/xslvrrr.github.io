"use client"

import * as React from "react"

import {
  TourContext,
  type TourContextValue,
  type TourEndReason,
  type TourNavigationAdapter,
  type TourPersistenceAdapter,
  type TourProgress,
  type TourStep,
} from "@/hooks/useTour"
import { TourAnnouncement } from "./TourAnnouncement"
import { TourCoachmark } from "./TourCoachmark"
import { TourSkipDialog } from "./TourSkipDialog"
import { TourSpotlight } from "./TourSpotlight"

interface TourProviderProps {
  children: React.ReactNode
  tourId: string
  steps: readonly TourStep[]
  persistence?: TourPersistenceAdapter
  navigation?: TourNavigationAdapter
  showAnnouncement?: boolean
  autoStart?: boolean
  persistenceReady?: boolean
  announcementTitle?: string
  announcementDescription?: string
  announcementActionLabel?: string
  announcementKind?: "welcome" | "update"
  targetPadding?: number
  onEnd?: (reason: TourEndReason) => void
  onError?: (error: unknown) => void
}

function resolveTarget(target: TourStep["target"]): Element | null {
  try {
    return typeof target === "function" ? target() : document.querySelector(target)
  } catch {
    return null
  }
}

function useTargetRect(step: TourStep | null): DOMRect | null {
  const [rect, setRect] = React.useState<DOMRect | null>(null)

  React.useEffect(() => {
    if (!step) {
      setRect(null)
      return
    }

    let frame = 0
    let element: Element | null = null
    let resizeObserver: ResizeObserver | null = null
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const nextElement = resolveTarget(step.target)
        if (nextElement !== element) {
          resizeObserver?.disconnect()
          element = nextElement
          if (element && typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(measure)
            resizeObserver.observe(element)
          }
        }
        setRect(element?.getBoundingClientRect() ?? null)
      })
    }

    measure()
    const mutationObserver = new MutationObserver(measure)
    mutationObserver.observe(document.body, { childList: true, subtree: true })
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
    }
  }, [step])

  return rect
}

export function TourProvider({
  children,
  tourId,
  steps,
  persistence,
  navigation,
  showAnnouncement = true,
  autoStart = false,
  persistenceReady = true,
  announcementTitle,
  announcementDescription,
  announcementActionLabel,
  announcementKind = "update",
  targetPadding = 8,
  onEnd,
  onError,
}: TourProviderProps): React.ReactElement {
  const [stepIndex, setStepIndex] = React.useState(-1)
  const [isAnnouncementOpen, setIsAnnouncementOpen] = React.useState(showAnnouncement)
  const [isSkipDialogOpen, setIsSkipDialogOpen] = React.useState(false)
  const autoStartedRef = React.useRef(false)
  const endedRef = React.useRef(false)
  const activeStep = stepIndex >= 0 ? steps[stepIndex] ?? null : null
  const targetRect = useTargetRect(activeStep)

  const persist = React.useCallback((progress: TourProgress) => {
    Promise.resolve(persistence?.save(progress)).catch(onError)
  }, [onError, persistence])

  const finish = React.useCallback((reason: TourEndReason) => {
    const status = reason === "completed" ? "completed" : "dismissed"
    setStepIndex(-1)
    setIsSkipDialogOpen(false)
    setIsAnnouncementOpen(false)
    endedRef.current = true
    persist({ tourId, status, updatedAt: new Date().toISOString() })
    onEnd?.(reason)
  }, [onEnd, persist, tourId])

  const goTo = React.useCallback((nextIndex: number) => {
    const step = steps[nextIndex]
    if (!step) {
      finish("completed")
      return
    }

    Promise.resolve(navigation?.navigateToStep?.(step))
      .then(() => step.beforeEnter?.())
      .then(() => step.action?.auto ? navigation?.performStepAction?.(step) : undefined)
      .then(() => {
        setStepIndex(nextIndex)
        persist({ tourId, status: "in-progress", stepId: step.id, updatedAt: new Date().toISOString() })
      })
      .catch(onError)
  }, [finish, navigation, onError, persist, steps, tourId])

  const start = React.useCallback((stepId?: string) => {
    endedRef.current = false
    setIsAnnouncementOpen(false)
    const requestedIndex = stepId ? steps.findIndex((step) => step.id === stepId) : 0
    goTo(requestedIndex >= 0 ? requestedIndex : 0)
  }, [goTo, steps])

  React.useEffect(() => {
    if (!autoStart || autoStartedRef.current) return
    autoStartedRef.current = true
    start()
  }, [autoStart, start])

  React.useEffect(() => {
    if (showAnnouncement && stepIndex < 0 && !endedRef.current) setIsAnnouncementOpen(true)
    if (!showAnnouncement) setIsAnnouncementOpen(false)
  }, [showAnnouncement, stepIndex])

  React.useEffect(() => {
    if (!persistenceReady) return
    let isCurrent = true
    Promise.resolve(persistence?.load(tourId))
      .then((progress) => {
        if (!isCurrent || !progress) return
        if (progress.status === "in-progress") {
          start(progress.stepId)
        } else if (progress.status === "completed" || progress.status === "dismissed") {
          setIsAnnouncementOpen(false)
        }
      })
      .catch(onError)
    return () => { isCurrent = false }
  }, [onError, persistence, persistenceReady, start, tourId])

  React.useEffect(() => {
    if (!activeStep || !targetRect) return
    const element = resolveTarget(activeStep.target)
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    element?.scrollIntoView({ block: "center", inline: "center", behavior: reducedMotion ? "auto" : "smooth" })
  }, [activeStep, targetRect])

  React.useEffect(() => {
    if (!activeStep || targetRect) return
    const timeout = window.setTimeout(() => goTo(stepIndex + 1), 1800)
    return () => window.clearTimeout(timeout)
  }, [activeStep, goTo, stepIndex, targetRect])

  const value = React.useMemo<TourContextValue>(() => ({
    activeStep,
    currentStepIndex: stepIndex,
    isActive: Boolean(activeStep),
    isAnnouncementOpen,
    isFirstStep: stepIndex === 0,
    isLastStep: stepIndex === steps.length - 1,
    steps,
    start,
    back: () => goTo(Math.max(0, stepIndex - 1)),
    next: () => goTo(stepIndex + 1),
    skipPage: () => {
      const currentPageId = activeStep?.pageId ?? navigation?.getPageId?.()
      const nextIndex = steps.findIndex((step, index) => index > stepIndex && step.pageId !== currentPageId)
      if (nextIndex < 0) finish("completed")
      else goTo(nextIndex)
    },
    requestSkipTour: () => setIsSkipDialogOpen(true),
    dismissAnnouncement: () => {
      endedRef.current = true
      setIsAnnouncementOpen(false)
      persist({ tourId, status: "dismissed", updatedAt: new Date().toISOString() })
      onEnd?.("dismissed")
    },
    dismissTour: () => finish("dismissed"),
  }), [activeStep, finish, goTo, isAnnouncementOpen, navigation, start, stepIndex, steps])

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourAnnouncement
        isOpen={isAnnouncementOpen}
        title={announcementTitle}
        description={announcementDescription}
        actionLabel={announcementActionLabel}
        kind={announcementKind}
        onStart={() => start()}
        onDismiss={value.dismissAnnouncement}
      />
      {activeStep && (
        <>
          <TourSpotlight targetRect={targetRect} padding={activeStep.targetPadding ?? targetPadding} />
          <TourCoachmark
            step={activeStep}
            stepIndex={stepIndex}
            stepCount={steps.length}
            targetRect={targetRect}
            isFirstStep={value.isFirstStep}
            isLastStep={value.isLastStep}
            onBack={value.back}
            onNext={value.next}
            onSkipPage={value.skipPage}
            onSkipTour={value.requestSkipTour}
            onAction={() => Promise.resolve(navigation?.performStepAction?.(activeStep))}
          />
        </>
      )}
      <TourSkipDialog
        isOpen={isSkipDialogOpen}
        onOpenChange={setIsSkipDialogOpen}
        onConfirm={() => finish("skipped")}
      />
    </TourContext.Provider>
  )
}
