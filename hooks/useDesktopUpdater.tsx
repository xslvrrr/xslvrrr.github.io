"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import { loadManualDesktopUpdate } from "@/lib/desktop/release"
import { isDesktopApp, openExternal } from "@/lib/desktop/utils"

export type DesktopUpdateStatus =
  | "idle"
  | "checking"
  /** A signed update is published and ready to download. */
  | "available"
  | "downloading"
  /** The signed package is on disk and only needs installing. */
  | "ready"
  | "installing"
  /** Only the install page lists a newer build, so the user finishes in a browser. */
  | "manual"
  | "error"

export type DesktopUpdateChannel = "signed" | "manual"

export interface DesktopUpdateState {
  status: DesktopUpdateStatus
  channel: DesktopUpdateChannel | null
  version: string | null
  /** Whole percent of the download, or null while the total size is unknown. */
  progress: number | null
  downloadedBytes: number
  totalBytes: number | null
  downloadUrl: string | null
  error: string | null
}

interface DesktopUpdaterContextValue {
  desktop: boolean
  state: DesktopUpdateState
  /** Checks the signed feed, then the install page. */
  checkNow: () => Promise<void>
  /** Downloads a signed update, or opens the install-page package in a browser. */
  startUpdate: () => Promise<void>
  /** Installs a downloaded package and relaunches. */
  installUpdate: () => Promise<void>
  /** Returns the button to idle until the next scheduled check. */
  dismiss: () => void
}

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000
const ACTIVE_RECHECK_INTERVAL_MS = 5 * 60 * 1000
const CHECK_TIMEOUT_MS = 20 * 1000
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000
const INITIAL_CHECK_DELAY_MS = 2_500
const UPDATE_TOAST_ID = "desktop-update-notification"

const IDLE_STATE: DesktopUpdateState = {
  status: "idle",
  channel: null,
  version: null,
  progress: null,
  downloadedBytes: 0,
  totalBytes: null,
  downloadUrl: null,
  error: null,
}

const DesktopUpdaterContext = createContext<DesktopUpdaterContextValue | null>(null)

export function DesktopUpdaterProvider({ children }: { children: ReactNode }) {
  const [desktop] = useState(() => isDesktopApp())
  const [state, setState] = useState<DesktopUpdateState>(IDLE_STATE)
  const mountedRef = useRef(true)
  const busyRef = useRef(false)
  const dismissedVersionRef = useRef<string | null>(null)
  const lastCheckedAtRef = useRef(0)
  const announcedVersionRef = useRef<string | null>(null)
  const updateRef = useRef<import("@tauri-apps/plugin-updater").Update | null>(null)

  const applyState = useCallback((next: Partial<DesktopUpdateState>) => {
    if (!mountedRef.current) return
    setState((current) => ({ ...current, ...next }))
  }, [])

  const releaseUpdateHandle = useCallback(async () => {
    const update = updateRef.current
    updateRef.current = null
    if (update) await update.close().catch(() => undefined)
  }, [])

  const checkNow = useCallback(async () => {
    if (!desktop || busyRef.current) return
    busyRef.current = true
    applyState({ status: "checking", progress: null, error: null })

    try {
      const { check } = await import("@tauri-apps/plugin-updater")
      const signedUpdate = await check({ timeout: CHECK_TIMEOUT_MS }).catch((error: unknown) => {
        // A missing or unreachable release feed is expected on installations that were sideloaded
        // from the install page, so fall through to the manual lookup instead of failing here.
        console.warn("Signed desktop update feed unavailable", error)
        return null
      })
      lastCheckedAtRef.current = Date.now()

      if (!mountedRef.current) {
        await signedUpdate?.close().catch(() => undefined)
        return
      }

      if (signedUpdate) {
        await releaseUpdateHandle()
        updateRef.current = signedUpdate
        if (dismissedVersionRef.current === signedUpdate.version) {
          setState(IDLE_STATE)
          return
        }
        setState({
          ...IDLE_STATE,
          status: "available",
          channel: "signed",
          version: signedUpdate.version,
        })
        return
      }

      await releaseUpdateHandle()
      const { getVersion } = await import("@tauri-apps/api/app")
      const manual = await loadManualDesktopUpdate(await getVersion())
      if (!mountedRef.current) return

      if (!manual || dismissedVersionRef.current === manual.version) {
        setState(IDLE_STATE)
        return
      }
      setState({
        ...IDLE_STATE,
        status: "manual",
        channel: "manual",
        version: manual.version,
        downloadUrl: manual.downloadUrl,
      })
    } catch (error) {
      console.error("Desktop update check failed", error)
      applyState({
        status: "error",
        progress: null,
        error: "Release information is unavailable.",
      })
    } finally {
      busyRef.current = false
    }
  }, [applyState, desktop, releaseUpdateHandle])

  const startUpdate = useCallback(async () => {
    if (!desktop || busyRef.current) return

    if (state.status === "manual") {
      if (!state.downloadUrl) return
      try {
        await openExternal(state.downloadUrl)
        toast.info("Download started in your browser", {
          id: UPDATE_TOAST_ID,
          description: "Open the downloaded package to finish updating Millennium.",
        })
      } catch (error) {
        console.error("Desktop manual update download failed", error)
        toast.error("Download could not be opened", {
          id: UPDATE_TOAST_ID,
          description: "Open the Millennium download page in a browser to update manually.",
        })
      }
      return
    }

    const update = updateRef.current
    if (!update) {
      await checkNow()
      return
    }

    busyRef.current = true
    let downloadedBytes = 0
    let totalBytes: number | null = null
    applyState({
      status: "downloading",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: null,
      error: null,
    })

    try {
      await update.download((event) => {
        if (!mountedRef.current) return
        if (event.event === "Started") {
          totalBytes = event.data.contentLength ?? null
          downloadedBytes = 0
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength
        } else {
          downloadedBytes = totalBytes ?? downloadedBytes
        }
        applyState({
          status: "downloading",
          downloadedBytes,
          totalBytes,
          progress: totalBytes
            ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
            : null,
        })
      }, { timeout: DOWNLOAD_TIMEOUT_MS })

      applyState({ status: "ready", progress: 100, error: null })
    } catch (error) {
      console.error("Desktop update download failed", error)
      applyState({ status: "error", progress: null, error: "The update could not be downloaded." })
      toast.error("Download failed", {
        id: UPDATE_TOAST_ID,
        description: "Check your connection, then retry the update.",
      })
    } finally {
      busyRef.current = false
    }
  }, [applyState, checkNow, desktop, state.downloadUrl, state.status])

  const installUpdate = useCallback(async () => {
    if (!desktop || busyRef.current) return
    const update = updateRef.current
    if (!update) {
      await checkNow()
      return
    }

    busyRef.current = true
    applyState({ status: "installing", progress: 100, error: null })
    try {
      await update.install()
      const { relaunch } = await import("@tauri-apps/plugin-process")
      await relaunch()
    } catch (error) {
      console.error("Desktop update install failed", error)
      busyRef.current = false
      applyState({ status: "error", progress: null, error: "The update could not be installed." })
      toast.error("Install failed", {
        id: UPDATE_TOAST_ID,
        description: "Retry the install, or download the package from the Millennium website.",
      })
    }
  }, [applyState, checkNow, desktop])

  const dismiss = useCallback(() => {
    dismissedVersionRef.current = state.version
    toast.dismiss(UPDATE_TOAST_ID)
    setState(IDLE_STATE)
  }, [state.version])

  useEffect(() => {
    mountedRef.current = true
    if (!desktop) return undefined

    const initialTimer = window.setTimeout(() => void checkNow(), INITIAL_CHECK_DELAY_MS)
    const interval = window.setInterval(() => void checkNow(), UPDATE_CHECK_INTERVAL_MS)
    const checkWhenActive = () => {
      if (
        document.visibilityState === "visible"
        && Date.now() - lastCheckedAtRef.current >= ACTIVE_RECHECK_INTERVAL_MS
      ) {
        void checkNow()
      }
    }

    window.addEventListener("focus", checkWhenActive)
    window.addEventListener("online", checkWhenActive)
    document.addEventListener("visibilitychange", checkWhenActive)

    return () => {
      mountedRef.current = false
      window.clearTimeout(initialTimer)
      window.clearInterval(interval)
      window.removeEventListener("focus", checkWhenActive)
      window.removeEventListener("online", checkWhenActive)
      document.removeEventListener("visibilitychange", checkWhenActive)
      const update = updateRef.current
      updateRef.current = null
      void update?.close().catch(() => undefined)
    }
  }, [checkNow, desktop])

  // The sidebar button owns progress and the install action. Toasts only announce a newly found
  // update once, so the two surfaces never narrate the same download in parallel.
  useEffect(() => {
    if (!desktop) return
    if (state.status !== "available" && state.status !== "manual") return
    if (!state.version || announcedVersionRef.current === state.version) return

    announcedVersionRef.current = state.version
    toast.info(`Millennium Desktop ${state.version} is available`, {
      id: UPDATE_TOAST_ID,
      description: state.status === "manual"
        ? "Signed in-app updates are unavailable. Download the package from the Millennium website."
        : "Download it from the sidebar, then install when it finishes.",
      duration: 12_000,
      action: {
        label: state.status === "manual" ? "Download" : "Get update",
        onClick: () => void startUpdate(),
      },
    })
  }, [desktop, startUpdate, state.status, state.version])

  return (
    <DesktopUpdaterContext.Provider
      value={{ desktop, state, checkNow, startUpdate, installUpdate, dismiss }}
    >
      {children}
    </DesktopUpdaterContext.Provider>
  )
}

export function useDesktopUpdater(): DesktopUpdaterContextValue | null {
  return useContext(DesktopUpdaterContext)
}
