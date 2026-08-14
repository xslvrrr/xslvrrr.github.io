import type {
  TourDefinition,
  TourMachineEvent,
  TourMachineState,
  TourPreferences,
  TourProgress,
} from "./types"
import { TOUR_PREFERENCES_SCHEMA_VERSION } from "./versions"

export const initialTourMachineState: TourMachineState = {
  status: "idle",
  tourId: null,
  tourVersion: null,
  stepIndex: 0,
}

function isActiveTour(state: TourMachineState, tour: TourDefinition): boolean {
  return state.status === "in-progress" && state.tourId === tour.id && state.tourVersion === tour.version
}

function findStepIndex(tour: TourDefinition, stepId?: string): number | undefined {
  if (!stepId) return undefined
  const index = tour.steps.findIndex((step) => step.id === stepId)
  return index < 0 ? undefined : index
}

export function tourMachineReducer(
  state: TourMachineState,
  event: TourMachineEvent,
): TourMachineState {
  switch (event.type) {
    case "START":
      if (event.tour.steps.length === 0) return initialTourMachineState
      return {
        status: "in-progress",
        tourId: event.tour.id,
        tourVersion: event.tour.version,
        stepIndex: findStepIndex(event.tour, event.stepId) ?? 0,
      }
    case "NEXT": {
      if (!isActiveTour(state, event.tour)) return state
      const nextIndex = state.stepIndex + 1
      if (nextIndex >= event.tour.steps.length) return { ...state, status: "completed" }
      return { ...state, stepIndex: nextIndex }
    }
    case "PREVIOUS":
      return isActiveTour(state, event.tour)
        ? { ...state, stepIndex: Math.max(0, state.stepIndex - 1) }
        : state
    case "GO_TO": {
      if (!isActiveTour(state, event.tour)) return state
      const stepIndex = findStepIndex(event.tour, event.stepId)
      return stepIndex === undefined ? state : { ...state, stepIndex }
    }
    case "COMPLETE":
      return state.status === "in-progress" ? { ...state, status: "completed" } : state
    case "DISMISS":
      return state.status === "in-progress" ? { ...state, status: "dismissed" } : state
    case "RESET":
      return initialTourMachineState
  }
}

export function getActiveTourStep(
  state: TourMachineState,
  tour: TourDefinition,
): TourDefinition["steps"][number] | undefined {
  if (!isActiveTour(state, tour)) return undefined
  return tour.steps[state.stepIndex]
}

export function tourProgressFromState(
  state: TourMachineState,
  tour: TourDefinition,
  updatedAt: string,
): TourProgress | undefined {
  if (state.tourId !== tour.id || state.tourVersion !== tour.version || state.status === "idle") {
    return undefined
  }

  const stepId = tour.steps[state.stepIndex]?.id
  if (state.status === "completed") {
    return { version: tour.version, status: "completed", stepId, updatedAt, completedAt: updatedAt }
  }
  if (state.status === "dismissed") {
    return { version: tour.version, status: "dismissed", stepId, updatedAt, dismissedAt: updatedAt }
  }
  return { version: tour.version, status: "in-progress", stepId, updatedAt }
}

export function applyTourProgress(
  preferences: TourPreferences,
  tourId: string,
  progress: TourProgress,
): TourPreferences {
  return {
    schemaVersion: TOUR_PREFERENCES_SCHEMA_VERSION,
    tours: { ...preferences.tours, [tourId]: progress },
  }
}

export function shouldOfferTour(
  tour: TourDefinition,
  preferences: TourPreferences,
): boolean {
  const progress = preferences.tours[tour.id]
  return !progress || progress.version < tour.version
}
