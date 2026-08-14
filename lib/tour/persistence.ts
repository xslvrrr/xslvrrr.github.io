import type { TourPreferences, TourProgress, TourProgressStatus, TourStorage } from "./types"
import { TOUR_PREFERENCES_SCHEMA_VERSION } from "./versions"

export const TOUR_PREFERENCES_STORAGE_KEY = "millennium-tour-preferences"

const PROGRESS_STATUSES: readonly TourProgressStatus[] = ["in-progress", "completed", "dismissed"]

export function createEmptyTourPreferences(): TourPreferences {
  return { schemaVersion: TOUR_PREFERENCES_SCHEMA_VERSION, tours: {} }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined
  return new Date(value).toISOString()
}

function normalizeProgress(value: unknown): TourProgress | undefined {
  if (!isRecord(value)) return undefined
  const version = value.version
  const status = value.status
  const updatedAt = normalizeTimestamp(value.updatedAt)
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1 ||
    typeof status !== "string" ||
    !PROGRESS_STATUSES.includes(status as TourProgressStatus) ||
    !updatedAt
  ) {
    return undefined
  }

  const stepId = typeof value.stepId === "string" && value.stepId.length > 0 ? value.stepId : undefined
  const completedAt = normalizeTimestamp(value.completedAt)
  const dismissedAt = normalizeTimestamp(value.dismissedAt)

  return {
    version,
    status: status as TourProgressStatus,
    updatedAt,
    ...(stepId ? { stepId } : {}),
    ...(status === "completed" && completedAt ? { completedAt } : {}),
    ...(status === "dismissed" && dismissedAt ? { dismissedAt } : {}),
  }
}

export function normalizeTourPreferences(value: unknown): TourPreferences {
  if (!isRecord(value) || !isRecord(value.tours)) return createEmptyTourPreferences()

  const tours = Object.fromEntries(
    Object.entries(value.tours).flatMap(([tourId, progress]) => {
      const normalized = normalizeProgress(progress)
      return tourId.length > 0 && normalized ? [[tourId, normalized] as const] : []
    }),
  )

  return { schemaVersion: TOUR_PREFERENCES_SCHEMA_VERSION, tours }
}

function selectNewestProgress(
  first: TourProgress | undefined,
  second: TourProgress | undefined,
): TourProgress | undefined {
  if (!first) return second
  if (!second) return first
  if (first.version !== second.version) return first.version > second.version ? first : second
  return Date.parse(first.updatedAt) >= Date.parse(second.updatedAt) ? first : second
}

export function mergeTourPreferences(...sources: readonly unknown[]): TourPreferences {
  return sources.map(normalizeTourPreferences).reduce<TourPreferences>((merged, source) => {
    const tourIds = new Set([...Object.keys(merged.tours), ...Object.keys(source.tours)])
    const tours = Object.fromEntries(
      [...tourIds].flatMap((tourId) => {
        const progress = selectNewestProgress(merged.tours[tourId], source.tours[tourId])
        return progress ? [[tourId, progress] as const] : []
      }),
    )
    return { schemaVersion: TOUR_PREFERENCES_SCHEMA_VERSION, tours }
  }, createEmptyTourPreferences())
}

export function getTourPreferencesStorageKey(userId: string): string | undefined {
  const normalizedUserId = userId.trim()
  return normalizedUserId
    ? `${TOUR_PREFERENCES_STORAGE_KEY}:${encodeURIComponent(normalizedUserId)}`
    : undefined
}

export function loadTourPreferences(
  storage: TourStorage | null | undefined,
  userId: string,
): TourPreferences {
  const key = getTourPreferencesStorageKey(userId)
  if (!storage || !key) return createEmptyTourPreferences()

  try {
    const stored = storage.getItem(key)
    return stored ? normalizeTourPreferences(JSON.parse(stored) as unknown) : createEmptyTourPreferences()
  } catch {
    return createEmptyTourPreferences()
  }
}

export function saveTourPreferences(
  storage: TourStorage | null | undefined,
  userId: string,
  preferences: TourPreferences,
): boolean {
  const key = getTourPreferencesStorageKey(userId)
  if (!storage || !key) return false

  try {
    storage.setItem(key, JSON.stringify(normalizeTourPreferences(preferences)))
    return true
  } catch {
    return false
  }
}

export interface SavedTourPreferences {
  readonly preferences: TourPreferences
  readonly saved: boolean
}

export function mergeAndSaveTourPreferences(
  storage: TourStorage | null | undefined,
  userId: string,
  remotePreferences: unknown,
): SavedTourPreferences {
  const preferences = mergeTourPreferences(remotePreferences, loadTourPreferences(storage, userId))
  return { preferences, saved: saveTourPreferences(storage, userId, preferences) }
}

export function clearTourPreferences(
  storage: TourStorage | null | undefined,
  userId: string,
): boolean {
  const key = getTourPreferencesStorageKey(userId)
  if (!storage?.removeItem || !key) return false

  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}
