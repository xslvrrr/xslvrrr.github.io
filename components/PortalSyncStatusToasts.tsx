"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  IconCircleCheck,
  IconAlertOctagon,
  IconDatabaseImport,
  IconPlayerStop,
  IconX,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { readDataSettings } from "@/lib/data-settings"
import {
  ULTRA_RUN_CANCEL_REQUEST_EVENT,
  cancelUltraRun,
  clearUltraRunStatus,
  getSyncToastId,
  getUltraRunStatus,
  requestUltraRunCancel,
  subscribeUltraRunStatus,
  type UltraRunStatus,
} from "@/lib/portal-sync-status"
import { cn } from "@/lib/utils"

const ULTRA_TOAST_ID = "millennium-ultra-run-live-status"

function shouldShowUltraRunStatus() {
  return readDataSettings().showUltraRunLiveStatus
}

function shouldShowSyncUpdates() {
  return readDataSettings().showSyncUpdates
}

export function notifyPortalSyncSuccess(description = "Your Millennium data synced successfully.") {
  if (!shouldShowSyncUpdates()) return
  toast.success("Data synced", {
    id: getSyncToastId(),
    description,
    position: "bottom-center",
  })
}

export function notifyPortalSyncError(message: string) {
  if (!shouldShowSyncUpdates()) return
  toast.error("Sync failed", {
    id: getSyncToastId(),
    description: message,
    position: "bottom-center",
  })
}

function ConfettiBurst() {
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 flex justify-center overflow-visible" aria-hidden="true">
      {Array.from({ length: 14 }).map((_, index) => (
        <span
          key={index}
          className="accent-fill absolute size-1.5 rounded-[2px] motion-safe:animate-[millennium-confetti_900ms_ease-out_forwards]"
          style={{
            '--confetti-x': `${(index - 7) * 12}px`,
            '--confetti-y': `${-18 - (index % 5) * 8}px`,
            '--confetti-rotate': `${index * 31}deg`,
            animationDelay: `${index * 28}ms`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

function UltraRunToast({ status }: { status: UltraRunStatus }) {
  const tone = status.status === "completed"
    ? "success"
    : status.status === "failed"
      ? "error"
      : status.status === "cancelled"
        ? "warning"
        : "running"
  const title = status.status === "completed"
    ? "Ultra run finished"
    : status.status === "failed"
      ? "Ultra run failed"
      : status.status === "cancelled"
        ? "Ultra run cancelled"
        : status.status === "cancelling"
          ? "Cancelling ultra run"
          : "Ultra run in progress"
  const canCancel = status.status === "running" || status.status === "cancelling"

  return (
    <div
      className={cn(
        "relative w-full overflow-visible rounded-lg border bg-popover p-4 text-left text-popover-foreground shadow-lg",
        tone === "success" && "accent-border [--accent-border-surface:var(--popover)]",
        tone === "error" && "border-destructive",
        tone === "warning" && "border-border bg-muted",
      )}
    >
      {status.status === "completed" && <ConfettiBurst />}
      <div className="flex items-start gap-3">
        <div className={cn(
          "mt-0.5",
          tone === "success" && "accent-text",
          tone === "error" && "text-destructive",
        )}>
          {tone === "success" ? (
            <IconCircleCheck />
          ) : tone === "error" ? (
            <IconAlertOctagon />
          ) : (
            <IconDatabaseImport />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground">{status.error || status.message}</p>
            </div>
            {canCancel && (
              <Button type="button" variant="outline" size="sm" onClick={requestUltraRunCancel}>
                <IconPlayerStop data-icon="inline-start" />
                Cancel
              </Button>
            )}
          </div>
          <Progress value={status.progress} className="mt-3">
            <ProgressLabel>
              Overall progress
            </ProgressLabel>
            <span className="ml-auto text-sm text-muted-foreground tabular-nums">
              {Math.round(status.progress)}%
            </span>
          </Progress>
          <p className="mt-2 text-xs text-muted-foreground">
            Syncing full {status.startYear}-{status.endYear} range
          </p>
        </div>
      </div>
    </div>
  )
}

export function PortalSyncStatusToasts() {
  const [status, setStatus] = React.useState<UltraRunStatus | null>(() => getUltraRunStatus())
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false)
  const [settingsVersion, setSettingsVersion] = React.useState(0)

  React.useEffect(() => subscribeUltraRunStatus(setStatus), [])

  React.useEffect(() => {
    const handleCancelRequest = () => setCancelDialogOpen(true)
    const handleSettingsChange = () => setSettingsVersion((version) => version + 1)
    window.addEventListener(ULTRA_RUN_CANCEL_REQUEST_EVENT, handleCancelRequest)
    window.addEventListener("millennium-data-settings-change", handleSettingsChange)
    window.addEventListener("storage", handleSettingsChange)
    return () => {
      window.removeEventListener(ULTRA_RUN_CANCEL_REQUEST_EVENT, handleCancelRequest)
      window.removeEventListener("millennium-data-settings-change", handleSettingsChange)
      window.removeEventListener("storage", handleSettingsChange)
    }
  }, [])

  React.useEffect(() => {
    if (!status || !readDataSettings().showUltraRunLiveStatus) {
      toast.dismiss(ULTRA_TOAST_ID)
      return
    }

    toast.custom(() => <UltraRunToast status={status} />, {
      id: ULTRA_TOAST_ID,
      duration: status.status === "running" || status.status === "cancelling" ? Infinity : 9000,
      position: "bottom-center",
      className: "!mx-auto !w-[min(92vw,460px)] !justify-center !border-0 !bg-transparent !p-0 !shadow-none",
    })
  }, [status, settingsVersion])

  React.useEffect(() => {
    if (!status || status.status === "running" || status.status === "cancelling") return

    const timeout = window.setTimeout(() => {
      toast.dismiss(ULTRA_TOAST_ID)
      clearUltraRunStatus()
    }, 9000)

    return () => window.clearTimeout(timeout)
  }, [status])

  React.useEffect(() => () => {
    toast.dismiss(ULTRA_TOAST_ID)
    const current = getUltraRunStatus()
    if (current && current.status !== "running" && current.status !== "cancelling") {
      clearUltraRunStatus()
    }
  }, [])

  return (
    <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel the ultra run?</AlertDialogTitle>
          <AlertDialogDescription>
            You can keep the data that has already synced during this run, or erase this run's synced chunks and restore the data snapshot from before it started.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <IconX data-icon="inline-start" />
            Continue run
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            cancelUltraRun("keep")
            setCancelDialogOpen(false)
          }}>
            Keep synced data
          </AlertDialogAction>
          <AlertDialogAction variant="destructive" onClick={() => {
            cancelUltraRun("erase")
            setCancelDialogOpen(false)
          }}>
            Erase this run
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
