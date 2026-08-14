import { useCallback, useEffect, useRef } from "react"

import {
  normalizeDataSettings,
  readDataSettings,
  writeDataSettings,
} from "../../../lib/data-settings.ts"
import type { PortalDataSettings } from "../../../lib/data-settings.ts"
import type { HomeSettings } from "../../../types/home.ts"

const settingsSignature = (settings: PortalDataSettings): string =>
  JSON.stringify(normalizeDataSettings(settings))

/**
 * Keeps the portal sync settings in step between this browser and the account record.
 *
 * They used to live only in unscoped local storage, which sign-out clears, so they never reached a
 * second device and reset themselves after signing back in. Local storage stays the synchronous
 * read path used by the sync scheduler and login; this hook mirrors it to `homeSettings.dataSettings`
 * and hydrates it back from there once preferences have loaded.
 */
export function useSyncedDataSettings(
  savedDataSettings: PortalDataSettings | null | undefined,
  preferencesLoaded: boolean,
  updateHomeSettings: (updates: Partial<HomeSettings>) => void,
) {
  const adoptedLocalRef = useRef(false)

  const publishLocalSettings = useCallback((settings: PortalDataSettings) => {
    updateHomeSettings({ dataSettings: normalizeDataSettings(settings) })
  }, [updateHomeSettings])

  useEffect(() => {
    if (!preferencesLoaded || typeof window === "undefined") return

    const local = readDataSettings()
    if (!savedDataSettings) {
      // Nothing saved for this account yet: adopt what this device is already using, once.
      if (adoptedLocalRef.current) return
      adoptedLocalRef.current = true
      publishLocalSettings(local)
      return
    }

    adoptedLocalRef.current = true
    if (settingsSignature(savedDataSettings) === settingsSignature(local)) return
    // Writing dispatches the change event, so the sync scheduler reschedules against the
    // account's interval rather than this device's stale one.
    writeDataSettings(savedDataSettings)
  }, [preferencesLoaded, publishLocalSettings, savedDataSettings])

  useEffect(() => {
    if (!preferencesLoaded || typeof window === "undefined") return

    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<PortalDataSettings>).detail
      if (!detail) return
      publishLocalSettings(detail)
    }

    window.addEventListener("millennium-data-settings-change", handleChange)
    return () => window.removeEventListener("millennium-data-settings-change", handleChange)
  }, [preferencesLoaded, publishLocalSettings])
}
