import { useCallback, useMemo, useRef } from "react"

import {
  normalizeDashboardSection,
  normalizeSettingsSection,
  type DashboardSectionId,
  type SettingsSectionId,
} from "../components/dashboard/navigation/dashboardRegistry"
import type { TourNavigationAdapter, TourStep } from "./useTour"

interface TourDashboardAdapterOptions {
  navigateToSection: (section: DashboardSectionId) => void
  navigateToNotifications: () => void
  navigateToSettings: (section: SettingsSectionId) => void
  closeTransientUi?: () => void
  onDisableAiAgent?: () => void
}

function destinationForStep(step: TourStep): string {
  return step.pageId || "home"
}

export function useTourDashboardAdapter({
  navigateToSection,
  navigateToNotifications,
  navigateToSettings,
  closeTransientUi,
  onDisableAiAgent,
}: TourDashboardAdapterOptions): TourNavigationAdapter {
  const closeTransientUiRef = useRef(closeTransientUi)
  const onDisableAiAgentRef = useRef(onDisableAiAgent)
  closeTransientUiRef.current = closeTransientUi
  onDisableAiAgentRef.current = onDisableAiAgent

  const navigateToStep = useCallback(async (step: TourStep) => {
    const destination = destinationForStep(step)
    if (destination !== "home" && destination !== "shell") {
      const homeEditingButton = document.querySelector<HTMLElement>('[data-tour-id="home-customise"]')
      if (homeEditingButton?.dataset.editing === "true") homeEditingButton.click()
    }
    closeTransientUiRef.current?.()
    document.querySelector<HTMLElement>('[data-tour-id="theme-creation-sidebar-close"]')?.click()

    if (destination === "notifications") {
      navigateToNotifications()
    } else if (destination === "settings") {
      navigateToSettings("general")
    } else if (destination.startsWith("settings/")) {
      navigateToSettings(normalizeSettingsSection(destination.slice("settings/".length)))
    } else if (destination !== "shell") {
      navigateToSection(normalizeDashboardSection(destination))
    }

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
    })
  }, [navigateToNotifications, navigateToSection, navigateToSettings])

  const performStepAction = useCallback(async (step: TourStep) => {
    if (!step.action) return
    if (step.action.id === "disable-ai") {
      onDisableAiAgentRef.current?.()
      return
    }

    if (step.action.id === "open-add-item") {
      const customiseButton = document.querySelector<HTMLElement>('[data-tour-id="home-customise"]')
      if (customiseButton?.dataset.editing !== "true") customiseButton?.click()
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
      })
    }

    const selectors: Record<string, string> = {
      "open-search": '[data-tour-id="command-search"]',
      "customise-home": '[data-tour-id="home-customise"]',
      "open-add-item": '[data-tour-id="home-add-item"]',
      "open-animation-curve": '[data-tour-id="animation-curve-trigger"]',
      "build-advanced-theme": '[data-tour-id="theme-build-advanced"]',
    }
    const selector = selectors[step.action.id]
    const element = selector ? document.querySelector<HTMLElement>(selector) : null
    const alreadyActive = step.action.id === "open-search"
      ? Boolean(document.querySelector('[data-tour-id="command-menu"]'))
      : step.action.id === "open-add-item"
        ? Boolean(document.querySelector('[data-tour-id="home-add-item-menu"]'))
        : step.action.id === "customise-home"
      ? element?.dataset.editing === "true"
      : step.action.id === "open-animation-curve" && element?.getAttribute("aria-expanded") === "true"
    if (!alreadyActive) element?.click()
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
    })
  }, [])

  return useMemo(() => ({ navigateToStep, performStepAction }), [navigateToStep, performStepAction])
}
