import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconAlertTriangle,
  IconBook2,
  IconBrandGoogle,
  IconBrowser,
  IconCheck,
  IconChevronRight,
  IconClipboardText,
  IconCloudCheck,
  IconCloudOff,
  IconExternalLink,
  IconFile,
  IconLoader2,
  IconRefresh,
  IconSchool,
  IconShieldLock,
  IconTrash,
} from '@tabler/icons-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { GoogleClassroomController } from '@/hooks/useGoogleClassroom'
import type {
  ClassroomAutomationDiagnostics,
  ClassroomBrowserPermission,
} from '@/lib/desktop/classroom'
import { BrowserPermissionDialog } from '@/components/dashboard/classroom/BrowserPermissionDialog'
import type { ClassroomItem, ClassroomItemKind, ClassroomSubmissionStatus } from '@/types/classroom'
import { openExternal } from '@/lib/desktop/utils'

type ClassroomTab = 'stream' | 'assignments' | 'missing' | 'materials'

const COURSE_COLORS = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#dc2626', '#0891b2', '#db2777']

function formatDate(value?: string): string {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function kindLabel(kind: ClassroomItemKind): string {
  return kind === 'unknown' ? 'Classwork' : `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`
}

function statusLabel(status?: ClassroomSubmissionStatus): string {
  if (!status || status === 'unknown') return 'Not tracked'
  return status.split('-').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ')
}

function statusVariant(status?: ClassroomSubmissionStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'missing') return 'destructive'
  if (status === 'graded' || status === 'returned' || status === 'turned-in') return 'default'
  if (status === 'assigned') return 'secondary'
  return 'outline'
}

function syncProgress(phase?: string): number {
  if (phase === 'launching') return 15
  if (phase === 'awaiting-login') return 35
  if (phase === 'scraping') return 65
  if (phase === 'saving-locally') return 90
  if (phase === 'completed' || phase === 'partial') return 100
  return 0
}

export function ClassroomPage({ classroom }: { classroom: GoogleClassroomController }) {
  const [tab, setTab] = useState<ClassroomTab>('stream')
  const [courseId, setCourseId] = useState('all')
  const [kind, setKind] = useState<ClassroomItemKind | 'all'>('all')
  const [selectedItem, setSelectedItem] = useState<ClassroomItem | null>(null)
  const [syncOpen, setSyncOpen] = useState(false)
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [nativePermissionOpen, setNativePermissionOpen] = useState(false)
  const [nativePermission, setNativePermission] = useState<ClassroomBrowserPermission>('prompt-required')
  const [permissionBusy, setPermissionBusy] = useState(false)
  const [permissionDiagnostics, setPermissionDiagnostics] = useState<ClassroomAutomationDiagnostics | null>(null)
  const [browserId, setBrowserId] = useState<string>('')
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const permissionContinuationRef = useRef(false)
  const prewarmedOperationRef = useRef<string | null>(null)

  useEffect(() => {
    if (!browserId && classroom.browsers[0]) setBrowserId(classroom.browsers[0].id)
  }, [browserId, classroom.browsers])

  const filteredItems = useMemo(() => {
    let items = classroom.items
    if (tab === 'assignments') items = items.filter((item) => item.kind === 'assignment')
    if (tab === 'missing') items = items.filter((item) => item.submission?.status === 'missing')
    if (tab === 'materials') items = items.filter((item) => item.kind === 'material')
    if (courseId !== 'all') items = items.filter((item) => item.courseId === courseId)
    if (kind !== 'all') items = items.filter((item) => item.kind === kind)
    return [...items].sort((a, b) => {
      const aDate = Date.parse(a.dueAt || a.postedAt || '')
      const bDate = Date.parse(b.dueAt || b.postedAt || '')
      if (!Number.isFinite(aDate) && !Number.isFinite(bDate)) return a.title.localeCompare(b.title)
      if (!Number.isFinite(aDate)) return 1
      if (!Number.isFinite(bDate)) return -1
      return aDate - bDate
    })
  }, [classroom.items, courseId, kind, tab])

  const openGoogleUrl = async (url: string) => {
    try {
      await openExternal(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open Google Classroom.')
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await classroom.deleteData()
      setDeleteOpen(false)
      toast.success('Classroom data deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete Classroom data.')
    } finally {
      setDeleting(false)
    }
  }

  const continueAfterPermission = useCallback(async (permission: ClassroomBrowserPermission) => {
    setNativePermission(permission)
    if (!['granted', 'not-required'].includes(permission) || permissionContinuationRef.current) {
      return
    }
    permissionContinuationRef.current = true
    setNativePermissionOpen(false)
    try {
      await classroom.continueSync()
    } finally {
      permissionContinuationRef.current = false
    }
  }, [classroom.continueSync])

  // The dialog explains blockers rather than guessing, so every state change reloads them.
  const refreshPermissionDiagnostics = useCallback(() => {
    void classroom
      .readBrowserPermissionDiagnostics(browserId ? (browserId as 'chrome' | 'chromium' | 'edge') : undefined)
      .then((diagnostics) => {
        setPermissionDiagnostics(diagnostics)
        setNativePermission(diagnostics.permission)
      })
      .catch(() => setPermissionDiagnostics(null))
  }, [browserId, classroom.readBrowserPermissionDiagnostics])

  const requestNativePermission = useCallback(async () => {
    setNativePermissionOpen(true)
    setPermissionBusy(true)
    try {
      await continueAfterPermission(await classroom.requestBrowserPermission())
    } catch (error) {
      setNativePermission('unavailable')
      toast.error(error instanceof Error ? error.message : 'Could not request browser permission.')
    } finally {
      setPermissionBusy(false)
      refreshPermissionDiagnostics()
    }
  }, [classroom.requestBrowserPermission, continueAfterPermission, refreshPermissionDiagnostics])

  // macOS keeps a denial forever and never records an entry it was not asked for, so clearing the
  // quarantine flag and the stored decision is the only way back to a prompt for an ad-hoc build.
  const repairNativePermission = useCallback(async () => {
    try {
      const repair = await classroom.repairBrowserPermission(
        browserId ? (browserId as 'chrome' | 'chromium' | 'edge') : undefined,
      )
      setPermissionDiagnostics(repair.diagnostics)
      setNativePermission(repair.diagnostics.permission)
      toast.success('Browser permission repaired', {
        description: repair.notes[0] || 'Ask macOS again to bring up the permission prompt.',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Browser permission could not be repaired.')
    }
  }, [browserId, classroom.repairBrowserPermission])

  // macOS only offers its automation prompt once per application and target. After a denial, or
  // in a build the system will not prompt for, System Settings is the only place access can be
  // granted, so the dialog opens it directly instead of re-asking.
  const openPermissionSettings = useCallback(async () => {
    try {
      await classroom.openBrowserPermissionSettings()
      toast.info('System Settings opened', {
        description: 'Allow Millennium to control your browser under Privacy & Security > Automation.',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'System Settings could not be opened.')
    }
  }, [classroom.openBrowserPermissionSettings])

  // Ask the operating system for automation access while the user is still signing in, so the
  // system prompt is answered before Millennium reads any Classroom page.
  useEffect(() => {
    const pending = classroom.syncStatus
    if (pending?.phase !== 'awaiting-login' || !pending.operationId) return
    if (prewarmedOperationRef.current === pending.operationId) return
    prewarmedOperationRef.current = pending.operationId
    let cancelled = false
    void classroom
      .requestBrowserPermission()
      .then((permission) => { if (!cancelled) setNativePermission(permission) })
      .catch(() => { if (!cancelled) setNativePermission('unavailable') })
      .finally(() => { if (!cancelled) refreshPermissionDiagnostics() })
    return () => { cancelled = true }
  }, [classroom.requestBrowserPermission, classroom.syncStatus, refreshPermissionDiagnostics])

  useEffect(() => {
    if (
      !nativePermissionOpen
      || permissionBusy
      || !['prompt-required', 'prompt-unavailable', 'browser-not-running', 'denied', 'unavailable']
        .includes(nativePermission)
    ) {
      return
    }
    let cancelled = false
    let checking = false
    const check = async () => {
      if (checking) return
      checking = true
      try {
        const permission = await classroom.checkBrowserPermission()
        if (!cancelled) await continueAfterPermission(permission)
      } catch {
        // Keep dialog open. Retry action surfaces a useful native error.
      } finally {
        checking = false
      }
    }
    const interval = window.setInterval(() => void check(), 1000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [
    classroom.checkBrowserPermission,
    continueAfterPermission,
    nativePermission,
    nativePermissionOpen,
    permissionBusy,
  ])

  const status = classroom.syncStatus
  const showSyncControls = classroom.isDesktop && classroom.browsers.length > 0
  const requestClassroomSync = () => {
    if (status && ['launching', 'awaiting-login', 'scraping', 'saving-locally'].includes(status.phase)) {
      setSyncOpen(true)
      return
    }
    setPermissionOpen(true)
  }

  return (
    <div className="h-full overflow-auto p-4 md:p-6" data-tour-id="page-classroom">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <IconBrandGoogle className="size-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">Google Classroom</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Classes, assignments, materials, and submission state in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void classroom.refresh()} disabled={classroom.isLoading}>
              <IconRefresh className={classroom.isLoading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            {classroom.isDesktop ? (
              <Button onClick={requestClassroomSync}>
                <IconBrowser />
                Sync Classroom
              </Button>
            ) : (
              <Button onClick={() => { window.location.href = '/download' }}>
                Get Millennium Desktop
              </Button>
            )}
          </div>
        </div>

        {!classroom.isDesktop && (
          <Alert>
            <IconCloudOff />
            <AlertTitle>Desktop app required for new syncs</AlertTitle>
            <AlertDescription>
              Web app shows last cloud copy. Millennium Desktop opens a visible browser and saves Classroom data locally first.
            </AlertDescription>
          </Alert>
        )}

        {classroom.error && (
          <Alert variant="destructive">
            <IconAlertTriangle />
            <AlertTitle>Classroom needs attention</AlertTitle>
            <AlertDescription>{classroom.error}</AlertDescription>
          </Alert>
        )}

        {classroom.snapshot?.sync.integrity === 'partial' && (
          <Alert>
            <IconAlertTriangle />
            <AlertTitle>Partial Classroom scan</AlertTitle>
            <AlertDescription>
              Some course pages could not be read. Existing complete cloud data was preserved. Sync again after checking Google sign-in.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Courses</CardDescription><CardTitle className="text-2xl">{classroom.courses.length}</CardTitle></CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Assigned</CardDescription><CardTitle className="text-2xl">{classroom.assignedItems.length}</CardTitle></CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Missing</CardDescription><CardTitle className="text-2xl text-destructive">{classroom.missingItems.length}</CardTitle></CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Last sync</CardDescription>
              <CardTitle className="text-base">{classroom.snapshot ? formatDate(classroom.snapshot.sync.syncedAt) : 'Never'}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Badge variant="outline">
                {classroom.cloudState === 'synced' ? <IconCloudCheck /> : <IconCloudOff />}
                {classroom.cloudState === 'synced'
                  ? 'Cloud synced'
                  : classroom.cloudState === 'uploading'
                    ? 'Uploading'
                    : classroom.cloudState === 'idle'
                      ? 'Not synced'
                      : 'Local only'}
              </Badge>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="gap-3 pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <Tabs value={tab} onValueChange={(value) => setTab(value as ClassroomTab)}>
                <TabsList>
                  <TabsTrigger value="stream">Stream</TabsTrigger>
                  <TabsTrigger value="assignments">Assignments</TabsTrigger>
                  <TabsTrigger value="missing">Missing {classroom.missingItems.length > 0 ? `(${classroom.missingItems.length})` : ''}</TabsTrigger>
                  <TabsTrigger value="materials">Materials</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={courseId} onValueChange={(value) => { if (value) setCourseId(value) }}>
                  <SelectTrigger className="w-full sm:w-52" aria-label="Filter by course"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All courses</SelectItem>
                    {classroom.courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={kind} onValueChange={(value) => setKind(value as ClassroomItemKind | 'all')}>
                  <SelectTrigger className="w-full sm:w-40" aria-label="Filter by type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="assignment">Assignments</SelectItem>
                    <SelectItem value="material">Materials</SelectItem>
                    <SelectItem value="question">Questions</SelectItem>
                    <SelectItem value="announcement">Announcements</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {classroom.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((value) => <Skeleton key={value} className="h-24 w-full rounded-lg" />)}
              </div>
            ) : !classroom.snapshot ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
                <div className="rounded-full bg-muted p-4"><IconSchool className="size-8 text-muted-foreground" /></div>
                <div><h2 className="font-medium">No Classroom data yet</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">Open Millennium Desktop, choose a browser, sign in to Google, then confirm sync.</p></div>
                {classroom.isDesktop && <Button onClick={requestClassroomSync}>Start Classroom sync</Button>}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center text-center">
                <IconCheck className="mb-3 size-8 text-muted-foreground" />
                <h2 className="font-medium">Nothing here</h2>
                <p className="mt-1 text-sm text-muted-foreground">No Classroom items match this view.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item) => {
                  const course = classroom.courseById.get(item.courseId)
                  const courseIndex = Math.max(0, classroom.courses.findIndex((entry) => entry.id === item.courseId))
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="h-12 w-1 shrink-0 rounded-full" style={{ backgroundColor: COURSE_COLORS[courseIndex % COURSE_COLORS.length] }} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{item.title}</span>
                          <Badge variant={statusVariant(item.submission?.status)}>{statusLabel(item.submission?.status)}</Badge>
                        </span>
                        <span className="mt-1 block truncate text-sm text-muted-foreground">
                          {course?.title || 'Unknown course'} · {kindLabel(item.kind)} · {item.dueAt ? `Due ${formatDate(item.dueAt)}` : item.postedAt ? `Posted ${formatDate(item.postedAt)}` : 'No date'}
                        </span>
                      </span>
                      <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {classroom.snapshot && (
          <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {classroom.snapshot.sync.accountHint ? `Google account: ${classroom.snapshot.sync.accountHint}. ` : ''}
              Data retained for up to 365 days after cloud sync.
            </div>
            <div className="flex gap-2">
              {classroom.isDesktop && <Button variant="outline" onClick={() => void classroom.disconnect().then(() => toast.success('Classroom browser profile disconnected')).catch(() => {})}>Disconnect browser</Button>}
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}><IconTrash />Delete data</Button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={permissionOpen} onOpenChange={setPermissionOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <IconShieldLock className="size-5" aria-hidden="true" />
            </div>
            <AlertDialogTitle>Prepare read-only Classroom access?</AlertDialogTitle>
            <AlertDialogDescription>
              Millennium will open a dedicated browser and read visible course names, classwork,
              materials, due dates, grades, and submission status. It cannot create, edit, submit,
              or delete Classroom content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            Data is encrypted on this device first. Complete snapshots may sync to your Millennium
            account so web and desktop stay current. Google sign-in remains in the dedicated browser.
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPermissionOpen(false)
                setSyncOpen(true)
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sync Google Classroom</DialogTitle>
            <DialogDescription>A visible dedicated browser opens. macOS requests browser permission after sign-in and before Millennium reads any Classroom page.</DialogDescription>
          </DialogHeader>
          {!showSyncControls ? (
            <Alert variant="destructive"><IconBrowser /><AlertTitle>No supported browser found</AlertTitle><AlertDescription>Install Chrome, Chromium, or Microsoft Edge, then try again.</AlertDescription></Alert>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="classroom-browser">Browser</Label>
                <Select value={browserId} onValueChange={(value) => { if (value) setBrowserId(value) }}>
                  <SelectTrigger id="classroom-browser"><SelectValue placeholder="Choose browser" /></SelectTrigger>
                  <SelectContent>{classroom.browsers.map((browser) => <SelectItem key={browser.id} value={browser.id}>{browser.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div><Label htmlFor="classroom-keep-signed-in">Keep signed in</Label><p className="text-xs text-muted-foreground">Reuse encrypted dedicated browser profile next sync.</p></div>
                <Switch id="classroom-keep-signed-in" checked={keepSignedIn} onCheckedChange={setKeepSignedIn} />
              </div>
              {status && status.phase !== 'idle' && (
                <div className="space-y-2 rounded-lg bg-muted p-3">
                  <div className="flex items-center justify-between text-sm"><span className="font-medium">{status.phase.replaceAll('-', ' ')}</span><span>{syncProgress(status.phase)}%</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full bg-primary transition-all" style={{ width: `${syncProgress(status.phase)}%` }} /></div>
                  <p className="text-sm text-muted-foreground">{status.message}</p>
                  {(status.coursesFound > 0 || status.itemsFound > 0) && <p className="text-xs text-muted-foreground">{status.coursesFound} courses · {status.itemsFound} items</p>}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <div>{status && ['launching', 'awaiting-login', 'scraping'].includes(status.phase) && <Button variant="outline" onClick={() => void classroom.cancelSync()}>Cancel</Button>}</div>
            <div className="flex gap-2">
              {status?.phase === 'awaiting-login' ? (
                <Button onClick={() => void requestNativePermission()} disabled={classroom.isSyncing || permissionBusy}>
                  {classroom.isSyncing && <IconLoader2 className="animate-spin" />}I&apos;m signed in — sync now
                </Button>
              ) : status?.phase === 'completed' || status?.phase === 'partial' ? (
                <>
                  <Button variant="outline" onClick={() => setSyncOpen(false)}>Done</Button>
                  <Button
                    onClick={() => void classroom.startSync({ browserId: browserId as 'chrome' | 'chromium' | 'edge', keepSignedIn })}
                    disabled={!browserId || classroom.isSyncing}
                  >
                    {classroom.isSyncing && <IconLoader2 className="animate-spin" />}Sync again
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => void classroom.startSync({ browserId: browserId as 'chrome' | 'chromium' | 'edge', keepSignedIn })}
                  disabled={!browserId || classroom.isSyncing}
                >
                  {classroom.isSyncing && <IconLoader2 className="animate-spin" />}Open browser
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BrowserPermissionDialog
        open={nativePermissionOpen}
        onOpenChange={setNativePermissionOpen}
        permission={nativePermission}
        diagnostics={permissionDiagnostics}
        busy={permissionBusy}
        onRequestPrompt={() => void requestNativePermission()}
        onOpenSettings={() => void openPermissionSettings()}
        onRepair={repairNativePermission}
        onRefreshDiagnostics={refreshPermissionDiagnostics}
      />

      <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => { if (!open) setSelectedItem(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {selectedItem && (
            <>
              <DialogHeader>
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  {selectedItem.kind === 'assignment' ? <IconClipboardText /> : selectedItem.kind === 'material' ? <IconFile /> : <IconBook2 />}
                  <span className="text-sm">{classroom.courseById.get(selectedItem.courseId)?.title || 'Google Classroom'}</span>
                </div>
                <DialogTitle>{selectedItem.title}</DialogTitle>
                <DialogDescription>{kindLabel(selectedItem.kind)} · {selectedItem.dueAt ? `Due ${formatDate(selectedItem.dueAt)}` : selectedItem.postedAt ? `Posted ${formatDate(selectedItem.postedAt)}` : 'No date recorded'}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={statusVariant(selectedItem.submission?.status)}>{statusLabel(selectedItem.submission?.status)}</Badge>
                  {selectedItem.submission?.grade !== undefined && <Badge variant="outline">{selectedItem.submission.grade}{selectedItem.submission.maxPoints !== undefined ? ` / ${selectedItem.submission.maxPoints}` : ' points'}</Badge>}
                </div>
                {selectedItem.description && <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{selectedItem.description}</p>}
                {selectedItem.attachments.length > 0 && (
                  <div><h3 className="mb-2 text-sm font-medium">Attachments</h3><div className="space-y-2">{selectedItem.attachments.map((attachment) => <Button key={attachment.id} variant="outline" className="w-full justify-start" onClick={() => void openGoogleUrl(attachment.url)}><IconFile /><span className="truncate">{attachment.name}</span><IconExternalLink className="ml-auto" /></Button>)}</div></div>
                )}
              </div>
              <DialogFooter><Button onClick={() => void openGoogleUrl(selectedItem.url)}><IconExternalLink />Open in Classroom</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete all Classroom data?</AlertDialogTitle><AlertDialogDescription>This removes cloud copy and encrypted local snapshot. Dedicated browser sign-in stays connected until separately disconnected.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deleting} onClick={(event) => { event.preventDefault(); void handleDelete() }}>{deleting ? 'Deleting…' : 'Delete Classroom data'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
