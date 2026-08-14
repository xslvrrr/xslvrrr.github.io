import test from "node:test"
import assert from "node:assert/strict"

import {
  FOLDER_STORAGE_KEY,
  NOTIFICATION_RELATIVE_DATES_KEY,
  createDashboardPreferencesStore,
  loadDashboardPreferencesFromStorage,
  mergeDashboardPreferences,
  mergeHomeSettingsFromStorage,
  normalizeHomeSettings,
  saveDashboardPreferencesToStorage,
} from "./dashboardPreferences.ts"
import { HOME_SETTINGS_KEY } from "../../../types/home.ts"
import { HOME_LAYOUT_KEY, defaultHomeLayout } from "../home/homeLayout.ts"

function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed))
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
    values,
  }
}

test("normalizeHomeSettings repairs invalid persisted values", () => {
  const settings = normalizeHomeSettings({
    dateFormat: "bad",
    startPage: "reports",
    columns: 5,
    sidebarItemVisibility: {
      home: "hidden",
      calendar: "show",
    },
  })

  assert.equal(settings.dateFormat, "DMY")
  assert.equal(settings.startPage, "home")
  assert.equal(settings.columns, 2)
  assert.equal(settings.disableFutureNotifications, false)
  assert.equal(settings.calendarShowTimelineSeconds, false)
  assert.equal(settings.calendarSmartCleanerEnabled, true)
  assert.equal(settings.calendarShowGoogleValidationBanner, true)
  assert.equal(settings.sidebarItemVisibility.home, "hide")
  assert.equal(settings.sidebarItemVisibility.calendar, "show")
})

test("loadDashboardPreferencesFromStorage tolerates corrupt localStorage", () => {
  const storage = createStorage({
    [HOME_SETTINGS_KEY]: "{bad",
    [HOME_LAYOUT_KEY]: "{bad",
    [FOLDER_STORAGE_KEY]: "{bad",
    [NOTIFICATION_RELATIVE_DATES_KEY]: "true",
  })

  const prefs = loadDashboardPreferencesFromStorage(storage)
  assert.equal(prefs.homeSettings.startPage, "home")
  assert.equal(prefs.homeLayout.note, defaultHomeLayout.note)
  assert.deepEqual(prefs.notificationFolders, [])
  assert.equal(prefs.relativeNotificationDates, true)
})

test("mergeDashboardPreferences overlays valid API fields on the local fallback", () => {
  const fallback = loadDashboardPreferencesFromStorage(createStorage({
    [NOTIFICATION_RELATIVE_DATES_KEY]: "true",
  }))

  const prefs = mergeDashboardPreferences(fallback, {
    homeSettings: { startPage: "calendar", columns: 1 },
    homeLayout: { note: "Saved note" },
    notificationFolders: [
      { id: "folder-1", title: "Assessments", icon: "IconFolder" },
      { id: 1, title: "Bad", icon: "IconFolder" },
    ],
  })

  assert.equal(prefs.homeSettings.startPage, "calendar")
  assert.equal(prefs.homeSettings.columns, 1)
  assert.equal(prefs.homeLayout.note, "Saved note")
  assert.equal(prefs.notificationFolders.length, 1)
  assert.equal(prefs.relativeNotificationDates, true)
})

test("createDashboardPreferencesStore uses API preferences without local values", async () => {
  const storage = createStorage({
    [HOME_SETTINGS_KEY]: JSON.stringify({ startPage: "timetable" }),
    [NOTIFICATION_RELATIVE_DATES_KEY]: "true",
  })
  const store = createDashboardPreferencesStore({
    storage,
    fetch: async () => ({
      ok: true,
      json: async () => ({
        homeSettings: { startPage: "notifications" },
        notificationFolders: [{ id: "folder-1", title: "Inbox", icon: "IconFolder" }],
      }),
    }),
  })

  const prefs = await store.load()
  assert.equal(prefs.homeSettings.startPage, "notifications")
  assert.equal(prefs.notificationFolders[0].title, "Inbox")
  assert.equal(prefs.relativeNotificationDates, false)
})

test("createDashboardPreferencesStore loads local preferences when API fails", async () => {
  const storage = createStorage({
    [HOME_SETTINGS_KEY]: JSON.stringify({ startPage: "timetable" }),
    [NOTIFICATION_RELATIVE_DATES_KEY]: "true",
  })
  const store = createDashboardPreferencesStore({
    storage,
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
  })

  const prefs = await store.load()
  assert.equal(prefs.homeSettings.startPage, "timetable")
  assert.equal(prefs.relativeNotificationDates, true)
})

test("createDashboardPreferencesStore saves to local storage when API fails", async () => {
  const storage = createStorage()
  const store = createDashboardPreferencesStore({
    storage,
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
  })
  const prefs = loadDashboardPreferencesFromStorage(null)
  prefs.homeSettings = { ...prefs.homeSettings, startPage: "calendar", disableFutureNotifications: true }
  prefs.notificationFolders = [{ id: "folder-1", title: "Saved", icon: "IconFolder" }]
  prefs.relativeNotificationDates = true

  await store.save(prefs)

  assert.equal(JSON.parse(storage.getItem(HOME_SETTINGS_KEY)).startPage, "calendar")
  assert.equal(JSON.parse(storage.getItem(HOME_SETTINGS_KEY)).disableFutureNotifications, true)
  assert.equal(JSON.parse(storage.getItem(FOLDER_STORAGE_KEY))[0].title, "Saved")
  assert.equal(storage.getItem(NOTIFICATION_RELATIVE_DATES_KEY), "true")
})

test("mergeHomeSettingsFromStorage refreshes dashboard-only preference changes", () => {
  const current = normalizeHomeSettings({})
  const storage = createStorage({
    [HOME_SETTINGS_KEY]: JSON.stringify({
      calendarShowTimelineSeconds: true,
      calendarSmartCleanerEnabled: false,
      calendarShowGoogleValidationBanner: false,
    }),
  })

  const settings = mergeHomeSettingsFromStorage(current, storage)

  assert.equal(settings.calendarShowTimelineSeconds, true)
  assert.equal(settings.calendarSmartCleanerEnabled, false)
  assert.equal(settings.calendarShowGoogleValidationBanner, false)
})

test("saveDashboardPreferencesToStorage is a no-op without storage", () => {
  const prefs = loadDashboardPreferencesFromStorage(null)
  assert.doesNotThrow(() => saveDashboardPreferencesToStorage(prefs, null))
})
