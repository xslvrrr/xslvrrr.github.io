// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DATA_SETTINGS_STORAGE_KEY,
  getDefaultDataSettings,
  normalizeDataSettings,
  readDataSettings,
  resetDataSettings,
  toPortalSyncOptions,
  writeDataSettings,
} from './data-settings';

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
    clear: () => entries.clear(),
  });
});

describe('live attendance settings', () => {
  it('enables live attendance for defaults and existing saved settings', () => {
    expect(getDefaultDataSettings().liveAttendanceEnabled).toBe(true);
    localStorage.setItem(DATA_SETTINGS_STORAGE_KEY, JSON.stringify({ includeAttendance: false }));
    expect(readDataSettings()).toMatchObject({ liveAttendanceEnabled: true, includeAttendance: false });
  });

  it('persists disabling, publishes the normalized setting, and resets to enabled', () => {
    const changes: unknown[] = [];
    const listener = (event: Event) => changes.push((event as CustomEvent).detail);
    window.addEventListener('millennium-data-settings-change', listener);
    try {
      writeDataSettings(normalizeDataSettings({ liveAttendanceEnabled: false }));
      expect(readDataSettings().liveAttendanceEnabled).toBe(false);
      expect(changes[0]).toMatchObject({ liveAttendanceEnabled: false });
      expect(resetDataSettings().liveAttendanceEnabled).toBe(true);
      expect(changes[1]).toMatchObject({ liveAttendanceEnabled: true });
    } finally {
      window.removeEventListener('millennium-data-settings-change', listener);
    }
  });

  it('preserves live mode through repeated normalization and excludes full-page work', () => {
    const options = toPortalSyncOptions({
      ...getDefaultDataSettings(), liveAttendanceOnly: true, includeAttendance: false,
      ultraRun: { startYear: 2025, endYear: 2026 },
    });
    expect(options).toMatchObject({
      liveAttendanceOnly: true, includeAttendance: true,
      includeTimetable: false, includeNotices: false, includeGrades: false,
      includeReports: false, includeClasses: false, includeCalendar: false,
    });
    expect(options.ultraRun).toBeUndefined();
    expect(toPortalSyncOptions(options)).toEqual(options);
  });

  it('keeps normal sync flags and ultra runs unchanged', () => {
    const options = toPortalSyncOptions({
      includeAttendance: false, liveAttendanceOnly: false,
      ultraRun: { startYear: 2025, endYear: 2026 },
    });
    expect(options).toMatchObject({
      includeAttendance: false, includeTimetable: true, liveAttendanceOnly: false,
      ultraRun: { startYear: 2025, endYear: 2026 },
    });
    expect(toPortalSyncOptions({ liveAttendanceOnly: 'true' })).not.toHaveProperty('liveAttendanceOnly');
  });
});

describe('class change confirmation settings', () => {
  it('reads the reference grids by default and respects an explicit refusal', () => {
    expect(getDefaultDataSettings().includeTimetableReferences).toBe(true);
    expect(normalizeDataSettings({}).includeTimetableReferences).toBe(true);
    expect(normalizeDataSettings({ includeTimetableReferences: false }).includeTimetableReferences).toBe(false);
  });

  it('keeps the retired teacher lookahead switched off', () => {
    localStorage.setItem(DATA_SETTINGS_STORAGE_KEY, JSON.stringify({ includeTeacherLookahead: false }));
    expect(readDataSettings().includeTimetableReferences).toBe(false);
    localStorage.setItem(DATA_SETTINGS_STORAGE_KEY, JSON.stringify({ includeTeacherLookahead: true }));
    expect(readDataSettings().includeTimetableReferences).toBe(true);
  });

  it('never asks a live attendance poll for the reference grids', () => {
    expect(toPortalSyncOptions({ liveAttendanceOnly: true }).includeTimetableReferences).toBe(false);
    expect(toPortalSyncOptions({ liveAttendanceOnly: false }).includeTimetableReferences).toBe(true);
  });
});
