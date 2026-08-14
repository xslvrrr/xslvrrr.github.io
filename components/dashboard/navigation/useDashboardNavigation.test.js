import test from "node:test"
import assert from "node:assert/strict"

import {
  getSettingsHash,
  parseDashboardHash,
} from "./useDashboardNavigation.ts"

test("parseDashboardHash maps notifications to the notifications view", () => {
  assert.deepEqual(parseDashboardHash("#notifications", "home"), {
    currentView: "notifications",
    currentSection: "",
    isInSettings: false,
    settingsSection: "general",
    target: "notifications",
  })
})

test("parseDashboardHash maps settings subroutes and stores the previous canonical hash", () => {
  assert.deepEqual(parseDashboardHash("settings/theme-builder", "home", "dashboard"), {
    currentView: "settings",
    currentSection: "",
    isInSettings: true,
    settingsSection: "theme-builder",
    target: "settings/theme-builder",
    previousHashToStore: "home",
  })
})

test("parseDashboardHash does not overwrite previous hash while already in settings", () => {
  const parsed = parseDashboardHash("settings/shortcuts", "home", "settings/theme-builder")
  assert.equal(parsed.previousHashToStore, undefined)
  assert.equal(parsed.settingsSection, "shortcuts")
})

test("parseDashboardHash falls back to the configured start page for an empty hash", () => {
  assert.deepEqual(parseDashboardHash("", "timetable"), {
    currentView: "dashboard",
    currentSection: "timetable",
    isInSettings: false,
    settingsSection: "general",
    target: "timetable",
  })
})

test("parseDashboardHash supports notifications as the start page", () => {
  const parsed = parseDashboardHash("", "notifications")
  assert.equal(parsed.currentView, "notifications")
  assert.equal(parsed.currentSection, "")
  assert.equal(parsed.target, "notifications")
})

test("parseDashboardHash canonicalizes legacy dashboard and appearance aliases", () => {
  assert.equal(parseDashboardHash("dashboard", "calendar").target, "home")
  assert.deepEqual(parseDashboardHash("settings/appearance", "home"), {
    currentView: "settings",
    currentSection: "",
    isInSettings: true,
    settingsSection: "general",
    target: "settings",
    previousHashToStore: "home",
  })
})

test("parseDashboardHash rejects unknown and malformed hashes", () => {
  assert.equal(parseDashboardHash("grades", "calendar").target, "calendar")
  assert.equal(parseDashboardHash("settings/unknown", "home").target, "settings")
  assert.equal(parseDashboardHash("settingsfoo", "timetable").target, "timetable")
})

test("getSettingsHash emits canonical settings URL semantics", () => {
  assert.equal(getSettingsHash("general"), "settings")
  assert.equal(getSettingsHash("appearance"), "settings")
  assert.equal(getSettingsHash("theme-builder"), "settings/theme-builder")
  assert.equal(getSettingsHash("unknown"), "settings")
})
