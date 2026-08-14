import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { defaultHomeSettings, HOME_SETTINGS_KEY } from "../../../types/home.ts"
import type { HomeSettings } from "../../../types/home.ts"
import {
  defaultHomeLayout,
  HIDDEN_HOME_ITEMS,
  HOME_LAYOUT_KEY,
  normalizeHomeLayout,
} from "../home/homeLayout.ts"
import type { HomeLayout } from "../home/homeLayout.ts"
import type { NotificationFolder } from "../notifications/types.ts"
import type { AttendanceDisplaySettings } from "../../../types/portal.ts"
import { normalizeDataSettings } from "../../../lib/data-settings.ts"
import { normalizeNotificationRules } from "../../../lib/notification-rules.ts"
import { clampListWidth, clampSidebarWidth } from "../notifications/notificationLayout.ts"
import { scopedBrowserStorageKey } from "../../../lib/storage-scope.ts"
import {
  readDesktopBootstrapCache,
  updateDesktopBootstrapCache,
} from "../../../lib/desktop/storage.ts"
import { isDesktopApp } from "../../../lib/desktop/utils.ts"
import { isDashboardPreview } from "../../../lib/dashboard-preview.ts"

export const FOLDER_STORAGE_KEY = "millennium-notification-folders"
export const NOTIFICATION_RELATIVE_DATES_KEY = "millennium-notification-relative-dates"

export interface DashboardPreferences {
  homeSettings: HomeSettings
  homeLayout: HomeLayout
  notificationFolders: NotificationFolder[]
  relativeNotificationDates: boolean
  attendanceSettings: AttendanceDisplaySettings
}

export interface DashboardPreferencesStore {
  load: () => Promise<DashboardPreferences>
  save: (next: DashboardPreferences) => Promise<void>
}

type StorageLike = Pick<Storage, "getItem" | "setItem">

type StoreDeps = {
  fetch?: typeof fetch
  storage?: StorageLike | null
  loadCache?: () => Promise<unknown>
  saveCache?: (next: DashboardPreferences) => Promise<void>
}

const defaultDashboardPreferences = (): DashboardPreferences => ({
  homeSettings: defaultHomeSettings,
  homeLayout: normalizeHomeLayout(defaultHomeLayout, HIDDEN_HOME_ITEMS),
  notificationFolders: [],
  relativeNotificationDates: false,
  attendanceSettings: { perfectEffectEnabled: true, fillingEnabled: true },
})

/**
 * Fixed preferences for the marketing preview frames. The landing page must look the same for
 * every visitor, so previews never read saved preferences and always render the simple Home.
 */
const previewDashboardPreferences = (): DashboardPreferences => {
  const base = defaultDashboardPreferences()
  return {
    ...base,
    homeSettings: {
      ...base.homeSettings,
      homeCardStyle: "minimal",
      columns: 2,
      mobileColumns: 1,
      showAiAgent: true,
      homeWiggleEnabled: false,
      studyReviewNotifications: false,
      usePointerCursors: true,
    },
  }
}

const getBrowserStorage = (): StorageLike | null => {
  if (typeof window === "undefined") return null
  return window.localStorage
}

function getAccountStorage(userId?: string): StorageLike | null {
  const storage = getBrowserStorage()
  if (!storage || !userId) return null
  return {
    getItem(key) {
      const scopedKey = scopedBrowserStorageKey(key, userId)
      return scopedKey ? storage.getItem(scopedKey) : null
    },
    setItem(key, value) {
      const scopedKey = scopedBrowserStorageKey(key, userId)
      if (scopedKey) storage.setItem(scopedKey, value)
    },
  }
}

const getBrowserFetch = (): typeof fetch | undefined => {
  if (typeof fetch === "undefined") return undefined
  return fetch
}


const parseJson = (value: string | null): unknown => {
  if (!value) return undefined
  return JSON.parse(value)
}

export function normalizeHomeSettings(raw: unknown): HomeSettings {
  const source = raw && typeof raw === "object" ? raw : {}
  const merged = { ...defaultHomeSettings, ...source } as HomeSettings & { dateFormat?: string }
  const legacyDateFormat = String(merged.dateFormat || defaultHomeSettings.dateFormat).toUpperCase()
  const dateFormat = legacyDateFormat === "DMY" || legacyDateFormat === "MDY" || legacyDateFormat === "YMD"
    ? legacyDateFormat
    : defaultHomeSettings.dateFormat
  const notificationAutoArchiveAfter = ["1w", "1m", "3m", "6m", "12m", "never"].includes(merged.notificationAutoArchiveAfter)
    ? merged.notificationAutoArchiveAfter
    : defaultHomeSettings.notificationAutoArchiveAfter

  return {
    ...merged,
    notificationRules: normalizeNotificationRules(merged.notificationRules),
    notificationSidebarOrder: Array.isArray(merged.notificationSidebarOrder)
      ? merged.notificationSidebarOrder.filter((id): id is string => typeof id === "string")
      : defaultHomeSettings.notificationSidebarOrder,
    notificationSidebarVisibility: Object.fromEntries(
      Object.entries(merged.notificationSidebarVisibility || {})
        .map(([key, value]) => [key, String(value).toLowerCase() === "hide" ? "hide" : "show"])
    ) as HomeSettings["notificationSidebarVisibility"],
    notificationSidebarWidth: clampSidebarWidth(merged.notificationSidebarWidth),
    notificationListWidth: clampListWidth(merged.notificationListWidth),
    dateFormat,
    startPage: ["home", "calendar", "timetable", "notifications"].includes(merged.startPage)
      ? merged.startPage
      : defaultHomeSettings.startPage,
    mobileColumns: merged.mobileColumns === 1 || merged.mobileColumns === 2
      ? merged.mobileColumns
      : defaultHomeSettings.mobileColumns,
    columns: merged.columns === 1 || merged.columns === 2
      ? merged.columns
      : defaultHomeSettings.columns,
    homeCardStyle: ["minimal", "stylised"].includes(merged.homeCardStyle)
      ? merged.homeCardStyle
      : defaultHomeSettings.homeCardStyle,
    sidebarItemVisibility: Object.fromEntries(
      Object.entries({
        ...defaultHomeSettings.sidebarItemVisibility,
        ...(merged.sidebarItemVisibility || {}),
      }).map(([key, value]) => {
        const normalized = String(value).toLowerCase()
        return [key, normalized === "hidden" || normalized === "hide" ? "hide" : "show"]
      })
    ) as HomeSettings["sidebarItemVisibility"],
    sidebarItemOrder: Array.isArray(merged.sidebarItemOrder) && merged.sidebarItemOrder.length > 0
      ? merged.sidebarItemOrder
      : defaultHomeSettings.sidebarItemOrder,
    notificationsUnreadSection: merged.notificationsUnreadSection !== false,
    notificationAutoArchiveAfter,
    calendarShowClasses: merged.calendarShowClasses === true,
    calendarHiddenCalendarIds: Array.isArray(merged.calendarHiddenCalendarIds)
      ? [...new Set(merged.calendarHiddenCalendarIds.filter((value): value is string => typeof value === "string" && value.length > 0))]
      : defaultHomeSettings.calendarHiddenCalendarIds,
    calendarShowTimelineSeconds: merged.calendarShowTimelineSeconds === true,
    calendarSmartCleanerEnabled: merged.calendarSmartCleanerEnabled !== false,
    calendarShowGoogleValidationBanner: merged.calendarShowGoogleValidationBanner !== false,
    timetableMergeConsecutivePeriods: merged.timetableMergeConsecutivePeriods !== false,
    timetableShowBothWeeks: merged.timetableShowBothWeeks === true,
    assistantSummarizeThinking: merged.assistantSummarizeThinking !== false,
    assistantTone: ["friendly", "pragmatic", "simple", "formal"].includes(merged.assistantTone)
      ? merged.assistantTone
      : defaultHomeSettings.assistantTone,
    showAiAgent: merged.showAiAgent !== false,
    studyReviewNotifications: merged.studyReviewNotifications !== false,
    unenrolledClassKeys: Array.isArray(merged.unenrolledClassKeys)
      ? [...new Set(merged.unenrolledClassKeys.filter((value): value is string => typeof value === "string" && value.length > 0))]
      : defaultHomeSettings.unenrolledClassKeys,
    classColors: merged.classColors && typeof merged.classColors === "object"
      ? merged.classColors
      : defaultHomeSettings.classColors,
    dataSettings: merged.dataSettings && typeof merged.dataSettings === "object"
      ? normalizeDataSettings(merged.dataSettings)
      : null,
  }
}

export function hasMeaningfulHomeLayout(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const layout = value as Partial<HomeLayout>
  // Layouts saved by removed Home versions still count as meaningful: `normalizeHomeLayout`
  // migrates their card order, so treating them as empty here would silently reset the user.
  const legacy = value as { pegboard?: unknown; pegboardCards?: unknown; columns?: unknown }
  return (
    (Array.isArray(layout.items) && layout.items.length > 0) ||
    (Array.isArray(layout.canvasElements) && layout.canvasElements.length > 0) ||
    (Array.isArray(layout.quickAccessSlots) && layout.quickAccessSlots.length > 0) ||
    (Array.isArray(legacy.pegboard) && legacy.pegboard.length > 0) ||
    (Array.isArray(legacy.pegboardCards) && legacy.pegboardCards.length > 0) ||
    Boolean(legacy.columns && typeof legacy.columns === "object") ||
    typeof layout.note === "string"
  )
}

export function loadDashboardPreferencesFromStorage(storage: StorageLike | null = getBrowserStorage()): DashboardPreferences {
  const next = defaultDashboardPreferences()
  if (!storage) return next

  try {
    const savedHomeSettings = parseJson(storage.getItem(HOME_SETTINGS_KEY))
    if (savedHomeSettings) {
      next.homeSettings = normalizeHomeSettings(savedHomeSettings)
    }
  } catch {
    next.homeSettings = defaultHomeSettings
  }

  try {
    const savedHomeLayout = parseJson(storage.getItem(HOME_LAYOUT_KEY))
    if (hasMeaningfulHomeLayout(savedHomeLayout)) {
      next.homeLayout = normalizeHomeLayout(savedHomeLayout, HIDDEN_HOME_ITEMS)
    }
  } catch {
    next.homeLayout = normalizeHomeLayout(defaultHomeLayout, HIDDEN_HOME_ITEMS)
  }

  try {
    const savedFolders = parseJson(storage.getItem(FOLDER_STORAGE_KEY))
    if (Array.isArray(savedFolders)) {
      next.notificationFolders = savedFolders.filter((folder): folder is NotificationFolder => (
        Boolean(folder) &&
        typeof folder === "object" &&
        typeof (folder as NotificationFolder).id === "string" &&
        typeof (folder as NotificationFolder).title === "string" &&
        typeof (folder as NotificationFolder).icon === "string"
      ))
    }
  } catch {
    next.notificationFolders = []
  }

  try {
    next.relativeNotificationDates = storage.getItem(NOTIFICATION_RELATIVE_DATES_KEY) === "true"
  } catch {
    next.relativeNotificationDates = false
  }

  return next
}

export function saveDashboardPreferencesToStorage(
  next: DashboardPreferences,
  storage: StorageLike | null = getBrowserStorage()
) {
  if (!storage) return
  storage.setItem(HOME_SETTINGS_KEY, JSON.stringify(next.homeSettings))
  storage.setItem(HOME_LAYOUT_KEY, JSON.stringify(next.homeLayout))
  storage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(next.notificationFolders))
  storage.setItem(NOTIFICATION_RELATIVE_DATES_KEY, next.relativeNotificationDates ? "true" : "false")
}

export function mergeHomeSettingsFromStorage(
  current: HomeSettings,
  storage: StorageLike | null = getBrowserStorage()
): HomeSettings {
  if (!storage) return current

  try {
    const saved = parseJson(storage.getItem(HOME_SETTINGS_KEY))
    return saved
      ? normalizeHomeSettings({ ...current, ...(saved as object) })
      : current
  } catch {
    return current
  }
}

export function mergeDashboardPreferences(
  fallback: DashboardPreferences,
  payload: unknown
): DashboardPreferences {
  if (!payload || typeof payload !== "object") return fallback
  const data = payload as Partial<{
    homeSettings: unknown
    homeLayout: unknown
    notificationFolders: unknown
    attendanceSettings: unknown
  }>

  return {
    homeSettings: data.homeSettings && typeof data.homeSettings === "object"
      ? normalizeHomeSettings({
        ...fallback.homeSettings,
        ...data.homeSettings as Partial<HomeSettings>,
      })
      : fallback.homeSettings,
    homeLayout: hasMeaningfulHomeLayout(data.homeLayout)
      ? normalizeHomeLayout(data.homeLayout, HIDDEN_HOME_ITEMS)
      : fallback.homeLayout,
    notificationFolders: Array.isArray(data.notificationFolders)
      ? data.notificationFolders.filter((folder): folder is NotificationFolder => (
        Boolean(folder) &&
        typeof folder === "object" &&
        typeof (folder as NotificationFolder).id === "string" &&
        typeof (folder as NotificationFolder).title === "string" &&
        typeof (folder as NotificationFolder).icon === "string"
      ))
      : fallback.notificationFolders,
    relativeNotificationDates: fallback.relativeNotificationDates,
    attendanceSettings: data.attendanceSettings && typeof data.attendanceSettings === "object"
      ? { ...fallback.attendanceSettings, ...(data.attendanceSettings as Partial<AttendanceDisplaySettings>) }
      : fallback.attendanceSettings,
  }
}

export function createDashboardPreferencesStore(deps: StoreDeps = {}): DashboardPreferencesStore {
  const request = deps.fetch ?? getBrowserFetch()
  const storage = deps.storage === undefined ? getBrowserStorage() : deps.storage
  let saveFlight: Promise<void> | null = null

  const persist = async (next: DashboardPreferences) => {
    await deps.saveCache?.(next).catch(() => undefined)
    if (!request) return
    try {
      const response = await request("/api/user/preferences", {
        method: "PUT",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeSettings: next.homeSettings,
          homeLayout: next.homeLayout,
          notificationFolders: next.notificationFolders,
          attendanceSettings: next.attendanceSettings,
        }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    } catch {
      // Encrypted desktop cache or scoped browser storage remains authoritative offline.
    }
  }

  return {
    async load() {
      let fallback = loadDashboardPreferencesFromStorage(storage)
      if (deps.loadCache) {
        try {
          fallback = mergeDashboardPreferences(fallback, await deps.loadCache())
        } catch {
          // Scoped browser storage remains available when encrypted cache cannot be read.
        }
      }
      if (!request) return fallback

      try {
        // `no-store` keeps a revalidated or heuristically cached response from replaying
        // preferences the user already changed on this or another device.
        const response = await request("/api/user/preferences", {
          cache: "no-store",
          credentials: "same-origin",
        })
        if (!response.ok) return fallback
        return mergeDashboardPreferences(fallback, await response.json())
      } catch {
        return fallback
      }
    },
    async save(next) {
      saveDashboardPreferencesToStorage(next, storage)
      const previousSave = saveFlight
      const currentSave = (previousSave || Promise.resolve())
        .catch(() => undefined)
        .then(() => persist(next))
      saveFlight = currentSave
      await currentSave
      if (saveFlight === currentSave) saveFlight = null
    },
  }
}

type PreferenceSlice = keyof DashboardPreferences

/**
 * Edits made while a preferences load is still in flight. The server response used to be applied
 * verbatim when it arrived, so a class colour, hidden class, or any other preference changed during
 * that window was silently reverted and never saved. Recording the edits lets the resolved load
 * rebuild the slice as "server value, then whatever the user changed since the request started".
 */
type PreferenceEditBuffer = {
  homeSettings: Partial<HomeSettings>
  slices: Set<PreferenceSlice>
}

const createEditBuffer = (): PreferenceEditBuffer => ({
  homeSettings: {},
  slices: new Set(),
})

export function useDashboardPreferences(userId?: string) {
  const preview = isDashboardPreview()
  const accountStorage = useMemo(() => getAccountStorage(userId), [userId])
  const store = useMemo(
    () => createDashboardPreferencesStore({
      storage: accountStorage,
      ...(isDesktopApp() && userId ? {
        loadCache: async () => (await readDesktopBootstrapCache(userId))?.preferences,
        saveCache: async (next: DashboardPreferences) => updateDesktopBootstrapCache({
          preferences: {
            homeSettings: next.homeSettings,
            homeLayout: next.homeLayout,
            notificationFolders: next.notificationFolders,
            attendanceSettings: next.attendanceSettings,
          },
        }),
      } : {}),
    }),
    [accountStorage, userId]
  )
  const initialPreferences = useMemo(
    () => preview ? previewDashboardPreferences() : defaultDashboardPreferences(),
    [preview]
  )
  const [homeSettings, setHomeSettingsState] = useState(initialPreferences.homeSettings)
  const [homeLayout, setHomeLayoutState] = useState(initialPreferences.homeLayout)
  const [notificationFolders, setNotificationFoldersState] = useState(initialPreferences.notificationFolders)
  const [relativeNotificationDates, setRelativeNotificationDatesState] = useState(initialPreferences.relativeNotificationDates)
  const [attendanceSettings, setAttendanceSettingsState] = useState(initialPreferences.attendanceSettings)
  const [loaded, setLoaded] = useState(false)
  const loadGenerationRef = useRef(0)
  const editsRef = useRef<PreferenceEditBuffer>(createEditBuffer())

  const recordSliceEdit = useCallback((slice: PreferenceSlice) => {
    editsRef.current.slices.add(slice)
  }, [])

  const setHomeSettings = useCallback<typeof setHomeSettingsState>((value) => {
    recordSliceEdit("homeSettings")
    setHomeSettingsState(value)
  }, [recordSliceEdit])

  const setHomeLayout = useCallback<typeof setHomeLayoutState>((value) => {
    recordSliceEdit("homeLayout")
    setHomeLayoutState(value)
  }, [recordSliceEdit])

  const setNotificationFolders = useCallback<typeof setNotificationFoldersState>((value) => {
    recordSliceEdit("notificationFolders")
    setNotificationFoldersState(value)
  }, [recordSliceEdit])

  const setRelativeNotificationDates = useCallback<typeof setRelativeNotificationDatesState>((value) => {
    recordSliceEdit("relativeNotificationDates")
    setRelativeNotificationDatesState(value)
  }, [recordSliceEdit])

  const setAttendanceSettings = useCallback<typeof setAttendanceSettingsState>((value) => {
    recordSliceEdit("attendanceSettings")
    setAttendanceSettingsState(value)
  }, [recordSliceEdit])

  const updateHomeSettings = useCallback((updates: Partial<HomeSettings>) => {
    editsRef.current.homeSettings = { ...editsRef.current.homeSettings, ...updates }
    setHomeSettingsState((prev) => ({ ...prev, ...updates }))
  }, [])

  useEffect(() => {
    if (preview) {
      setLoaded(true)
      return
    }
    if (!userId) {
      const defaults = defaultDashboardPreferences()
      setLoaded(false)
      editsRef.current = createEditBuffer()
      setHomeSettingsState(defaults.homeSettings)
      setHomeLayoutState(defaults.homeLayout)
      setNotificationFoldersState(defaults.notificationFolders)
      setRelativeNotificationDatesState(defaults.relativeNotificationDates)
      setAttendanceSettingsState(defaults.attendanceSettings)
      return
    }

    let cancelled = false
    setLoaded(false)

    const load = async () => {
      // Edits are collected per load attempt, so a reload triggered while the user is changing
      // settings (assistant actions apply one) keeps their newer values instead of the server copy.
      loadGenerationRef.current += 1
      const generation = loadGenerationRef.current
      editsRef.current = createEditBuffer()

      const next = await store.load()
      if (cancelled || loadGenerationRef.current !== generation) return

      const edits = editsRef.current
      const homeSettingsEdits = edits.homeSettings
      if (!edits.slices.has("homeSettings")) {
        setHomeSettingsState(Object.keys(homeSettingsEdits).length > 0
          ? { ...next.homeSettings, ...homeSettingsEdits }
          : next.homeSettings)
      }
      if (!edits.slices.has("homeLayout")) setHomeLayoutState(next.homeLayout)
      if (!edits.slices.has("notificationFolders")) setNotificationFoldersState(next.notificationFolders)
      if (!edits.slices.has("relativeNotificationDates")) {
        setRelativeNotificationDatesState(next.relativeNotificationDates)
      }
      if (!edits.slices.has("attendanceSettings")) setAttendanceSettingsState(next.attendanceSettings)

      setLoaded(true)
    }

    window.addEventListener("assistant-actions-applied", load)
    load()

    return () => {
      cancelled = true
      window.removeEventListener("assistant-actions-applied", load)
    }
  }, [preview, store, userId])

  useEffect(() => {
    if (preview) return

    const syncHomeSettings = () => {
      setHomeSettings((prev) => mergeHomeSettingsFromStorage(prev, accountStorage))
    }

    window.addEventListener("home-settings-updated", syncHomeSettings)
    return () => window.removeEventListener("home-settings-updated", syncHomeSettings)
  }, [accountStorage, preview, setHomeSettings])

  // `loaded` is a dependency, not just a ref read: mid-load edits leave every slice already equal to
  // the value the load would have applied, so without it the effect would never re-run and those
  // edits would sit unsaved until the next unrelated preference change.
  useEffect(() => {
    if (preview) return
    if (!loaded) return
    const timeoutId = window.setTimeout(() => {
      store.save({
        homeSettings,
        homeLayout,
        notificationFolders,
        relativeNotificationDates,
        attendanceSettings,
      })
    }, 650)

    return () => window.clearTimeout(timeoutId)
  }, [attendanceSettings, homeLayout, homeSettings, loaded, notificationFolders, preview, relativeNotificationDates, store])

  return {
    homeSettings,
    setHomeSettings,
    updateHomeSettings,
    homeLayout,
    setHomeLayout,
    notificationFolders,
    setNotificationFolders,
    relativeNotificationDates,
    setRelativeNotificationDates,
    attendanceSettings,
    setAttendanceSettings,
    loaded,
  }
}
