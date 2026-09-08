// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardData } from '../hooks/useDashboardData';
import { normalizeDataSettings, startUltraRunClientLock, writeDataSettings } from './data-settings';
import { writePortalDataCache } from './desktop/storage';
import { notifyPortalSyncError, notifyPortalSyncSuccess } from '../components/PortalSyncStatusToasts';
import type { PortalData } from '../types/portal';

vi.mock('@/start/router', () => ({ useAppRouter: () => ({ push: vi.fn() }) }));
vi.mock('../lib/dashboard-preview-data', () => ({ previewSession: null, previewPortalData: null }));
vi.mock('../hooks/useDesktopBootstrap', () => ({ useDesktopBootstrap: () => ({}) }));
vi.mock('../lib/desktop/utils', () => ({ isDesktopApp: () => false }));
vi.mock('../lib/desktop/classroom', () => ({ disconnectClassroomProfile: vi.fn() }));
vi.mock('../lib/desktop/logout-lock', () => ({ clearDesktopLogoutPending: vi.fn(), markDesktopLogoutPending: vi.fn() }));
vi.mock('../components/PortalSyncStatusToasts', () => ({ notifyPortalSyncError: vi.fn(), notifyPortalSyncSuccess: vi.fn() }));
vi.mock('../lib/desktop/storage', () => ({
  clearAllDesktopData: vi.fn(), clearDesktopOwnerData: vi.fn(), clearPortalDataCache: vi.fn().mockResolvedValue(undefined),
  readDesktopIdentity: vi.fn().mockResolvedValue(null), readPortalDataCache: vi.fn().mockResolvedValue(null),
  readPortalDataCacheEntry: vi.fn().mockResolvedValue(null),
  rememberPortalCacheOwner: vi.fn(), writePortalDataCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../lib/portal-sync-status', () => ({
  PORTAL_DATA_UPDATED_EVENT: 'millennium-portal-data-updated',
  subscribeUltraRunStatus: (listener: EventListener) => {
    window.addEventListener('test-ultra-status', listener);
    return () => window.removeEventListener('test-ultra-status', listener);
  },
}));

const leaseKey = 'millennium-portal-sync-client-lease-v1';
let baseline: PortalData;
let fetchMock: ReturnType<typeof vi.fn>;
let syncReply: (options: RequestInit) => Promise<Response>;
const syncCalls = () => fetchMock.mock.calls.filter(([url]) => url === '/api/portal/sync');
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-08T00:00:00Z'));
  vi.clearAllMocks();
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
    clear: () => entries.clear(),
  });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  baseline = {
    userId: 'student', user: { name: 'Student', school: 'School', uid: '1' },
    timetable: [], notices: [{ title: 'Keep', preview: '', content: '' }], diary: [],
    lastUpdated: new Date().toISOString(),
    attendance: { yearly: [], subjects: [], absences: [], recentPeriods: [] },
    sync: { durationMs: 123 },
    syncMeta: { complete: true, degraded: false, pageCount: 10, succeededPages: 10, failedPages: [], durationMs: 123 },
  };
  syncReply = async () => Response.json({
    incremental: true, lastUpdated: new Date().toISOString(),
    sync: { liveAttendanceOnly: true },
    attendance: { recentPeriods: [{ date: '08/09/2026', period: '1', status: 'Present' }] },
  });
  fetchMock = vi.fn(async (url: string, options: RequestInit) => {
    if (url === '/api/app/session') return Response.json({ loggedIn: true, userId: 'student', portalUid: '1' });
    if (url.startsWith('/api/portal/data')) return Response.json(baseline);
    if (url === '/api/portal/sync') return syncReply(options);
    throw new Error(`Unexpected URL ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mountDashboard() {
  const hook = renderHook(() => useDashboardData());
  await act(async () => { await hook.result.current.checkSession(); });
  return hook;
}

function deferSync() {
  let resolve!: (response: Response) => void;
  syncReply = () => new Promise<Response>((done) => { resolve = done; });
  return async () => act(async () => { resolve(Response.json({ incremental: true, sync: { liveAttendanceOnly: true } })); });
}

describe('live attendance polling', () => {
  it('polls once a minute, merges/cache-saves silently, and retains full sync freshness', async () => {
    const { result } = await mountDashboard();
    await advance(59_999);
    expect(syncCalls()).toHaveLength(0);
    await advance(1);
    expect(syncCalls()).toHaveLength(1);
    expect(JSON.parse(syncCalls()[0][1].body)).toEqual({ syncOptions: { liveAttendanceOnly: true } });
    expect(result.current.portalData).toMatchObject({
      lastUpdated: baseline.lastUpdated, syncMeta: baseline.syncMeta,
      sync: { liveAttendanceOnly: true, durationMs: 123 }, notices: baseline.notices,
      attendance: { recentPeriods: [{ period: '1', status: 'Present' }] },
    });
    expect(writePortalDataCache).toHaveBeenLastCalledWith(result.current.portalData, 'student', { complete: true });
    expect(result.current.dataLoading).toBe(false);
    expect(notifyPortalSyncSuccess).not.toHaveBeenCalled();
    expect(notifyPortalSyncError).not.toHaveBeenCalled();
    await advance(60_000);
    expect(syncCalls()).toHaveLength(2);
    await act(async () => { await result.current.loadPortalData(false); });
    expect(syncCalls()).toHaveLength(2);
  });

  it.each(['setting', 'attendance', 'offline', 'ultra', 'external lease'])(
    'skips polls while blocked by %s', async (reason) => {
      await mountDashboard();
      if (reason === 'setting') writeDataSettings(normalizeDataSettings({ liveAttendanceEnabled: false }));
      if (reason === 'attendance') writeDataSettings(normalizeDataSettings({ includeAttendance: false }));
      if (reason === 'offline') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      if (reason === 'ultra') startUltraRunClientLock();
      if (reason === 'external lease') localStorage.setItem(leaseKey, JSON.stringify({ ownerId: 'other', expiresAt: Date.now() + 300_000 }));
      await advance(120_000);
      expect(syncCalls()).toHaveLength(0);
    },
  );

  it('renews a silent lease, skips in-flight ticks, and queues a manual full sync', async () => {
    const finishPoll = deferSync();
    const { result } = await mountDashboard();
    await advance(60_000);
    expect(JSON.parse(localStorage.getItem(leaseKey)!)).toMatchObject({ silent: true });
    expect(result.current.dataLoading).toBe(false);
    await advance(60_000);
    expect(syncCalls()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(leaseKey)!).expiresAt).toBeGreaterThan(Date.now());
    let fullSync!: Promise<void>;
    act(() => { fullSync = result.current.loadPortalData(true); });
    expect(syncCalls()).toHaveLength(1);
    syncReply = async () => Response.json({ ...baseline, lastUpdated: new Date().toISOString(), sync: {} });
    await finishPoll();
    await act(async () => { await fullSync; });
    expect(syncCalls()).toHaveLength(2);
    expect(JSON.parse(syncCalls()[1][1].body)).toMatchObject({ force: true });
    expect(result.current.portalData?.sync).not.toHaveProperty('liveAttendanceOnly');
  });

  it('skips live polling while a full sync is running', async () => {
    const finishSync = deferSync();
    const { result } = await mountDashboard();
    act(() => { void result.current.loadPortalData(true); });
    await advance(120_000);
    expect(syncCalls()).toHaveLength(1);
    expect(JSON.parse(syncCalls()[0][1].body)).toMatchObject({ force: true });
    await finishSync();
  });

  it.each(['setting', 'attendance', 'offline', 'ultra', 'unmount'])(
    'aborts and discards an in-flight poll on %s', async (reason) => {
      const finishPoll = deferSync();
      const { result, unmount } = await mountDashboard();
      await advance(60_000);
      const signal = syncCalls()[0][1].signal as AbortSignal;
      if (reason === 'setting') writeDataSettings(normalizeDataSettings({ liveAttendanceEnabled: false }));
      if (reason === 'attendance') writeDataSettings(normalizeDataSettings({ includeAttendance: false }));
      if (reason === 'offline') {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        window.dispatchEvent(new Event('offline'));
      }
      if (reason === 'ultra') {
        startUltraRunClientLock();
        window.dispatchEvent(new Event('test-ultra-status'));
      }
      if (reason === 'unmount') unmount();
      expect(signal.aborted).toBe(true);
      await finishPoll();
      expect(result.current.portalData).toEqual(baseline);
      expect(notifyPortalSyncError).not.toHaveBeenCalled();
    },
  );

  it('hides silent external lease spinners while still blocking polls', async () => {
    const { result } = await mountDashboard();
    localStorage.setItem(leaseKey, JSON.stringify({ ownerId: 'other', silent: true, expiresAt: Date.now() + 300_000 }));
    await advance(60_000);
    expect(result.current.isExternalSyncRunning).toBe(false);
    expect(syncCalls()).toHaveLength(0);
    localStorage.setItem(leaseKey, JSON.stringify({ ownerId: 'other', silent: false, expiresAt: Date.now() + 300_000 }));
    await advance(1_000);
    expect(result.current.isExternalSyncRunning).toBe(true);
  });

  it.each([401, 409, 423, 500])('keeps HTTP %s failures silent and retries next minute', async (status) => {
    const { result } = await mountDashboard();
    syncReply = async () => Response.json({ message: 'Unavailable' }, { status });
    await advance(120_000);
    expect(syncCalls()).toHaveLength(2);
    expect(result.current.portalData).toEqual(baseline);
    expect(notifyPortalSyncError).not.toHaveBeenCalled();
    expect(notifyPortalSyncSuccess).not.toHaveBeenCalled();
  });

  it('runs scheduled full syncs on time despite successful live polls', async () => {
    writeDataSettings(normalizeDataSettings({ fetchIntervalValue: 5 }));
    await mountDashboard();
    await advance(300_000);
    expect(syncCalls().some(([, options]) => JSON.parse(options.body).syncOptions.liveAttendanceOnly !== true)).toBe(true);
  });
});
