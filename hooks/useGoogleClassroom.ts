import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  cancelClassroomSync,
  continueClassroomSync,
  detectClassroomBrowsers,
  disconnectClassroomProfile,
  getClassroomAutomationDiagnostics,
  getClassroomBrowserPermission,
  getClassroomSyncStatus,
  openBrowserPermissionSettings as openClassroomBrowserPermissionSettings,
  repairClassroomAutomation,
  requestClassroomBrowserPermission,
  startClassroomSync,
  type ClassroomAutomationDiagnostics,
  type ClassroomAutomationRepair,
  type ClassroomBrowser,
  type ClassroomBrowserPermission,
  type ClassroomBrowserId,
  type ClassroomCommandError,
  type ClassroomSyncStatus,
} from '@/lib/desktop/classroom'
import {
  clearClassroomDataCache,
  readClassroomDataCache,
} from '@/lib/desktop/storage'
import { isDesktopApp } from '@/lib/desktop/utils'
import type { ClassroomSnapshot } from '@/types/classroom'

export type ClassroomCloudState = 'idle' | 'uploading' | 'synced' | 'local-only' | 'error'

export interface StartGoogleClassroomSyncInput {
  browserId: ClassroomBrowserId
  keepSignedIn: boolean
}

interface ClassroomDataResponse {
  classroomData?: ClassroomSnapshot
  message?: string
}

interface ClassroomSyncSessionResponse {
  session?: { id?: string }
  uploadToken?: string
  message?: string
}

const ACTIVE_PHASES = new Set(['launching', 'scraping', 'saving-locally'])
const PHASE_PROGRESS: Record<ClassroomSyncStatus['phase'], number> = {
  idle: 0,
  launching: 1,
  'awaiting-login': 2,
  scraping: 3,
  'saving-locally': 4,
  completed: 5,
  partial: 5,
  cancelled: 5,
  error: 5,
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const value = error as Partial<ClassroomCommandError> & { message?: unknown }
    if (typeof value.message === 'string' && value.message.trim()) return value.message
  }
  return fallback
}

function snapshotTimestamp(snapshot: ClassroomSnapshot): number {
  const timestamp = Date.parse(snapshot.sync.syncedAt)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function isStrongSnapshot(snapshot: ClassroomSnapshot): boolean {
  return snapshot.sync.integrity === 'complete' || snapshot.sync.integrity === 'verified-empty'
}

function chooseSnapshot(
  current: ClassroomSnapshot | null,
  incoming: ClassroomSnapshot | null,
): ClassroomSnapshot | null {
  if (!current) return incoming
  if (!incoming) return current
  if (isStrongSnapshot(current) && !isStrongSnapshot(incoming)) return current
  if (!isStrongSnapshot(current) && isStrongSnapshot(incoming)) return incoming
  return snapshotTimestamp(incoming) >= snapshotTimestamp(current) ? incoming : current
}

function launchingStatus(
  browser: ClassroomBrowser | null,
  keepSignedIn: boolean,
): ClassroomSyncStatus {
  return {
    phase: 'launching',
    operationId: null,
    browser,
    keepSignedIn,
    coursesFound: 0,
    itemsFound: 0,
    localSnapshotAvailable: null,
    localSnapshotState: 'unknown',
    cloudSyncState: 'deferred',
    errorCode: null,
    message: 'Opening a dedicated browser for Google Classroom…',
  }
}

async function readCloudSnapshot(): Promise<ClassroomSnapshot | null> {
  const response = await fetch('/api/classroom/data', {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  const body = await response.json().catch(() => null) as ClassroomDataResponse | null
  if (response.status === 404) return null
  if (!response.ok) throw new Error(body?.message || 'Failed to load Classroom data.')
  return body?.classroomData || null
}

async function uploadCloudSnapshot(snapshot: ClassroomSnapshot): Promise<void> {
  const createResponse = await fetch('/api/classroom/sync-sessions', {
    method: 'POST',
    credentials: 'same-origin',
  })
  const created = await createResponse.json().catch(() => null) as ClassroomSyncSessionResponse | null
  if (!createResponse.ok) {
    throw new Error(created?.message || 'Failed to prepare Classroom cloud sync.')
  }
  const sessionId = created?.session?.id
  const uploadToken = created?.uploadToken
  if (!sessionId || !uploadToken) throw new Error('Classroom cloud sync returned an invalid session.')

  const uploadResponse = await fetch(`/api/classroom/sync-sessions/${encodeURIComponent(sessionId)}/upload`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Authorization: `Bearer ${uploadToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ snapshot }),
  })
  const uploaded = await uploadResponse.json().catch(() => null) as { message?: string } | null
  if (!uploadResponse.ok && uploadResponse.status !== 409) {
    throw new Error(uploaded?.message || 'Failed to upload Classroom data.')
  }
  if (uploadResponse.status === 409 && snapshot.sync.integrity === 'partial') {
    throw new Error(uploaded?.message || 'Partial Classroom data was kept on this device only.')
  }
}

export function useGoogleClassroom(ownerId?: string, enabled = true) {
  const desktop = isDesktopApp()
  const [snapshot, setSnapshot] = useState<ClassroomSnapshot | null>(null)
  const [browsers, setBrowsers] = useState<ClassroomBrowser[]>([])
  const [syncStatus, setSyncStatus] = useState<ClassroomSyncStatus | null>(null)
  const [cloudState, setCloudState] = useState<ClassroomCloudState>('idle')
  const [isLoading, setIsLoading] = useState(enabled)
  const [operationBusy, setOperationBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generationRef = useRef(0)
  const statusGenerationRef = useRef(0)

  const commitSyncStatus = useCallback((next: ClassroomSyncStatus) => {
    setSyncStatus((current) => {
      if (!current) return next
      if (current.phase === 'launching' && !current.operationId && next.phase === 'idle') {
        return current
      }
      if (
        current.operationId
        && next.operationId === current.operationId
        && PHASE_PROGRESS[next.phase] < PHASE_PROGRESS[current.phase]
        && !(next.phase === 'awaiting-login' && next.errorCode === 'LOGIN_REQUIRED')
      ) {
        return current
      }
      return next
    })
  }, [])

  const refresh = useCallback(async () => {
    if (!enabled || !ownerId) return null
    const generation = ++generationRef.current
    setIsLoading(true)
    setError(null)
    try {
      const [localResult, cloudResult] = await Promise.allSettled([
        desktop ? readClassroomDataCache(ownerId) : Promise.resolve(null),
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? Promise.resolve(null)
          : readCloudSnapshot(),
      ])
      if (generation !== generationRef.current) return null
      const local = localResult.status === 'fulfilled' ? localResult.value : null
      const cloud = cloudResult.status === 'fulfilled' ? cloudResult.value : null
      const next = chooseSnapshot(local, cloud)
      setSnapshot(next)
      if (cloud) setCloudState('synced')
      else if (local) setCloudState('local-only')
      else setCloudState('idle')

      if (!next) {
        const failure = [localResult, cloudResult].find((result) => result.status === 'rejected')
        if (failure?.status === 'rejected') throw failure.reason
      }
      return next
    } catch (refreshError) {
      if (generation === generationRef.current) {
        setError(errorMessage(refreshError, 'Failed to load Classroom data.'))
      }
      return null
    } finally {
      if (generation === generationRef.current) setIsLoading(false)
    }
  }, [desktop, enabled, ownerId])

  useEffect(() => {
    if (!enabled || !ownerId) {
      setSnapshot(null)
      setBrowsers([])
      setSyncStatus(null)
      setCloudState('idle')
      setIsLoading(false)
      setOperationBusy(false)
      setError(null)
      return
    }
    void refresh()
    if (!desktop) return
    const statusGeneration = ++statusGenerationRef.current
    void Promise.allSettled([
      detectClassroomBrowsers(),
      getClassroomSyncStatus(),
    ]).then(([browserResult, statusResult]) => {
      if (statusGeneration !== statusGenerationRef.current) return
      if (browserResult.status === 'fulfilled') setBrowsers(browserResult.value)
      if (statusResult.status === 'fulfilled') commitSyncStatus(statusResult.value)
    })
    return () => {
      if (statusGeneration === statusGenerationRef.current) statusGenerationRef.current += 1
    }
  }, [commitSyncStatus, desktop, enabled, ownerId, refresh])

  useEffect(() => {
    if (!desktop || (!operationBusy && (!syncStatus || !ACTIVE_PHASES.has(syncStatus.phase)))) return
    const statusGeneration = statusGenerationRef.current
    const poll = () => {
      void getClassroomSyncStatus()
        .then((status) => {
          if (statusGeneration === statusGenerationRef.current) commitSyncStatus(status)
        })
        .catch(() => {})
    }
    poll()
    const interval = window.setInterval(() => {
      poll()
    }, 1_000)
    return () => window.clearInterval(interval)
  }, [commitSyncStatus, desktop, operationBusy, syncStatus?.phase])

  const syncSnapshotToCloud = useCallback(async (nextSnapshot: ClassroomSnapshot) => {
    if (!isStrongSnapshot(nextSnapshot)) {
      setCloudState('local-only')
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setCloudState('local-only')
      return
    }
    setCloudState('uploading')
    try {
      await uploadCloudSnapshot(nextSnapshot)
      setCloudState('synced')
    } catch (uploadError) {
      setCloudState('error')
      setError(errorMessage(uploadError, 'Classroom data was saved locally but cloud sync failed.'))
    }
  }, [])

  const reloadAfterDesktopSync = useCallback(async (status: ClassroomSyncStatus) => {
    commitSyncStatus(status)
    if (!ownerId || (status.phase !== 'completed' && status.phase !== 'partial')) return
    const local = await readClassroomDataCache(ownerId)
    if (!local) return
    setSnapshot((current) => chooseSnapshot(current, local))
    await syncSnapshotToCloud(local)
  }, [commitSyncStatus, ownerId, syncSnapshotToCloud])

  const startSync = useCallback(async ({ browserId, keepSignedIn }: StartGoogleClassroomSyncInput) => {
    if (!desktop || !ownerId) {
      setError('Google Classroom sync requires Millennium Desktop.')
      return
    }
    const statusGeneration = ++statusGenerationRef.current
    setError(null)
    setOperationBusy(true)
    const browser = browsers.find((entry) => entry.id === browserId) || null
    setSyncStatus(launchingStatus(browser, keepSignedIn))
    try {
      const status = await startClassroomSync({ browserId, keepSignedIn, ownerId })
      if (statusGeneration === statusGenerationRef.current) commitSyncStatus(status)
    } catch (syncError) {
      if (statusGeneration !== statusGenerationRef.current) return
      setError(errorMessage(syncError, 'Failed to start Classroom sync.'))
      const status = await getClassroomSyncStatus().catch(() => null)
      if (status && statusGeneration === statusGenerationRef.current) commitSyncStatus(status)
    } finally {
      if (statusGeneration === statusGenerationRef.current) setOperationBusy(false)
    }
  }, [browsers, commitSyncStatus, desktop, ownerId])

  const continueSync = useCallback(async () => {
    if (!desktop) return
    const statusGeneration = ++statusGenerationRef.current
    setError(null)
    setOperationBusy(true)
    try {
      setSyncStatus((current) => current ? {
        ...current,
        phase: 'scraping',
        message: 'Reading your Google Classroom courses and classwork…',
      } : current)
      const status = await continueClassroomSync()
      if (statusGeneration === statusGenerationRef.current) await reloadAfterDesktopSync(status)
    } catch (syncError) {
      if (statusGeneration !== statusGenerationRef.current) return
      setError(errorMessage(syncError, 'Classroom sync failed.'))
      const status = await getClassroomSyncStatus().catch(() => null)
      if (status && statusGeneration === statusGenerationRef.current) setSyncStatus(status)
    } finally {
      if (statusGeneration === statusGenerationRef.current) setOperationBusy(false)
    }
  }, [desktop, reloadAfterDesktopSync])

  const checkBrowserPermission = useCallback(async (): Promise<ClassroomBrowserPermission> => {
    const browserId = syncStatus?.browser?.id
    if (!browserId) throw new Error('The active Classroom browser could not be verified.')
    return getClassroomBrowserPermission(browserId)
  }, [syncStatus?.browser?.id])

  const requestBrowserPermission = useCallback(async (): Promise<ClassroomBrowserPermission> => {
    const browserId = syncStatus?.browser?.id
    if (!browserId) throw new Error('The active Classroom browser could not be verified.')
    return requestClassroomBrowserPermission(browserId)
  }, [syncStatus?.browser?.id])

  const openBrowserPermissionSettings = useCallback(async (): Promise<void> => {
    await openClassroomBrowserPermissionSettings()
  }, [])

  // Diagnostics and repair run before a sync exists, so they fall back to the browser the user is
  // about to pick rather than requiring an active operation.
  const permissionTargetId = syncStatus?.browser?.id || browsers[0]?.id

  const readBrowserPermissionDiagnostics = useCallback(
    async (browserId?: ClassroomBrowserId): Promise<ClassroomAutomationDiagnostics> => {
      const targetId = browserId || permissionTargetId
      if (!targetId) throw new Error('No supported browser was detected on this device.')
      return getClassroomAutomationDiagnostics(targetId)
    },
    [permissionTargetId],
  )

  const repairBrowserPermission = useCallback(
    async (browserId?: ClassroomBrowserId): Promise<ClassroomAutomationRepair> => {
      const targetId = browserId || permissionTargetId
      if (!targetId) throw new Error('No supported browser was detected on this device.')
      return repairClassroomAutomation(targetId)
    },
    [permissionTargetId],
  )

  const cancelSync = useCallback(async () => {
    if (!desktop) return
    const statusGeneration = ++statusGenerationRef.current
    setError(null)
    try {
      const status = await cancelClassroomSync()
      if (statusGeneration === statusGenerationRef.current) commitSyncStatus(status)
    } catch (cancelError) {
      if (statusGeneration === statusGenerationRef.current) {
        setError(errorMessage(cancelError, 'Failed to cancel Classroom sync.'))
      }
    } finally {
      if (statusGeneration === statusGenerationRef.current) setOperationBusy(false)
    }
  }, [commitSyncStatus, desktop])

  const disconnect = useCallback(async () => {
    if (!desktop || !ownerId) return
    const statusGeneration = ++statusGenerationRef.current
    setError(null)
    try {
      const status = await disconnectClassroomProfile(ownerId)
      if (statusGeneration === statusGenerationRef.current) commitSyncStatus(status)
    } catch (disconnectError) {
      setError(errorMessage(disconnectError, 'Failed to disconnect Classroom browser profile.'))
      throw disconnectError
    }
  }, [commitSyncStatus, desktop, ownerId])

  const deleteData = useCallback(async () => {
    if (!ownerId) return
    setError(null)
    const response = await fetch('/api/classroom/data', {
      method: 'DELETE',
      credentials: 'same-origin',
    })
    const body = await response.json().catch(() => null) as { message?: string } | null
    if (!response.ok) throw new Error(body?.message || 'Failed to delete Classroom data.')
    if (desktop) await clearClassroomDataCache(ownerId)
    setSnapshot(null)
    setCloudState('idle')
  }, [desktop, ownerId])

  const items = snapshot?.items || []
  const courses = snapshot?.courses || []
  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  )
  const missingItems = useMemo(
    () => items.filter((item) => item.submission?.status === 'missing'),
    [items],
  )
  const assignedItems = useMemo(
    () => items.filter((item) => item.kind === 'assignment' && (!item.submission || ['assigned', 'missing', 'unknown'].includes(item.submission.status))),
    [items],
  )
  const recentItems = useMemo(
    () => [...items].sort((a, b) => Date.parse(b.postedAt || b.dueAt || '') - Date.parse(a.postedAt || a.dueAt || '')).slice(0, 20),
    [items],
  )

  return {
    snapshot,
    courses,
    items,
    courseById,
    missingItems,
    assignedItems,
    recentItems,
    browsers,
    syncStatus,
    cloudState,
    isDesktop: desktop,
    isLoading,
    isSyncing: operationBusy || Boolean(syncStatus && ACTIVE_PHASES.has(syncStatus.phase)),
    error,
    refresh,
    startSync,
    checkBrowserPermission,
    requestBrowserPermission,
    openBrowserPermissionSettings,
    readBrowserPermissionDiagnostics,
    repairBrowserPermission,
    continueSync,
    cancelSync,
    disconnect,
    deleteData,
  }
}

export type GoogleClassroomController = ReturnType<typeof useGoogleClassroom>
