"use client"

import { useEffect, useRef, useState } from "react"
import {
  IconCircleCheck,
  IconDownload,
  IconExternalLink,
  IconLoader2,
  IconRefresh,
  IconX,
} from "@tabler/icons-react"

import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useDesktopUpdater, type DesktopUpdateState } from "@/hooks/useDesktopUpdater"
import { cn } from "@/lib/utils"

/** Matches the exit animation below so the row is removed only after it finishes. */
const EXIT_ANIMATION_MS = 220

function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024)
  return megabytes >= 100 ? `${Math.round(megabytes)} MB` : `${megabytes.toFixed(1)} MB`
}

function describe(state: DesktopUpdateState): { label: string; detail: string | null } {
  switch (state.status) {
    case "checking":
      return { label: "Checking for updates", detail: null }
    case "available":
      return { label: "Download update", detail: state.version ? `v${state.version}` : null }
    case "downloading":
      return {
        label: state.progress === null ? "Downloading update" : `Downloading ${state.progress}%`,
        detail: state.totalBytes
          ? `${formatBytes(state.downloadedBytes)} of ${formatBytes(state.totalBytes)}`
          : formatBytes(state.downloadedBytes),
      }
    case "ready":
      return {
        label: "Install and restart",
        detail: state.version ? `v${state.version} ready` : "Ready to install",
      }
    case "installing":
      return { label: "Installing update", detail: "Millennium will restart" }
    case "manual":
      return { label: "Get update", detail: state.version ? `v${state.version}` : null }
    case "error":
      return { label: "Retry update", detail: state.error }
    default:
      return { label: "Millennium is up to date", detail: null }
  }
}

function StatusIcon({ state }: { state: DesktopUpdateState }) {
  if (state.status === "checking" || state.status === "installing") {
    return <IconLoader2 className="animate-spin" aria-hidden="true" />
  }
  if (state.status === "downloading") {
    return <IconLoader2 className="animate-spin" aria-hidden="true" />
  }
  if (state.status === "ready") return <IconCircleCheck aria-hidden="true" />
  if (state.status === "error") return <IconRefresh aria-hidden="true" />
  if (state.status === "manual") return <IconExternalLink aria-hidden="true" />
  return <IconDownload aria-hidden="true" />
}

/**
 * Sidebar entry point for desktop updates.
 *
 * The row animates in when an update is found and animates out once it is dismissed or no longer
 * applies, so it never appears or disappears abruptly mid-session. Downloading and installing are
 * deliberately separate steps: the download reports live progress in place, and only then does
 * the row turn into an install action that restarts the application.
 */
export function DesktopUpdateButton() {
  const updater = useDesktopUpdater()
  const status = updater?.state.status ?? "idle"
  const shouldShow = Boolean(updater?.desktop) && status !== "idle" && status !== "checking"
  const [mounted, setMounted] = useState(shouldShow)
  const exitTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (shouldShow) {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
      setMounted(true)
      return
    }
    if (!mounted) return
    exitTimerRef.current = window.setTimeout(() => {
      setMounted(false)
      exitTimerRef.current = null
    }, EXIT_ANIMATION_MS)
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
    }
  }, [mounted, shouldShow])

  if (!updater || !mounted) return null

  const { installUpdate, startUpdate, dismiss, state } = updater
  const { label, detail } = describe(state)
  const busy = state.status === "downloading" || state.status === "installing"
  const tooltip = detail ? `${label} · ${detail}` : label
  const activate = () => {
    if (state.status === "ready") {
      void installUpdate()
      return
    }
    void startUpdate()
  }

  return (
    <SidebarMenuItem
      className={cn(
        "relative",
        shouldShow
          ? "animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out"
          : "animate-out fade-out slide-out-to-bottom-1 duration-200 ease-in fill-mode-forwards"
      )}
      data-desktop-update-status={state.status}
    >
      <SidebarMenuButton
        aria-label={tooltip}
        className={cn(
          "relative overflow-hidden border text-sidebar-foreground transition-colors",
          state.status === "ready"
            ? "border-sidebar-primary/45 bg-sidebar-primary/15 hover:bg-sidebar-primary/25"
            : "border-sidebar-primary/25 bg-sidebar-primary/10 hover:bg-sidebar-primary/20"
        )}
        data-tour-id="desktop-update"
        disabled={busy}
        onClick={activate}
        tooltip={tooltip}
      >
        <StatusIcon state={state} />
        <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
          <span className="w-full truncate">{label}</span>
          {detail ? (
            <span className="w-full truncate text-[10px] font-medium text-sidebar-foreground/55">
              {detail}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-x-0 bottom-0 h-0.5 origin-left bg-sidebar-primary transition-transform duration-200",
            state.status === "downloading" || state.status === "ready" ? "opacity-100" : "opacity-0"
          )}
          style={{
            transform: `scaleX(${
              state.status === "ready"
                ? 1
                : state.progress === null
                  ? 0.15
                  : state.progress / 100
            })`,
          }}
        />
      </SidebarMenuButton>
      {busy ? null : (
        <SidebarMenuAction
          aria-label="Dismiss update notice"
          onClick={dismiss}
          showOnHover
        >
          <IconX aria-hidden="true" />
        </SidebarMenuAction>
      )}
      <span className="sr-only" aria-live="polite">
        {tooltip}
      </span>
    </SidebarMenuItem>
  )
}
