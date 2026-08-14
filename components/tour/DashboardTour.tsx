"use client"

import * as React from "react"

import { TourProvider } from "./TourProvider"
import type { TourNavigationAdapter, TourPersistenceAdapter, TourProgress } from "../../hooks/useTour"
import {
  FULL_DASHBOARD_TOUR_ID,
  REPLAY_FULL_TOUR_EVENT,
  REPLAY_UPDATE_TOUR_EVENT,
  TOUR_RELEASE_CUTOFF,
  UPDATE_DASHBOARD_TOUR_ID,
  fullDashboardTour,
  updateDashboardTour,
} from "../../lib/tour/dashboardRegistry"
import {
  createEmptyTourPreferences,
  loadTourPreferences,
  mergeTourPreferences,
  normalizeTourPreferences,
  saveTourPreferences,
} from "../../lib/tour/persistence"
import type { TourPreferences } from "../../lib/tour/types"

interface DashboardTourProps {
  children: React.ReactNode
  userId: string
  accountCreatedAt?: string | null
  navigation: TourNavigationAdapter
  /** Set false for embedded marketing previews, which must never show tour UI. */
  enabled?: boolean
}

interface SelectedTour {
  readonly id: string
  readonly steps: readonly import("../../hooks/useTour").TourStep[]
  readonly title: string
  readonly description: string
  readonly actionLabel: string
}

const WELCOME_TOUR: Omit<SelectedTour, "steps"> = {
  id: FULL_DASHBOARD_TOUR_ID,
  title: "Welcome to Millennium",
  description: "Take the full guided tour of your dashboard, from Home through Settings.",
  actionLabel: "Start the tour",
}

const UPDATE_TOUR: Omit<SelectedTour, "steps"> = {
  id: UPDATE_DASHBOARD_TOUR_ID,
  title: "Millennium updated",
  description: "See what changed in this release, then continue into the full tour if you want it.",
  actionLabel: "See what's new",
}

/**
 * An account created after the release cutoff has never seen any Millennium dashboard, so it gets
 * the welcome + full tour. Accounts predating the cutoff (or with an unknown creation date, which
 * only happens for pre-existing records) get the shorter update tour.
 */
function chooseTour(accountCreatedAt?: string | null): SelectedTour {
  const createdAt = accountCreatedAt ? Date.parse(accountCreatedAt) : Number.NaN
  const isFirstTimeUser = Number.isFinite(createdAt) && createdAt >= Date.parse(TOUR_RELEASE_CUTOFF)
  return isFirstTimeUser
    ? { ...WELCOME_TOUR, steps: fullDashboardTour }
    : { ...UPDATE_TOUR, steps: updateDashboardTour }
}

export function DashboardTour({ children, userId, accountCreatedAt, navigation, enabled = true }: DashboardTourProps) {
  const defaultTour = React.useMemo(() => chooseTour(accountCreatedAt), [accountCreatedAt])
  const [selectedTour, setSelectedTour] = React.useState(defaultTour)
  const [tourInstance, setTourInstance] = React.useState(0)
  const [autoStart, setAutoStart] = React.useState(false)
  const preferencesRef = React.useRef<TourPreferences>(createEmptyTourPreferences())
  const [preferences, setPreferences] = React.useState<TourPreferences>(() => createEmptyTourPreferences())
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const local = loadTourPreferences(window.localStorage, userId)

    fetch("/api/user/preferences", { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (cancelled) return
        const merged = mergeTourPreferences(payload?.tourPreferences, local)
        preferencesRef.current = merged
        setPreferences(merged)
        saveTourPreferences(window.localStorage, userId, merged)
      })
      .catch(() => {
        if (!cancelled) {
          preferencesRef.current = local
          setPreferences(local)
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })

    return () => { cancelled = true }
  }, [enabled, userId])

  React.useEffect(() => {
    if (!enabled) return
    const replay = async (tour: Omit<SelectedTour, "steps">, steps: readonly import("../../hooks/useTour").TourStep[]) => {
      await navigation.navigateToStep?.({ id: "replay-home", pageId: "home", title: "Home", description: "", target: '[data-tour-id="page-home"]' })
      setSelectedTour({ ...tour, steps, description: "Replaying guide from Settings." })
      setAutoStart(true)
      setTourInstance((current) => current + 1)
    }
    const replayFull = () => { void replay(WELCOME_TOUR, fullDashboardTour) }
    const replayUpdate = () => { void replay(UPDATE_TOUR, updateDashboardTour) }
    window.addEventListener(REPLAY_FULL_TOUR_EVENT, replayFull)
    window.addEventListener(REPLAY_UPDATE_TOUR_EVENT, replayUpdate)
    return () => {
      window.removeEventListener(REPLAY_FULL_TOUR_EVENT, replayFull)
      window.removeEventListener(REPLAY_UPDATE_TOUR_EVENT, replayUpdate)
    }
  }, [enabled, navigation])

  const persistence = React.useMemo<TourPersistenceAdapter>(() => ({
    load: (tourId) => {
      const progress = preferencesRef.current.tours[tourId]
      if (!progress) return null
      return {
        tourId,
        status: progress.status,
        stepId: progress.stepId,
        updatedAt: progress.updatedAt,
      }
    },
    save: async (progress: TourProgress) => {
      const currentPreferences = preferencesRef.current
      const next = normalizeTourPreferences({
        schemaVersion: currentPreferences.schemaVersion,
        tours: {
          ...currentPreferences.tours,
          [progress.tourId]: {
            version: 1,
            status: progress.status,
            stepId: progress.stepId,
            updatedAt: progress.updatedAt,
            ...(progress.status === "completed" ? { completedAt: progress.updatedAt } : {}),
            ...(progress.status === "dismissed" ? { dismissedAt: progress.updatedAt } : {}),
          },
        },
      })
      preferencesRef.current = next
      setPreferences(next)
      saveTourPreferences(window.localStorage, userId, next)
      const response = await fetch("/api/user/preferences", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tourPreferences: next }),
      })
      if (!response.ok) throw new Error("Failed to save guided-tour progress")
    },
  }), [userId])

  if (!enabled) return <>{children}</>

  return (
    <TourProvider
      key={`${selectedTour.id}-${tourInstance}`}
      tourId={selectedTour.id}
      steps={selectedTour.steps}
      persistence={persistence}
      navigation={navigation}
      autoStart={autoStart}
      persistenceReady={loaded}
      showAnnouncement={loaded && !preferences.tours[selectedTour.id]}
      announcementTitle={selectedTour.title}
      announcementDescription={selectedTour.description}
      announcementActionLabel={selectedTour.actionLabel}
      announcementKind={selectedTour.id === FULL_DASHBOARD_TOUR_ID ? "welcome" : "update"}
    >
      {children}
    </TourProvider>
  )
}
