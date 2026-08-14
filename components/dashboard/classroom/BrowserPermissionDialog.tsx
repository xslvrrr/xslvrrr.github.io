import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleCheck,
  IconClipboardCopy,
  IconLoader2,
  IconSettings,
  IconShieldLock,
  IconTool,
} from '@tabler/icons-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import type {
  ClassroomAutomationDiagnostics,
  ClassroomBrowserPermission,
} from '@/lib/desktop/classroom'

/**
 * Millennium Desktop is ad-hoc signed rather than notarised, so browser automation usually stalls
 * for an environmental reason instead of a user decision. A quarantined or App Translocated copy
 * never reaches the macOS prompt, and Privacy & Security > Automation deliberately has no control
 * for adding an entry by hand — the row only appears once an app has asked at least once.
 *
 * This dialog therefore names the specific blocker, offers the one action that clears it, and
 * keeps the full manual procedure one click away.
 */
export interface BrowserPermissionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  permission: ClassroomBrowserPermission
  diagnostics: ClassroomAutomationDiagnostics | null
  /** True while the macOS prompt is on screen and the app is blocked waiting for an answer. */
  busy: boolean
  onRequestPrompt: () => void
  onOpenSettings: () => void
  onRepair: () => Promise<void>
  onRefreshDiagnostics: () => void
}

interface PermissionBlocker {
  id: string
  title: string
  detail: string
  /** True when the in-app repair action can clear this blocker. */
  repairable: boolean
}

const GRANTED_STATES: readonly ClassroomBrowserPermission[] = ['granted', 'not-required']

function browserLabel(diagnostics: ClassroomAutomationDiagnostics | null): string {
  return diagnostics?.browserName || 'the selected browser'
}

function permissionBlockers(
  diagnostics: ClassroomAutomationDiagnostics | null,
  permission: ClassroomBrowserPermission,
): PermissionBlocker[] {
  if (!diagnostics || !diagnostics.required) return []
  const blockers: PermissionBlocker[] = []

  if (!diagnostics.isPackaged) {
    blockers.push({
      id: 'unpackaged',
      title: 'This is an unpackaged development build',
      detail:
        'macOS only shows the automation prompt for a real application bundle. Install the packaged Millennium app and grant access there.',
      repairable: false,
    })
  }

  if (diagnostics.isTranslocated) {
    blockers.push({
      id: 'translocated',
      title: 'macOS is running Millennium from a temporary copy',
      detail:
        'Gatekeeper moved this copy to a randomised read-only path, and macOS refuses to remember a permission for a path that changes every launch. Quit Millennium, drag it into your Applications folder, then open it from there.',
      repairable: false,
    })
  }

  if (diagnostics.isQuarantined) {
    blockers.push({
      id: 'quarantined',
      title: 'The downloaded copy is still quarantined',
      detail:
        'Millennium is not notarised by Apple, so macOS keeps a quarantine flag on the download and blocks the automation prompt. Repair removes that flag from Millennium only.',
      repairable: true,
    })
  }

  if (diagnostics.isPackaged && !diagnostics.signatureValid) {
    blockers.push({
      id: 'signature',
      title: 'The application signature is damaged',
      detail:
        'macOS will not grant automation access to a bundle whose signature no longer verifies. Reinstall Millennium from a fresh download.',
      repairable: false,
    })
  }

  if (diagnostics.isPackaged && !diagnostics.hasUsageDescription) {
    blockers.push({
      id: 'usage-description',
      title: 'This build cannot request automation access',
      detail:
        'The installed copy is missing the automation usage description macOS requires before it will ask. Reinstall Millennium from a fresh download.',
      repairable: false,
    })
  }

  if (!diagnostics.browserRunning) {
    blockers.push({
      id: 'browser-not-running',
      title: `${browserLabel(diagnostics)} is not running yet`,
      detail:
        'macOS can only ask about a browser that is already open. Start Classroom sync so Millennium opens its dedicated browser window, then grant access.',
      repairable: false,
    })
  }

  if (permission === 'denied') {
    blockers.push({
      id: 'denied',
      title: 'Browser access was declined',
      detail:
        'macOS remembers the refusal and will not ask a second time. Repair clears the stored decision for Millennium so the prompt can appear again.',
      repairable: true,
    })
  }

  return blockers
}

const MANUAL_STEPS: readonly string[] = [
  'Quit Millennium if it is open from your Downloads folder, then drag Millennium into Applications and open it from there.',
  'The first time, right-click Millennium in Applications and choose Open, then confirm. Millennium is not notarised, so a normal double-click can be refused.',
  'In Millennium, start Classroom sync and wait for the dedicated browser window to open.',
  'Choose Allow when macOS asks whether Millennium can control your browser. Sync continues on its own.',
  'If no prompt appeared, use Repair permission below and then Ask macOS again.',
  'To check the result, open  > System Settings > Privacy & Security > Automation and look for Millennium. There is no button to add an app there — the row only appears after Millennium has asked at least once, which is why Repair matters.',
]

export function BrowserPermissionDialog({
  open,
  onOpenChange,
  permission,
  diagnostics,
  busy,
  onRequestPrompt,
  onOpenSettings,
  onRepair,
  onRefreshDiagnostics,
}: BrowserPermissionDialogProps) {
  const [repairing, setRepairing] = useState(false)
  const [stepsOpen, setStepsOpen] = useState(false)

  const granted = GRANTED_STATES.includes(permission)
  const blockers = useMemo(
    () => permissionBlockers(diagnostics, permission),
    [diagnostics, permission],
  )
  const repairableBlocker = blockers.some((blocker) => blocker.repairable)
  const canRepair = Boolean(diagnostics?.canRepair) && (repairableBlocker || permission === 'unavailable')
  // Asking again is only offered where macOS can actually answer. A denial is remembered forever,
  // and a translocated or unpackaged copy fails the request before any prompt is drawn, so those
  // states get the blocker card and the repair action instead of a button that does nothing.
  const canAskAgain = !granted
    && permission !== 'denied'
    && permission !== 'prompt-unavailable'
    && diagnostics?.browserRunning !== false
    && !diagnostics?.isTranslocated
    && diagnostics?.isPackaged !== false

  // Blockers are cleared outside the app as often as inside it, so re-read them while the dialog
  // is visible instead of leaving stale guidance on screen.
  useEffect(() => {
    if (!open || busy || granted) return
    const interval = window.setInterval(onRefreshDiagnostics, 2000)
    return () => window.clearInterval(interval)
  }, [busy, granted, onRefreshDiagnostics, open])

  useEffect(() => {
    if (!open) setStepsOpen(false)
  }, [open])

  const handleRepair = useCallback(async () => {
    setRepairing(true)
    try {
      await onRepair()
    } finally {
      setRepairing(false)
    }
  }, [onRepair])

  const copyDiagnostics = useCallback(async () => {
    if (!diagnostics) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2))
      toast.success('Permission details copied')
    } catch {
      toast.error('Permission details could not be copied.')
    }
  }, [diagnostics])

  const headline = granted
    ? 'Browser access granted'
    : busy
      ? 'Waiting for the macOS prompt'
      : blockers.length > 0
        ? 'macOS is not asking for browser access yet'
        : 'Allow read-only browser access'

  const description = granted
    ? 'Millennium can read the dedicated browser. Classroom sync continues automatically.'
    : busy
      ? `Choose Allow in the macOS prompt to let Millennium read ${browserLabel(diagnostics)}. Sync starts as soon as access is granted.`
      : blockers.length > 0
        ? 'Millennium is ad-hoc signed rather than notarised by Apple, so macOS needs one of the following cleared before it will ask.'
        : `macOS has not confirmed access to ${browserLabel(diagnostics)} yet.`

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <AlertDialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            {granted ? (
              <IconCheck className="size-5" aria-hidden="true" />
            ) : busy || repairing ? (
              <IconLoader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <IconShieldLock className="size-5" aria-hidden="true" />
            )}
          </div>
          <AlertDialogTitle>{headline}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {blockers.length > 0 && (
          <ul className="space-y-2">
            {blockers.map((blocker) => (
              <li key={blocker.id} className="flex gap-3 rounded-lg border bg-muted/40 p-3">
                <IconAlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-amber-500"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-snug">{blocker.title}</p>
                  <p className="text-xs text-muted-foreground">{blocker.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {granted && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <IconCircleCheck className="size-4 text-primary" aria-hidden="true" />
            <span>Millennium reads {browserLabel(diagnostics)} in read-only mode.</span>
          </div>
        )}

        {!granted && (
          <Collapsible open={stepsOpen} onOpenChange={setStepsOpen}>
            <CollapsibleTrigger
              render={<Button variant="ghost" size="sm" className="w-full justify-between px-3" />}
            >
              <span>Step-by-step: granting access on macOS</span>
              <span className="text-xs text-muted-foreground">{stepsOpen ? 'Hide' : 'Show'}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ol className="mt-2 space-y-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                {MANUAL_STEPS.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-background text-xs font-medium text-foreground">
                      {index + 1}
                    </span>
                    <span className="leading-snug">{step}</span>
                  </li>
                ))}
              </ol>
            </CollapsibleContent>
          </Collapsible>
        )}

        {diagnostics?.bundlePath && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="truncate" title={diagnostics.bundlePath}>
                {diagnostics.bundlePath} · status {diagnostics.statusCode}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void copyDiagnostics()}>
                <IconClipboardCopy className="size-3.5" />
                Copy details
              </Button>
            </div>
          </>
        )}

        <AlertDialogFooter className="gap-2 sm:justify-between">
          <AlertDialogCancel disabled={busy || repairing}>
            {granted ? 'Close' : 'Cancel'}
          </AlertDialogCancel>
          {!granted && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onOpenSettings} disabled={busy || repairing}>
                <IconSettings />
                System Settings
              </Button>
              {canRepair && (
                <Button
                  variant={canAskAgain ? 'outline' : 'default'}
                  onClick={() => void handleRepair()}
                  disabled={busy || repairing}
                >
                  {repairing ? <IconLoader2 className="animate-spin" /> : <IconTool />}
                  Repair permission
                </Button>
              )}
              {canAskAgain && (
                <AlertDialogAction
                  disabled={busy || repairing}
                  onClick={(event) => {
                    event.preventDefault()
                    onRequestPrompt()
                  }}
                >
                  {busy ? 'Waiting for macOS…' : 'Ask macOS again'}
                </AlertDialogAction>
              )}
            </div>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
