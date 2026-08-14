"use client"

import * as React from "react"

export type TourPlacement = "top" | "right" | "bottom" | "left" | "auto"
export type TourEndReason = "completed" | "skipped" | "dismissed"

export interface TourStep {
  id: string
  title: string
  description: React.ReactNode
  target: string | (() => Element | null)
  pageId?: string
  placement?: TourPlacement
  targetPadding?: number
  beforeEnter?: () => void | Promise<void>
  action?: {
    id: string
    label: string
    completedLabel?: string
    /**
     * Runs on entry instead of rendering a button. Use when the step's own target only exists
     * once the action has run, so the guide never asks for a click it is about to perform anyway.
     */
    auto?: boolean
  }
}

export interface TourProgress {
  tourId: string
  status: "in-progress" | "completed" | "dismissed"
  stepId?: string
  updatedAt: string
}

export interface TourPersistenceAdapter {
  load: (tourId: string) => TourProgress | null | Promise<TourProgress | null>
  save: (progress: TourProgress) => void | Promise<void>
}

export interface TourNavigationAdapter {
  getPageId?: () => string | undefined
  navigateToStep?: (step: TourStep) => void | Promise<void>
  performStepAction?: (step: TourStep) => void | Promise<void>
}

export interface TourContextValue {
  activeStep: TourStep | null
  currentStepIndex: number
  isActive: boolean
  isAnnouncementOpen: boolean
  isFirstStep: boolean
  isLastStep: boolean
  steps: readonly TourStep[]
  start: (stepId?: string) => void
  back: () => void
  next: () => void
  skipPage: () => void
  requestSkipTour: () => void
  dismissAnnouncement: () => void
  dismissTour: () => void
}

export const TourContext = React.createContext<TourContextValue | null>(null)

export function useTour(): TourContextValue {
  const context = React.useContext(TourContext)

  if (!context) {
    throw new Error("useTour must be used within a TourProvider")
  }

  return context
}
