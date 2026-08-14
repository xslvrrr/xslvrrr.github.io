import { useCallback, useEffect, useRef, useState } from "react"

import type { HomeSettings } from "../../../types/home.ts"
import {
  normalizeDashboardSection,
  normalizeSettingsSection,
  resolveDashboardSection,
  type DashboardSectionId,
  type SettingsSectionId,
} from "./dashboardRegistry.ts"

export type DashboardViewId = "dashboard" | "notifications" | "settings"

export type DashboardNavigationState = {
  currentSection: DashboardSectionId | ""
  currentView: DashboardViewId
  isInSettings: boolean
  settingsSection: SettingsSectionId
  target: string
  previousHashToStore?: string
}

const normalizeHash = (hash: string) => hash.replace(/^#/, "").trim().toLowerCase()

const isSettingsHash = (hash: string) => hash === "settings" || hash.startsWith("settings/")

function normalizePreviousDashboardTarget(
  value: string | null | undefined,
  fallback: DashboardSectionId = "home"
): DashboardSectionId {
  if (!value) return fallback
  const hash = normalizeHash(value)
  if (!hash || isSettingsHash(hash)) return fallback
  return resolveDashboardSection(hash) ?? fallback
}

export function getSettingsHash(section = "general") {
  const normalized = normalizeSettingsSection(section)
  return normalized === "general" ? "settings" : `settings/${normalized}`
}

export function parseDashboardHash(
  hashValue: string,
  startPage: HomeSettings["startPage"],
  lastHash: string = startPage
): DashboardNavigationState {
  const hash = normalizeHash(hashValue)
  const fallbackSection = normalizeDashboardSection(startPage)

  if (isSettingsHash(hash)) {
    const rawSection = hash === "settings" ? "general" : hash.slice("settings/".length).split("/")[0]
    const section = normalizeSettingsSection(rawSection)
    const target = getSettingsHash(section)
    return {
      currentView: "settings",
      currentSection: "",
      isInSettings: true,
      settingsSection: section,
      target,
      previousHashToStore: isSettingsHash(normalizeHash(lastHash))
        ? undefined
        : normalizePreviousDashboardTarget(lastHash, fallbackSection),
    }
  }

  const section = normalizeDashboardSection(hash, fallbackSection)
  if (section === "notifications") {
    return {
      currentView: "notifications",
      currentSection: "",
      isInSettings: false,
      settingsSection: "general",
      target: "notifications",
    }
  }

  return {
    currentView: "dashboard",
    currentSection: section,
    isInSettings: false,
    settingsSection: "general",
    target: section,
  }
}

export function useDashboardNavigation({
  startPage,
  loggedIn,
  preferencesLoaded,
}: {
  startPage: HomeSettings["startPage"]
  loggedIn: boolean
  preferencesLoaded: boolean
}) {
  const initial = parseDashboardHash(
    typeof window === "undefined" ? "" : window.location.hash,
    startPage
  )
  const [currentSection, setCurrentSection] = useState<DashboardSectionId | "">(initial.currentSection)
  const [currentView, setCurrentView] = useState<DashboardViewId>(initial.currentView)
  const [isInSettings, setIsInSettings] = useState(initial.isInSettings)
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>(initial.settingsSection)
  const lastHashRef = useRef(initial.target)

  useEffect(() => {
    const handleHashChange = () => {
      const rawHashValue = window.location.hash.replace(/^#/, "").trim()
      const rawHash = normalizeHash(rawHashValue)
      const next = parseDashboardHash(rawHash, startPage, lastHashRef.current)
      setCurrentView(next.currentView)
      setCurrentSection(next.currentSection)
      setIsInSettings(next.isInSettings)
      setSettingsSection(next.settingsSection)

      const hasFixedCanonicalMeaning = isSettingsHash(rawHash) || resolveDashboardSection(rawHash) !== null
      const canCanonicalize = preferencesLoaded || hasFixedCanonicalMeaning
      if (rawHashValue && rawHashValue !== next.target && canCanonicalize) {
        const canonicalUrl = `${window.location.pathname}${window.location.search}#${next.target}`
        window.history.replaceState(window.history.state, "", canonicalUrl)
      }

      if (next.previousHashToStore) {
        sessionStorage.setItem("previousHash", next.previousHashToStore)
      }

      lastHashRef.current = next.target
    }

    handleHashChange()
    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [preferencesLoaded, startPage])

  useEffect(() => {
    if (!loggedIn || !preferencesLoaded) return
    if (!window.location.hash) {
      window.location.hash = startPage
    }
  }, [loggedIn, preferencesLoaded, startPage])

  const navigate = useCallback((target: string) => {
    if (normalizeHash(window.location.hash) === target) return
    window.location.hash = target
  }, [])

  const replace = useCallback((target: string) => {
    if (normalizeHash(window.location.hash) === target) return
    window.location.replace(`#${target}`)
  }, [])

  const navigateToSection = useCallback((section: DashboardSectionId) => {
    navigate(section)
  }, [navigate])

  const replaceWithSection = useCallback((section: DashboardSectionId) => {
    replace(section)
  }, [replace])

  const navigateToSettings = useCallback((section: SettingsSectionId = "general") => {
    navigate(getSettingsHash(section))
  }, [navigate])

  const replaceWithSettings = useCallback((section: SettingsSectionId = "general") => {
    replace(getSettingsHash(section))
  }, [replace])

  const navigateToNotifications = useCallback(() => {
    navigate("notifications")
  }, [navigate])

  const closeSettings = useCallback(() => {
    const fallback = normalizeDashboardSection(startPage)
    navigate(normalizePreviousDashboardTarget(sessionStorage.getItem("previousHash"), fallback))
  }, [navigate, startPage])

  return {
    currentSection,
    currentView,
    isInSettings,
    settingsSection,
    navigateToSection,
    replaceWithSection,
    navigateToSettings,
    replaceWithSettings,
    navigateToNotifications,
    closeSettings,
  }
}
