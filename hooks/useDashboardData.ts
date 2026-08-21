import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppRouter as useRouter } from '@/start/router';
import type { DesktopIdentity } from '../types/desktop';
import type { PortalData, UserSession } from '../types/portal';
import {
  clearAllDesktopData,
  clearDesktopOwnerData,
  clearPortalDataCache,
  readDesktopIdentity,
  readPortalDataCache,
  readPortalDataCacheEntry,
  rememberPortalCacheOwner,
  writePortalDataCache,
} from '../lib/desktop/storage';
import { previewPortalData, previewSession } from '../lib/dashboard-preview-data';
import { getDataFetchIntervalMs, isUltraRunClientLocked, readDataSettings, toPortalSyncOptions } from '../lib/data-settings';
import { notifyPortalSyncError, notifyPortalSyncSuccess } from '../components/PortalSyncStatusToasts';
import { mergePortalData } from '../lib/portal-data-merge';
import { PORTAL_DATA_UPDATED_EVENT } from '../lib/portal-sync-status';
import {
  emitTeacherChanges,
  toTeacherChangeSummary,
  type TeacherChangeSummary,
} from './useTeacherChanges';
import { fetchJsonWithTimeout, fetchWithTimeout } from '../lib/http';
import { disconnectClassroomProfile } from '../lib/desktop/classroom';
import {
  clearDesktopLogoutPending,
  markDesktopLogoutPending,
} from '../lib/desktop/logout-lock';
import { isDesktopApp } from '../lib/desktop/utils';
import { useDesktopBootstrap } from './useDesktopBootstrap';

const CLIENT_SYNC_LEASE_KEY = 'millennium-portal-sync-client-lease-v1';
const CLIENT_SYNC_LEASE_MS = 30_000;
const SESSION_TIMEOUT_MS = 5_000;
// Allow serverless cold starts and large durable portal snapshots to complete.
const DATA_READ_TIMEOUT_MS = 30_000;
const SYNC_TIMEOUT_MS = 200_000;
let portalDataReadFlight: Promise<PortalData | null> | null = null;
let portalDataReadVersion: string | null = null;

function portalDataMatchesSession(data: PortalData | null, session: UserSession | null): boolean {
  if (!data || !session) return !!data;
  const dataOwnerId = data.userId?.trim();
  const sessionOwnerId = session.userId?.trim();
  if (dataOwnerId && sessionOwnerId && dataOwnerId !== sessionOwnerId) return false;
  const dataUser = data.user;
  if (!dataUser) return true;
  const dataName = dataUser.name?.trim().toLowerCase();
  const dataUsername = data.account?.username?.trim().toLowerCase();
  const sessionName = session.username?.trim().toLowerCase();
  const dataSchool = dataUser.school?.trim().toLowerCase();
  const sessionSchool = session.school?.trim().toLowerCase();
  const dataUid = dataUser.uid?.trim();
  const sessionUid = session.portalUid?.trim();
  if (dataUid && sessionUid && dataUid !== sessionUid) return false;
  const hasStableIdentity = Boolean(
    (dataOwnerId && sessionOwnerId)
    || (dataUid && sessionUid),
  );
  if (!hasStableIdentity && dataName && sessionName && dataName !== sessionName && dataUsername !== sessionName) return false;
  if (dataSchool && sessionSchool && dataSchool !== sessionSchool) return false;
  return true;
}

function sessionCacheOwner(session: UserSession | null): string | undefined {
  return session?.userId?.trim() || session?.portalUid?.trim() || undefined;
}

function createDesktopSession(
  identity: DesktopIdentity | null,
  cached: PortalData | null,
  isOffline: boolean,
): UserSession | null {
  if (!identity) return null;
  return {
    loggedIn: true,
    userId: identity.ownerId,
    username: cached?.account?.username || identity.displayName || cached?.user?.name || 'Student',
    school: identity.school || cached?.user?.school || '',
    role: identity.role || 'user',
    portalUid: identity.portalUid || cached?.user?.uid,
    timestamp: identity.lastBootstrapAt || cached?.lastUpdated || identity.lastAuthenticatedAt,
    offline: isOffline,
  };
}

function dataAgeMs(data: PortalData | null, now = Date.now()): number {
  const updatedAt = Date.parse(data?.lastUpdated || '');
  if (!Number.isFinite(updatedAt)) return Number.POSITIVE_INFINITY;
  const age = now - updatedAt;
  if (age < -5 * 60_000) return Number.POSITIVE_INFINITY;
  return Math.max(0, age);
}

function isFresh(data: PortalData | null, intervalMs: number): boolean {
  if ((data as any)?.sync?.degraded === true || (data as any)?.syncMeta?.degraded === true) return false;
  return dataAgeMs(data) < intervalMs;
}

function randomOwnerId(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function acquireClientLease(ownerId: string): boolean {
  if (typeof window === 'undefined') return true;
  const now = Date.now();
  try {
    const current = JSON.parse(window.localStorage.getItem(CLIENT_SYNC_LEASE_KEY) || 'null');
    if (current?.ownerId !== ownerId && Number(current?.expiresAt) > now) return false;
    window.localStorage.setItem(CLIENT_SYNC_LEASE_KEY, JSON.stringify({ ownerId, expiresAt: now + CLIENT_SYNC_LEASE_MS }));
    const confirmed = JSON.parse(window.localStorage.getItem(CLIENT_SYNC_LEASE_KEY) || 'null');
    return confirmed?.ownerId === ownerId;
  } catch {
    return true;
  }
}

function releaseClientLease(ownerId: string) {
  if (typeof window === 'undefined') return;
  try {
    const current = JSON.parse(window.localStorage.getItem(CLIENT_SYNC_LEASE_KEY) || 'null');
    if (current?.ownerId === ownerId) window.localStorage.removeItem(CLIENT_SYNC_LEASE_KEY);
  } catch {
    window.localStorage.removeItem(CLIENT_SYNC_LEASE_KEY);
  }
}

function isClientLeaseActive(ownerId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const current = JSON.parse(window.localStorage.getItem(CLIENT_SYNC_LEASE_KEY) || 'null');
    return current?.ownerId !== ownerId && Number(current?.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

async function waitForClientLease(ownerId: string, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + CLIENT_SYNC_LEASE_MS + 1_000;
  while (isClientLeaseActive(ownerId) && Date.now() < deadline && !signal.aborted) {
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
}

function friendlySyncError(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return 'Millennium sync timed out. Saved dashboard data remains available.';
  }
  return error instanceof Error ? error.message : 'Millennium sync failed.';
}

function clearBrowserSessionStorage(): void {
  try {
    window.localStorage.clear();
  } catch {
    // Native encrypted storage remains authoritative.
  }
  try {
    window.sessionStorage.clear();
  } catch {
    // Session storage may be unavailable in restricted webviews.
  }
}

export function useDashboardData(preview = false) {
  const routerPush = useRouter().push;
  const desktopBoot = useDesktopBootstrap();
  const [session, setSessionState] = useState<UserSession | null>(() => preview ? previewSession : null);
  const [isLoading, setIsLoading] = useState(!preview);
  const [portalData, setPortalDataState] = useState<PortalData | null>(() => preview ? previewPortalData : null);
  const [dataLoading, setDataLoading] = useState(false);
  const [isExternalSyncRunning, setIsExternalSyncRunning] = useState(false);
  const sessionRef = useRef<UserSession | null>(preview ? previewSession : null);
  const portalDataRef = useRef<PortalData | null>(preview ? previewPortalData : null);
  const syncFlightRef = useRef<Promise<void> | null>(null);
  const syncAbortRef = useRef<AbortController | null>(null);
  const syncGenerationRef = useRef(0);
  const ownerIdRef = useRef(randomOwnerId());
  // Tracks whether the snapshot in memory came from a full server read. Sync
  // responses only carry changed sections, so an unverified snapshot must never
  // be treated as the durable history.
  const snapshotCompleteRef = useRef(preview);
  const consecutiveFailuresRef = useRef(0);
  const nextAttemptAtRef = useRef(0);

  const setSession = useCallback((next: UserSession | null) => {
    if (sessionRef.current?.userId && next?.userId && sessionRef.current.userId !== next.userId) {
      syncGenerationRef.current += 1;
      syncAbortRef.current?.abort();
    }
    sessionRef.current = next;
    setSessionState(next);
  }, []);

  const setPortalData = useCallback((next: PortalData | null, complete = true) => {
    portalDataRef.current = next;
    snapshotCompleteRef.current = next ? complete : false;
    setPortalDataState(next);
  }, []);

  const commitPortalData = useCallback((
    next: PortalData,
    options: { complete?: boolean; force?: boolean } = {},
  ): boolean => {
    const current = portalDataRef.current;
    const currentTime = Date.parse(current?.lastUpdated || '');
    const nextTime = Date.parse(next?.lastUpdated || '');
    if (
      !options.force
      && current
      && Number.isFinite(currentTime)
      && (!Number.isFinite(nextTime) || nextTime < currentTime)
    ) return false;
    setPortalData(next, options.complete !== false);
    return true;
  }, [setPortalData]);

  const readServerPortalData = useCallback(async (
    knownData: PortalData | null = null,
    options: { full?: boolean } = {},
  ): Promise<PortalData | null> => {
    // A full read skips the `since` revalidation shortcut. Without it a locally
    // truncated snapshot whose timestamp already matches the database would get
    // a 304 on every load and could never be repaired without signing in again.
    const knownVersion = options.full ? '' : (knownData?.lastUpdated || '');
    const flightKey = options.full ? 'full' : knownVersion;
    if (portalDataReadFlight && portalDataReadVersion === flightKey) return portalDataReadFlight;
    const flight = (async () => {
      const query = knownVersion ? `?since=${encodeURIComponent(knownVersion)}` : '';
      const { response, data } = await fetchJsonWithTimeout<any>(`/api/portal/data${query}`, {
        cache: options.full ? 'no-store' : 'no-cache',
        timeout: DATA_READ_TIMEOUT_MS,
      });
      if (response.status === 304) return knownData;
      if (!response.ok) return null;
      return data && typeof data === 'object' && !data.needsSync ? data as PortalData : null;
    })();
    portalDataReadFlight = flight;
    portalDataReadVersion = flightKey;
    try {
      return await flight;
    } finally {
      if (portalDataReadFlight === flight) {
        portalDataReadFlight = null;
        portalDataReadVersion = null;
      }
    }
  }, []);

  const hydrateSavedPortalData = useCallback(async (includeServer = true): Promise<PortalData | null> => {
    const cacheOwner = sessionCacheOwner(sessionRef.current);
    const cachedEntry = await readPortalDataCacheEntry(cacheOwner).catch(() => null);
    const cached = cachedEntry?.data ?? null;
    const safeCached = cached && portalDataMatchesSession(cached, sessionRef.current) ? cached : null;
    if (safeCached) commitPortalData(safeCached, { complete: cachedEntry?.complete === true });
    if (!includeServer || (typeof navigator !== 'undefined' && navigator.onLine === false)) return safeCached;

    // Anything short of a verified full snapshot must be repaired from the
    // database rather than revalidated against its own timestamp.
    const needsFullRead = !safeCached || cachedEntry?.complete !== true;
    const serverData = await readServerPortalData(safeCached, { full: needsFullRead }).catch(() => null);
    if (!serverData) return safeCached;
    if (!portalDataMatchesSession(serverData, sessionRef.current)) return safeCached;
    // Only override the monotonic timestamp guard while the snapshot in memory
    // is still unverified: a verified newer one must win.
    if (commitPortalData(serverData, { complete: true, force: needsFullRead && !snapshotCompleteRef.current })) {
      await writePortalDataCache(serverData, cacheOwner).catch(() => {});
    }
    return serverData;
  }, [commitPortalData, readServerPortalData]);

  useEffect(() => {
    if (preview || typeof window === 'undefined') return;
    const handlePortalDataUpdated = (event: Event) => {
      const next = (event as CustomEvent<PortalData | null>).detail ?? null;
      if (next && portalDataMatchesSession(next, sessionRef.current) && commitPortalData(next)) {
        void writePortalDataCache(next, sessionCacheOwner(sessionRef.current));
      }
      if (!next) setPortalData(null);
    };
    window.addEventListener(PORTAL_DATA_UPDATED_EVENT, handlePortalDataUpdated);
    return () => window.removeEventListener(PORTAL_DATA_UPDATED_EVENT, handlePortalDataUpdated);
  }, [commitPortalData, preview, setPortalData]);

  const checkSession = useCallback(async () => {
    if (preview) return;
    if (isDesktopApp()) {
      const desktopIdentity = desktopBoot.identity || await readDesktopIdentity().catch(() => null);
      const cached = desktopIdentity
        ? await readPortalDataCache(desktopIdentity.ownerId).catch(() => null)
        : null;
      if (cached) commitPortalData(cached);
      const canUseDesktopSession = desktopBoot.status === 'online-authenticated'
        || desktopBoot.status === 'cache-ready-offline'
        || (desktopBoot.status === 'reauth-required' && desktopBoot.hasCachedData);
      const desktopSession = canUseDesktopSession
        ? createDesktopSession(
            desktopIdentity,
            cached,
            desktopBoot.status !== 'online-authenticated',
          )
        : null;
      setSession(desktopSession);
      setIsLoading(false);
      if (!desktopSession && desktopBoot.status !== 'booting') routerPush('/login');
      return;
    }

    try {
      const { response, data: sessionData } = await fetchJsonWithTimeout<any>('/api/app/session', {
        timeout: SESSION_TIMEOUT_MS,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(sessionData?.message || 'Session check failed');
      if (!sessionData?.loggedIn) {
        await clearPortalDataCache().catch(() => {});
        routerPush('/login');
        return;
      }

      const cacheOwner = sessionCacheOwner(sessionData);
      rememberPortalCacheOwner(cacheOwner);
      const existingEntry = await readPortalDataCacheEntry(cacheOwner).catch(() => null);
      const existingCached = existingEntry?.data ?? null;
      const cached = existingCached && portalDataMatchesSession(existingCached, sessionData)
        ? existingCached
        : null;
      if (cached) setPortalData(cached, existingEntry?.complete === true);

      // Every dashboard mount performs exactly one authoritative Supabase read.
      // Cache may render first, but never replaces durable history hydration.
      const needsFullRead = !cached || existingEntry?.complete !== true;
      const serverData = await readServerPortalData(cached, { full: needsFullRead }).catch(() => null);
      if (serverData && portalDataMatchesSession(serverData, sessionData)) {
        setPortalData(serverData, true);
        await writePortalDataCache(serverData, cacheOwner).catch(() => {});
      }

      // Set session last. Dashboard sync effect now sees hydrated server data and
      // cannot race this read with another /api/portal/data request.
      setSession(sessionData);
      setIsLoading(false);
      return;
    } catch (error) {
      const serverData = typeof navigator === 'undefined' || navigator.onLine !== false
        ? await readServerPortalData(portalDataRef.current, { full: !snapshotCompleteRef.current })
          .catch(() => null)
        : null;

      // Session endpoint can fail independently from dashboard data. Successful
      // dashboard read proves cookie/session still works, so preserve online mode.
      if (serverData) {
        commitPortalData(serverData, { complete: true, force: !snapshotCompleteRef.current });
        await writePortalDataCache(serverData, sessionCacheOwner(sessionRef.current)).catch(() => {});
        const currentSession = sessionRef.current;
        setSession({
          ...(currentSession || {}),
          loggedIn: true,
          username: currentSession?.username || serverData.user?.name || 'Student',
          school: currentSession?.school || serverData.user?.school || '',
          portalUid: currentSession?.portalUid || serverData.user?.uid,
          timestamp: currentSession?.timestamp || serverData.lastUpdated || new Date().toISOString(),
          offline: false,
        });
        console.warn('[Dashboard] Session endpoint failed; dashboard data verified successfully', error);
        return;
      }

      setSession(null);
      routerPush('/login');
      window.setTimeout(() => {
        notifyPortalSyncError('Could not verify your browser session. Sign in again to continue.');
      }, 0);
    } finally {
      setIsLoading(false);
    }
  }, [
    commitPortalData,
    desktopBoot.hasCachedData,
    desktopBoot.identity,
    desktopBoot.status,
    preview,
    readServerPortalData,
    routerPush,
    setPortalData,
    setSession,
  ]);

  useEffect(() => {
    if (preview || !session?.offline || typeof window === 'undefined') return;
    const retrySession = () => {
      if (isDesktopApp()) void desktopBoot.refresh();
      else void checkSession();
    };
    const retryId = window.setTimeout(retrySession, 30_000);
    window.addEventListener('online', retrySession);
    return () => {
      window.clearTimeout(retryId);
      window.removeEventListener('online', retrySession);
    };
  }, [checkSession, desktopBoot.refresh, preview, session?.offline]);

  const loadPortalData = useCallback((force = false): Promise<void> => {
    if (preview) return Promise.resolve();
    if (syncFlightRef.current) {
      const currentFlight = syncFlightRef.current;
      return force
        ? currentFlight.then(() => loadPortalData(true))
        : currentFlight;
    }

    const flight = (async () => {
      const generation = syncGenerationRef.current;
      const controller = new AbortController();
      syncAbortRef.current = controller;
      let current = portalDataRef.current;
      // Read the durable database snapshot before starting a much more expensive
      // portal scrape. This also joins the normal post-login hydration path when
      // browser cache is empty or unavailable.
      if (!current) current = await hydrateSavedPortalData(!sessionRef.current?.offline);
      if (sessionRef.current?.offline || isUltraRunClientLocked()) return;

      const dataSettings = readDataSettings();
      const intervalMs = getDataFetchIntervalMs(dataSettings);
      if (!force && isFresh(current, intervalMs)) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (!force && Date.now() < nextAttemptAtRef.current) return;
      if (!acquireClientLease(ownerIdRef.current)) {
        if (!force) {
          nextAttemptAtRef.current = Date.now() + 2_000;
          return;
        }
        setDataLoading(true);
        await waitForClientLease(ownerIdRef.current, controller.signal);
        if (controller.signal.aborted || !acquireClientLease(ownerIdRef.current)) {
          setDataLoading(false);
          if (!controller.signal.aborted) {
            notifyPortalSyncError('Another Millennium sync is still running. Please try refresh again.');
          }
          return;
        }
      }

      setDataLoading(true);
      try {
        const { response, data } = await fetchJsonWithTimeout<any>('/api/portal/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ syncOptions: toPortalSyncOptions(dataSettings), force }),
          timeout: SYNC_TIMEOUT_MS,
          signal: controller.signal,
        });
        if (response.status === 409 && data?.error?.code === 'PORTAL_SYNC_IN_PROGRESS') {
          nextAttemptAtRef.current = Date.now() + Math.max(1_000, Number(data.retryAfterMs) || 2_000);
          return;
        }
        if (response.status === 423) {
          nextAttemptAtRef.current = Date.now() + 30_000;
          return;
        }
        if (!response.ok) {
          if (data?.expired) await hydrateSavedPortalData(true);
          throw new Error(data?.message || 'Millennium sync failed.');
        }

        if (controller.signal.aborted || generation !== syncGenerationRef.current) return;
        // Lifted off the payload before anything merges it. It is news about this sync, not a
        // section of the dashboard, and leaving it on `data` would spread it into the merged
        // snapshot and then into the offline cache, where it would sit being wrong.
        if (Array.isArray(data?.teacherChanges)) {
          emitTeacherChanges(
            data.teacherChanges.map(toTeacherChangeSummary).filter(Boolean) as TeacherChangeSummary[],
          );
          delete data.teacherChanges;
        }
        const isIncremental = data?.incremental === true;
        // A sync response only carries the sections that changed. Merging one
        // onto a missing or unverified snapshot would publish (and cache) a
        // truncated dashboard even though the database still holds everything,
        // so repair the base from the database first.
        if (isIncremental && (!portalDataRef.current || !snapshotCompleteRef.current)) {
          await hydrateSavedPortalData(true);
          if (controller.signal.aborted || generation !== syncGenerationRef.current) return;
        }
        if (isIncremental && !portalDataRef.current) {
          console.warn('[Dashboard] Skipped an incremental sync result: durable snapshot is unavailable');
          nextAttemptAtRef.current = Date.now() + 30_000;
          return;
        }

        const snapshotComplete = !isIncremental || snapshotCompleteRef.current;
        const nextData = isIncremental
          ? mergePortalData(portalDataRef.current, data as PortalData)
          : data as PortalData;
        if (nextData && commitPortalData(nextData, { complete: snapshotComplete })) {
          await writePortalDataCache(
            nextData,
            sessionCacheOwner(sessionRef.current),
            { complete: snapshotComplete },
          );
        }
        consecutiveFailuresRef.current = 0;
        nextAttemptAtRef.current = 0;
        if (data?.sync?.degraded) {
          nextAttemptAtRef.current = Date.now() + 2 * 60_000;
          notifyPortalSyncError('Sync completed with some portal pages unavailable. Saved section data was retained.');
        } else {
          notifyPortalSyncSuccess(force
            ? 'Your Millennium data was refreshed.'
            : 'Your Millennium data was refreshed in the background.');
        }
      } catch (error) {
        if (controller.signal.aborted || generation !== syncGenerationRef.current) return;
        consecutiveFailuresRef.current += 1;
        const backoffMs = Math.min(5 * 60_000, 5_000 * (2 ** (consecutiveFailuresRef.current - 1)));
        nextAttemptAtRef.current = Date.now() + backoffMs + Math.floor(Math.random() * 1_000);
        notifyPortalSyncError(friendlySyncError(error));
        console.error('[Dashboard] Portal sync failed', error);
      } finally {
        if (syncAbortRef.current === controller) syncAbortRef.current = null;
        releaseClientLease(ownerIdRef.current);
        setDataLoading(false);
      }
    })();

    syncFlightRef.current = flight.finally(() => {
      if (syncFlightRef.current === flight || syncFlightRef.current) syncFlightRef.current = null;
    });
    return syncFlightRef.current;
  }, [commitPortalData, hydrateSavedPortalData, preview]);

  useEffect(() => {
    if (preview || typeof window === 'undefined') return;
    const updateExternalSyncState = () => {
      setIsExternalSyncRunning(isClientLeaseActive(ownerIdRef.current));
    };
    updateExternalSyncState();
    const intervalId = window.setInterval(updateExternalSyncState, 1_000);
    window.addEventListener('storage', updateExternalSyncState);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('storage', updateExternalSyncState);
    };
  }, [preview]);

  useEffect(() => {
    if (preview || !session?.loggedIn || session.offline || typeof window === 'undefined') return;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      if (timerId) clearTimeout(timerId);
      timerId = null;
      if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
      if (isUltraRunClientLocked()) {
        timerId = setTimeout(schedule, 30_000);
        return;
      }
      const intervalMs = getDataFetchIntervalMs(readDataSettings());
      const dueIn = isFresh(portalDataRef.current, intervalMs)
        ? Math.max(5_000, intervalMs - dataAgeMs(portalDataRef.current))
        : 5_000;
      const retryIn = Math.max(0, nextAttemptAtRef.current - Date.now());
      timerId = setTimeout(async () => {
        try {
          if (!cancelled && document.visibilityState === 'visible') await loadPortalData(false);
        } finally {
          schedule();
        }
      }, Math.max(dueIn, retryIn));
    };

    const handleWake = () => {
      if (document.visibilityState === 'visible') {
        void loadPortalData(false).finally(schedule);
      }
    };
    schedule();
    window.addEventListener('millennium-data-settings-change', schedule);
    window.addEventListener('online', handleWake);
    document.addEventListener('visibilitychange', handleWake);
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      window.removeEventListener('millennium-data-settings-change', schedule);
      window.removeEventListener('online', handleWake);
      document.removeEventListener('visibilitychange', handleWake);
    };
  }, [loadPortalData, preview, session?.loggedIn, session?.offline]);

  const handleLogout = useCallback(async () => {
    if (preview) return;
    syncGenerationRef.current += 1;
    syncAbortRef.current?.abort();
    syncFlightRef.current = null;
    setDataLoading(false);
    releaseClientLease(ownerIdRef.current);
    setSession(null);
    setPortalData(null);

    const serverLogout = fetchWithTimeout('/api/auth/logout', {
      method: 'POST',
      timeout: 5_000,
      keepalive: true,
    }).catch(() => null);

    let localCleanupError: unknown = null;
    let classroomProfileRemoved = false;
    const isDesktop = isDesktopApp();
    if (isDesktop) {
      markDesktopLogoutPending();
      const activeIdentity = await readDesktopIdentity().catch((error: unknown) => {
        localCleanupError = error;
        return null;
      });
      if (!localCleanupError && !activeIdentity) {
        localCleanupError = new Error('Desktop identity was unavailable during local sign-out cleanup.');
      }
      if (!localCleanupError && activeIdentity) {
        try {
          await disconnectClassroomProfile(activeIdentity.ownerId);
          classroomProfileRemoved = true;
          await clearDesktopOwnerData();
        } catch (error: unknown) {
          localCleanupError = error;
        }
      }
      if (localCleanupError && activeIdentity && classroomProfileRemoved) {
        try {
          await clearAllDesktopData();
          localCleanupError = null;
        } catch {
          // Preserve original cleanup error for the locked recovery screen.
        }
      }
      if (!localCleanupError) {
        const remainingIdentity = await readDesktopIdentity().catch((error: unknown) => {
          localCleanupError = error;
          return null;
        });
        if (remainingIdentity) {
          localCleanupError = new Error('Desktop identity remained after local sign-out cleanup.');
        } else {
          desktopBoot.resetLocalSession();
        }
      }
    } else {
      await clearPortalDataCache().catch(() => null);
    }

    clearBrowserSessionStorage();
    if (isDesktop) markDesktopLogoutPending();
    const serverResponse = await serverLogout;
    if (isDesktop && (localCleanupError || !serverResponse?.ok)) {
      markDesktopLogoutPending();
    } else {
      clearDesktopLogoutPending();
    }

    if (localCleanupError) {
      const message = localCleanupError instanceof Error
        ? `Local sign-out cleanup failed: ${localCleanupError.message}`
        : 'Local sign-out cleanup failed.';
      desktopBoot.lockLocalSession(message);
      notifyPortalSyncError(message);
      routerPush('/');
      return;
    }
    if (!serverResponse?.ok) {
      notifyPortalSyncError('Signed out locally. Server sign-out will be retried after your next explicit login.');
    }
    routerPush('/login');
  }, [
    desktopBoot.lockLocalSession,
    desktopBoot.resetLocalSession,
    preview,
    routerPush,
    setPortalData,
    setSession,
  ]);

  useEffect(() => () => {
    syncGenerationRef.current += 1;
    syncAbortRef.current?.abort();
  }, []);

  return {
    session,
    isLoading,
    portalData,
    setPortalData,
    dataLoading,
    isExternalSyncRunning,
    checkSession,
    loadPortalData,
    handleLogout,
  };
}
