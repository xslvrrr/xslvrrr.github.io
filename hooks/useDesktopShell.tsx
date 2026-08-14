"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { isDesktopApp } from "@/lib/desktop/utils"

/** Emitted by the native host after a newer UI shell finishes downloading and verifying. */
const SHELL_UPDATED_EVENT = "millennium://shell-updated"
const SHELL_TOAST_ID = "desktop-shell-update"
const SHELL_POLL_INTERVAL_MS = 15 * 60 * 1000
/** Shortest gap between two user-triggered shell checks, so focus changes cannot hammer the host. */
const SHELL_CHECK_THROTTLE_MS = 60 * 1000

export interface DesktopShellStatus {
  channel: "live" | "bundled"
  buildId: string | null
  version: string | null
  nativeVersion: string
  requiresNativeUpdate: boolean
  blockedVersion: string | null
  lastCheckedAt: string | null
  lastError: string | null
}

async function readShellStatus(): Promise<DesktopShellStatus | null> {
  if (!isDesktopApp()) return null
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<DesktopShellStatus>("desktop_shell_status")
}

/** Asks the native host to compare against the deployment now instead of at its next interval. */
async function requestShellCheck(): Promise<DesktopShellStatus | null> {
  if (!isDesktopApp()) return null
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<DesktopShellStatus>("desktop_shell_check")
}

/**
 * Keeps the desktop UI aligned with the deployed web release.
 *
 * The native host downloads and verifies the published shell in the background. A running window
 * still renders the shell it started with, so this hook surfaces a reload once a newer one is
 * active, and tells the user when a shell is held back because the installed native package is
 * too old for it.
 */
export function useDesktopShell(): DesktopShellStatus | null {
  const [status, setStatus] = useState<DesktopShellStatus | null>(null)
  const [desktop] = useState(() => isDesktopApp())
  const announcedBuildRef = useRef<string | null>(null)
  const announcedBlockedRef = useRef<string | null>(null)

  const lastCheckRef = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const next = await readShellStatus()
      if (next) setStatus(next)
    } catch (error) {
      console.warn("Desktop shell status unavailable", error)
    }
  }, [])

  // The host's own background check runs four seconds after launch and then only every thirty
  // minutes, so a window opened before the network was ready, or left open across a deployment,
  // kept rendering a stale shell for far longer than it had to. Ask for a check whenever the user
  // comes back to the window or the machine reconnects.
  const check = useCallback(async () => {
    const now = Date.now()
    if (now - lastCheckRef.current < SHELL_CHECK_THROTTLE_MS) return
    lastCheckRef.current = now
    try {
      const next = await requestShellCheck()
      if (next) setStatus(next)
    } catch (error) {
      console.warn("Desktop shell check failed", error)
    }
  }, [])

  useEffect(() => {
    if (!desktop) return undefined
    let disposed = false
    let unlisten: (() => void) | undefined

    void refresh()
    void check()
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event")
      const stop = await listen<DesktopShellStatus>(SHELL_UPDATED_EVENT, (event) => {
        setStatus(event.payload)
      })
      if (disposed) stop()
      else unlisten = stop
    })().catch((error) => console.warn("Desktop shell listener failed", error))

    const handleFocus = () => void check()
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void check()
    }
    window.addEventListener("focus", handleFocus)
    window.addEventListener("online", handleFocus)
    document.addEventListener("visibilitychange", handleVisibility)

    const interval = window.setInterval(() => void check(), SHELL_POLL_INTERVAL_MS)
    return () => {
      disposed = true
      unlisten?.()
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("online", handleFocus)
      document.removeEventListener("visibilitychange", handleVisibility)
      window.clearInterval(interval)
    }
  }, [check, desktop, refresh])

  useEffect(() => {
    if (!status || status.channel !== "live" || !status.buildId) return
    // The first observed build is whatever this window already rendered.
    if (announcedBuildRef.current === null) {
      announcedBuildRef.current = status.buildId
      return
    }
    if (announcedBuildRef.current === status.buildId) return
    announcedBuildRef.current = status.buildId

    toast.info(
      status.version ? `Millennium ${status.version} is ready` : "Millennium was updated",
      {
        id: SHELL_TOAST_ID,
        description: "Reload to use the latest version of the app.",
        duration: Infinity,
        action: { label: "Reload", onClick: () => window.location.reload() },
      },
    )
  }, [status])

  useEffect(() => {
    if (!status?.requiresNativeUpdate || !status.blockedVersion) return
    if (announcedBlockedRef.current === status.blockedVersion) return
    announcedBlockedRef.current = status.blockedVersion

    toast.warning(`Millennium ${status.blockedVersion} needs a new desktop package`, {
      id: `${SHELL_TOAST_ID}-native`,
      description: "Install the desktop update from the sidebar to keep matching the web app.",
      duration: 15_000,
    })
  }, [status])

  return status
}

/** Mounts the shell watcher without rendering anything. */
export function DesktopShellWatcher() {
  useDesktopShell()
  return null
}
