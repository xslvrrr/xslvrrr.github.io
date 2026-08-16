import { clearPortalDataCache, readPortalDataCache, writePortalDataCache } from '@/lib/desktop/storage';
import { mergePortalData } from '@/lib/portal-data-merge';
import {
  clearUltraRunClientLock,
  startUltraRunClientLock,
  toPortalSyncOptions,
  type PortalDataSettings,
} from '@/lib/data-settings';
import type { PortalData } from '@/types/portal';

export type UltraRunStatusKind = 'idle' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
export type UltraRunCancelMode = 'keep' | 'erase';

export interface UltraRunStatus {
  id: string;
  status: UltraRunStatusKind;
  startYear: number;
  endYear: number;
  currentYear?: number;
  completedYears: number;
  totalYears: number;
  progress: number;
  message: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
}

export interface StartUltraRunOptions {
  settings: PortalDataSettings;
  startYear: number;
  endYear: number;
  baselineData?: PortalData | null;
  onPortalDataUpdated?: (data: PortalData | null) => void;
}

const STATUS_STORAGE_KEY = 'millennium-ultra-run-status-v1';
const STATUS_EVENT = 'millennium-ultra-run-status-change';
export const ULTRA_RUN_CANCEL_REQUEST_EVENT = 'millennium-ultra-run-cancel-requested';
export const PORTAL_DATA_UPDATED_EVENT = 'millennium-portal-data-updated';
const SYNC_TOAST_ID = 'millennium-sync-status-toast';
const INITIAL_YEAR_ESTIMATE_MS = 45_000;

let activeRun: Promise<PortalData | null> | null = null;
let activeController: AbortController | null = null;
let cancelMode: UltraRunCancelMode | null = null;
let rollbackBaseline: PortalData | null | undefined;

function nowIso() {
  return new Date().toISOString();
}

function readStoredStatus(): UltraRunStatus | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STATUS_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UltraRunStatus;
  } catch {
    window.localStorage.removeItem(STATUS_STORAGE_KEY);
    return null;
  }
}

function writeStatus(status: UltraRunStatus | null) {
  if (typeof window === 'undefined') return;
  if (status) {
    window.localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(status));
  } else {
    window.localStorage.removeItem(STATUS_STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: status }));
}

function patchStatus(patch: Partial<UltraRunStatus>) {
  const current = readStoredStatus();
  if (!current) return;
  writeStatus({ ...current, ...patch, updatedAt: nowIso() });
}

function emitPortalDataUpdated(data: PortalData | null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PORTAL_DATA_UPDATED_EVENT, { detail: data }));
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function fetchUltraYear(settings: PortalDataSettings, year: number, signal: AbortSignal): Promise<PortalData> {
  const syncOptions = toPortalSyncOptions({
    ...settings,
    includeTimetable: true,
    includeNotices: true,
    includeGrades: true,
    includeAttendance: true,
    includeReports: true,
    includeClasses: true,
    includeCalendar: true,
    reportsYearLookback: 12,
    attendanceYearLookback: 12,
    gradeItemLimit: 0,
    ultraRun: {
      startYear: year,
      endYear: year,
    },
  });

  const response = await fetch('/api/portal/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ syncOptions }),
    signal,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || `Ultra run failed while syncing ${year}`);
  }

  return data as PortalData;
}

async function restorePortalData(data: PortalData | null | undefined): Promise<PortalData | null> {
  if (!data) {
    await clearPortalDataCache();
    await fetch('/api/portal/data?keepSavedLogin=true', { method: 'DELETE' }).catch(() => null);
    return null;
  }

  await writePortalDataCache(data);
  const response = await fetch('/api/portal/data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ portalData: data }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.message || 'Failed to restore portal data');
  }
  return data;
}

export function getUltraRunStatus(): UltraRunStatus | null {
  return readStoredStatus();
}

export function clearUltraRunStatus() {
  writeStatus(null);
}

export function subscribeUltraRunStatus(listener: (status: UltraRunStatus | null) => void) {
  if (typeof window === 'undefined') return () => {};
  const handleStatus = (event: Event) => {
    listener((event as CustomEvent<UltraRunStatus | null>).detail ?? readStoredStatus());
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STATUS_STORAGE_KEY) listener(readStoredStatus());
  };
  window.addEventListener(STATUS_EVENT, handleStatus);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(STATUS_EVENT, handleStatus);
    window.removeEventListener('storage', handleStorage);
  };
}

export function requestUltraRunCancel() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ULTRA_RUN_CANCEL_REQUEST_EVENT));
}

export function cancelUltraRun(mode: UltraRunCancelMode) {
  if (!activeRun) {
    patchStatus({
      status: 'failed',
      message: 'This ultra run is no longer active in this tab. Start it again if needed.',
      error: 'This ultra run is no longer active in this tab. Start it again if needed.',
    });
    return;
  }

  cancelMode = mode;
  patchStatus({
    status: 'cancelling',
    message: mode === 'erase'
      ? 'Cancelling ultra run and preparing to erase synced chunks...'
      : 'Cancelling ultra run and keeping completed chunks...',
  });
  activeController?.abort();
}

export async function startUltraRun(options: StartUltraRunOptions): Promise<PortalData | null> {
  if (activeRun) return activeRun;

  const years = Array.from(
    { length: options.endYear - options.startYear + 1 },
    (_, index) => options.startYear + index,
  );
  const startedAt = nowIso();
  const runId = `${Date.now()}-${options.startYear}-${options.endYear}`;
  const cachedBaseline = await readPortalDataCache().catch(() => null);
  // Each completed chunk replaces the whole database snapshot, so the run may
  // only start from a baseline that was confirmed against the database. A 404
  // is a real answer (nothing synced yet); anything else is not.
  const baselineResponse = await fetch('/api/portal/data', { cache: 'no-store' }).catch(() => null);
  if (!baselineResponse || (!baselineResponse.ok && baselineResponse.status !== 404)) {
    throw new Error('Could not read your saved Millennium data. Ultra run was not started.');
  }
  const serverBaseline = baselineResponse.ok
    ? await baselineResponse.json().catch(() => null)
    : null;
  if (baselineResponse.ok && !serverBaseline) {
    throw new Error('Could not read your saved Millennium data. Ultra run was not started.');
  }
  const durableBaseline = mergePortalData(mergePortalData(cachedBaseline, options.baselineData), serverBaseline);

  rollbackBaseline = durableBaseline;
  cancelMode = null;
  startUltraRunClientLock();

  writeStatus({
    id: runId,
    status: 'running',
    startYear: options.startYear,
    endYear: options.endYear,
    completedYears: 0,
    totalYears: years.length,
    progress: 1,
    message: `Starting ultra run for ${options.startYear}-${options.endYear}...`,
    startedAt,
    updatedAt: startedAt,
  });

  activeRun = (async () => {
    let latestData: PortalData | null = durableBaseline;
    const completedYearDurations: number[] = [];

    try {
      for (const [index, year] of years.entries()) {
        if (cancelMode) break;
        activeController = new AbortController();
        patchStatus({
          status: 'running',
          currentYear: year,
          progress: Math.max(1, (index / years.length) * 100),
          message: `Syncing ${year} (${index + 1} of ${years.length})...`,
        });

        const yearStartedAt = Date.now();
        const estimatedYearDuration = completedYearDurations.length
          ? completedYearDurations.reduce((sum, duration) => sum + duration, 0) / completedYearDurations.length
          : INITIAL_YEAR_ESTIMATE_MS;
        const progressTimer = window.setInterval(() => {
          const elapsed = Date.now() - yearStartedAt;
          // Keep moving during long portal requests without claiming current year is done.
          const currentYearProgress = Math.min(0.95, elapsed / Math.max(estimatedYearDuration, elapsed + 5_000));
          patchStatus({ progress: ((index + currentYearProgress) / years.length) * 100 });
        }, 500);

        try {
          const yearData = await fetchUltraYear(options.settings, year, activeController.signal);
          latestData = mergePortalData(latestData, yearData);
        } catch (error) {
          if (cancelMode || isAbortError(error)) break;
          throw error;
        } finally {
          window.clearInterval(progressTimer);
        }

        completedYearDurations.push(Date.now() - yearStartedAt);

        await restorePortalData(latestData);
        options.onPortalDataUpdated?.(latestData);
        emitPortalDataUpdated(latestData);
        patchStatus({
          completedYears: index + 1,
          progress: Math.round(((index + 1) / years.length) * 100),
          message: `Finished ${year} (${index + 1} of ${years.length}).`,
        });
      }

      if (cancelMode) {
        let restoredData = latestData;
        if (cancelMode === 'erase') {
          restoredData = await restorePortalData(rollbackBaseline);
          options.onPortalDataUpdated?.(restoredData);
          emitPortalDataUpdated(restoredData);
        }

        patchStatus({
          status: 'cancelled',
          progress: cancelMode === 'erase' ? 0 : readStoredStatus()?.progress ?? 0,
          message: cancelMode === 'erase'
            ? 'Ultra run cancelled. Synced chunks from this run were erased.'
            : 'Ultra run cancelled. Completed chunks were kept.',
        });
        return restoredData ?? null;
      }

      patchStatus({
        status: 'completed',
        completedYears: years.length,
        progress: 100,
        message: `Ultra run finished for ${options.startYear}-${options.endYear}.`,
      });
      return latestData;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ultra run failed';
      patchStatus({
        status: 'failed',
        error: message,
        message,
      });
      throw error;
    } finally {
      activeController = null;
      activeRun = null;
      cancelMode = null;
      rollbackBaseline = undefined;
      clearUltraRunClientLock();
    }
  })();

  return activeRun;
}

export function getSyncToastId() {
  return SYNC_TOAST_ID;
}
