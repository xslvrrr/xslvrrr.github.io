import type { DesktopClassroomSnapshot } from '@/types/desktop'

export type ClassroomBrowserId = 'chrome' | 'chromium' | 'edge'

export interface ClassroomBrowser {
  id: ClassroomBrowserId
  name: string
}

export type ClassroomBrowserPermission =
  | 'not-required'
  | 'prompt-required'
  /** The system cannot show its prompt for this build; access must come from system settings. */
  | 'prompt-unavailable'
  /** macOS found no running browser process, so it has nothing to ask about. Not a denial. */
  | 'browser-not-running'
  | 'granted'
  | 'denied'
  | 'unavailable'

/**
 * Why macOS has not granted browser automation access.
 *
 * Millennium Desktop is ad-hoc signed rather than notarised, so the common failure is
 * environmental rather than a user decision: a quarantined or App Translocated copy never reaches
 * the automation prompt, and Privacy & Security > Automation has no control for adding an entry by
 * hand. Each flag maps to a recovery step the permission dialog can actually offer.
 */
export interface ClassroomAutomationDiagnostics {
  /** False on platforms that do not gate browser reading behind a privacy setting. */
  required: boolean
  permission: ClassroomBrowserPermission
  /** Raw macOS OSStatus behind `permission`, for support reports. */
  statusCode: number
  bundleIdentifier: string
  bundlePath: string | null
  browserName: string
  isPackaged: boolean
  isQuarantined: boolean
  isTranslocated: boolean
  isInApplications: boolean
  signatureValid: boolean
  hasUsageDescription: boolean
  browserRunning: boolean
  canRepair: boolean
}

export interface ClassroomAutomationRepair {
  quarantineCleared: boolean
  permissionReset: boolean
  notes: string[]
  diagnostics: ClassroomAutomationDiagnostics
}

export type ClassroomSyncPhase =
  | 'idle'
  | 'launching'
  | 'awaiting-login'
  | 'scraping'
  | 'saving-locally'
  | 'completed'
  | 'partial'
  | 'cancelled'
  | 'error'

export type ClassroomLocalSnapshotState =
  | 'unknown'
  | 'missing'
  | 'existing'
  | 'saving'
  | 'saved'
  | 'preserved'

export type ClassroomCloudSyncState = 'deferred'

export interface ClassroomSyncStatus {
  phase: ClassroomSyncPhase
  operationId: string | null
  browser: ClassroomBrowser | null
  keepSignedIn: boolean
  coursesFound: number
  itemsFound: number
  localSnapshotAvailable: boolean | null
  localSnapshotState: ClassroomLocalSnapshotState
  cloudSyncState: ClassroomCloudSyncState
  errorCode: string | null
  message: string | null
}

export interface ClassroomCommandError {
  code: string
  message: string
  retryable: boolean
}

export interface StartClassroomSyncInput {
  browserId: ClassroomBrowserId
  keepSignedIn: boolean
  ownerId: string
}

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false
  const tauriWindow = window as typeof window & {
    __TAURI__?: unknown
    __TAURI_INTERNALS__?: unknown
    isTauri?: boolean
  }
  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__ || tauriWindow.isTauri)
}

async function invokeClassroom<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw {
      code: 'DESKTOP_REQUIRED',
      message: 'Classroom browser sync requires Millennium Desktop.',
      retryable: false,
    } satisfies ClassroomCommandError
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export function detectClassroomBrowsers(): Promise<ClassroomBrowser[]> {
  return invokeClassroom<ClassroomBrowser[]>('detect_classroom_browsers')
}

export function getClassroomBrowserPermission(
  browserId: ClassroomBrowserId,
): Promise<ClassroomBrowserPermission> {
  return invokeClassroom<ClassroomBrowserPermission>('get_classroom_browser_permission', { browserId })
}

export function requestClassroomBrowserPermission(
  browserId: ClassroomBrowserId,
): Promise<ClassroomBrowserPermission> {
  return invokeClassroom<ClassroomBrowserPermission>('request_classroom_browser_permission', { browserId })
}

/**
 * Opens the operating-system privacy pane that grants browser reading.
 *
 * macOS shows its automation prompt at most once per application and target, so after a denial
 * the in-app dialog can only send the user to system settings.
 */
export function openBrowserPermissionSettings(): Promise<void> {
  return invokeClassroom<void>('open_browser_permission_settings')
}

export function getClassroomAutomationDiagnostics(
  browserId: ClassroomBrowserId,
): Promise<ClassroomAutomationDiagnostics> {
  return invokeClassroom<ClassroomAutomationDiagnostics>('get_classroom_automation_diagnostics', { browserId })
}

/**
 * Clears the download quarantine flag on Millennium's own bundle and resets its stored automation
 * decision, which is the only supported way to make macOS present the prompt again after a denial.
 */
export function repairClassroomAutomation(
  browserId: ClassroomBrowserId,
): Promise<ClassroomAutomationRepair> {
  return invokeClassroom<ClassroomAutomationRepair>('repair_classroom_automation', { browserId })
}

export function startClassroomSync(request: StartClassroomSyncInput): Promise<ClassroomSyncStatus> {
  return invokeClassroom<ClassroomSyncStatus>('start_classroom_sync', { request })
}

export function continueClassroomSync(): Promise<ClassroomSyncStatus> {
  return invokeClassroom<ClassroomSyncStatus>('continue_classroom_sync')
}

export function getClassroomSyncStatus(): Promise<ClassroomSyncStatus> {
  return invokeClassroom<ClassroomSyncStatus>('get_classroom_sync_status')
}

export function cancelClassroomSync(): Promise<ClassroomSyncStatus> {
  return invokeClassroom<ClassroomSyncStatus>('cancel_classroom_sync')
}

export function disconnectClassroomProfile(ownerId: string): Promise<ClassroomSyncStatus> {
  return invokeClassroom<ClassroomSyncStatus>('disconnect_classroom', { ownerId })
}

export function readSavedClassroomSnapshot(ownerId: string): Promise<DesktopClassroomSnapshot | null> {
  return invokeClassroom<DesktopClassroomSnapshot | null>('read_saved_classroom_snapshot', { ownerId })
}

export function deleteSavedClassroomSnapshot(ownerId: string): Promise<void> {
  return invokeClassroom<void>('delete_saved_classroom_snapshot', { ownerId })
}
