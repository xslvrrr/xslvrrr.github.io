export type DataFetchIntervalUnit = 'minutes' | 'hours';

export interface PortalDataSettings {
  fetchIntervalUnit: DataFetchIntervalUnit;
  fetchIntervalValue: number;
  portalDate: string;
  matchCurrentDate: boolean;
  noticeLookbehindDays: number;
  noticeLookaheadDays: number;
  calendarMonthsPast: number;
  calendarMonthsFuture: number;
  reportsYearLookback: number;
  attendanceYearLookback: number;
  gradeItemLimit: number;
  includeTimetable: boolean;
  includeNotices: boolean;
  includeGrades: boolean;
  includeAttendance: boolean;
  includeReports: boolean;
  includeClasses: boolean;
  includeCalendar: boolean;
  showUltraRunLiveStatus: boolean;
  showSyncUpdates: boolean;
}

export interface PortalSyncOptions {
  portalDate: string;
  noticeLookbehindDays: number;
  noticeLookaheadDays: number;
  calendarMonthsPast: number;
  calendarMonthsFuture: number;
  reportsYearLookback: number;
  attendanceYearLookback: number;
  gradeItemLimit: number;
  includeTimetable: boolean;
  includeNotices: boolean;
  includeGrades: boolean;
  includeAttendance: boolean;
  includeReports: boolean;
  includeClasses: boolean;
  includeCalendar: boolean;
  ultraRun?: PortalUltraRunOptions;
}

export interface PortalUltraRunOptions {
  startYear: number;
  endYear: number;
}

export const DATA_SETTINGS_STORAGE_KEY = 'millennium-data-settings-v1';
export const ULTRA_RUN_CLIENT_LOCK_KEY = 'millennium-ultra-run-active-v1';
const ULTRA_RUN_CLIENT_LOCK_TTL_MS = 2 * 60 * 60 * 1000;

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function toLocalDateInputValue(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

function parseDateInput(value: unknown, fallback: Date): string {
  if (typeof value !== 'string') return toLocalDateInputValue(fallback);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return toLocalDateInputValue(fallback);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? toLocalDateInputValue(fallback) : toLocalDateInputValue(date);
}

export function getDefaultDataSettings(now = new Date()): PortalDataSettings {
  return {
    fetchIntervalUnit: 'minutes',
    fetchIntervalValue: 30,
    portalDate: toLocalDateInputValue(now),
    matchCurrentDate: false,
    noticeLookbehindDays: 2,
    noticeLookaheadDays: 5,
    calendarMonthsPast: now.getMonth(),
    calendarMonthsFuture: 11 - now.getMonth(),
    reportsYearLookback: 6,
    attendanceYearLookback: 6,
    gradeItemLimit: 100,
    includeTimetable: true,
    includeNotices: true,
    includeGrades: true,
    includeAttendance: true,
    includeReports: true,
    includeClasses: true,
    includeCalendar: true,
    showUltraRunLiveStatus: true,
    showSyncUpdates: true,
  };
}

export function normalizeDataSettings(input: unknown, now = new Date()): PortalDataSettings {
  const defaults = getDefaultDataSettings(now);
  const source = input && typeof input === 'object' ? input as Partial<PortalDataSettings> : {};
  const fetchIntervalUnit: DataFetchIntervalUnit = source.fetchIntervalUnit === 'hours' ? 'hours' : 'minutes';
  const fetchIntervalValue = fetchIntervalUnit === 'hours'
    ? clampInteger(source.fetchIntervalValue, 1, 24, defaults.fetchIntervalValue)
    : clampInteger(source.fetchIntervalValue, 5, 55, defaults.fetchIntervalValue);

  return {
    fetchIntervalUnit,
    fetchIntervalValue,
    portalDate: source.matchCurrentDate === true
      ? toLocalDateInputValue(now)
      : parseDateInput(source.portalDate, now),
    matchCurrentDate: source.matchCurrentDate === true,
    noticeLookbehindDays: clampInteger(source.noticeLookbehindDays, 0, 60, defaults.noticeLookbehindDays),
    noticeLookaheadDays: clampInteger(source.noticeLookaheadDays, 0, 60, defaults.noticeLookaheadDays),
    calendarMonthsPast: clampInteger(source.calendarMonthsPast, 0, 24, defaults.calendarMonthsPast),
    calendarMonthsFuture: clampInteger(source.calendarMonthsFuture, 0, 24, defaults.calendarMonthsFuture),
    reportsYearLookback: clampInteger(source.reportsYearLookback, 1, 12, defaults.reportsYearLookback),
    attendanceYearLookback: clampInteger(source.attendanceYearLookback, 1, 12, defaults.attendanceYearLookback),
    gradeItemLimit: clampInteger(source.gradeItemLimit, 0, 250, defaults.gradeItemLimit),
    includeTimetable: source.includeTimetable !== false,
    includeNotices: source.includeNotices !== false,
    includeGrades: source.includeGrades !== false,
    includeAttendance: source.includeAttendance !== false,
    includeReports: source.includeReports !== false,
    includeClasses: source.includeClasses !== false,
    includeCalendar: source.includeCalendar !== false,
    showUltraRunLiveStatus: source.showUltraRunLiveStatus !== false,
    showSyncUpdates: source.showSyncUpdates !== false,
  };
}

export function readDataSettings(): PortalDataSettings {
  if (typeof window === 'undefined') return getDefaultDataSettings();
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(DATA_SETTINGS_STORAGE_KEY);
  } catch {
    return getDefaultDataSettings();
  }
  if (!saved) return getDefaultDataSettings();

  try {
    return normalizeDataSettings(JSON.parse(saved));
  } catch {
    return getDefaultDataSettings();
  }
}

export function writeDataSettings(settings: PortalDataSettings) {
  if (typeof window === 'undefined') return;
  const normalized = normalizeDataSettings(settings);
  window.localStorage.setItem(DATA_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent('millennium-data-settings-change', { detail: normalized }));
}

export function resetDataSettings(): PortalDataSettings {
  const defaults = getDefaultDataSettings();
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(DATA_SETTINGS_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('millennium-data-settings-change', { detail: defaults }));
  }
  return defaults;
}

export function getDataFetchIntervalMs(settings: PortalDataSettings): number {
  const normalized = normalizeDataSettings(settings);
  const minutes = normalized.fetchIntervalUnit === 'hours'
    ? normalized.fetchIntervalValue * 60
    : normalized.fetchIntervalValue;
  return minutes * 60 * 1000;
}

export function toPortalSyncOptions(input: unknown): PortalSyncOptions {
  const settings = normalizeDataSettings(input);
  const source = input && typeof input === 'object' ? input as Partial<PortalSyncOptions> : {};
  return {
    portalDate: settings.portalDate,
    noticeLookbehindDays: settings.noticeLookbehindDays,
    noticeLookaheadDays: settings.noticeLookaheadDays,
    calendarMonthsPast: settings.calendarMonthsPast,
    calendarMonthsFuture: settings.calendarMonthsFuture,
    reportsYearLookback: settings.reportsYearLookback,
    attendanceYearLookback: settings.attendanceYearLookback,
    gradeItemLimit: settings.gradeItemLimit,
    includeTimetable: settings.includeTimetable,
    includeNotices: settings.includeNotices,
    includeGrades: settings.includeGrades,
    includeAttendance: settings.includeAttendance,
    includeReports: settings.includeReports,
    includeClasses: settings.includeClasses,
    includeCalendar: settings.includeCalendar,
    ...(source.ultraRun ? { ultraRun: normalizeUltraRunOptions(source.ultraRun) } : {}),
  };
}

export function normalizeUltraRunOptions(input: unknown, now = new Date()): PortalUltraRunOptions {
  const source = input && typeof input === 'object' ? input as Partial<PortalUltraRunOptions> : {};
  const currentYear = now.getFullYear();
  const endYear = clampInteger(source.endYear, 2000, currentYear, currentYear);
  const startYear = clampInteger(source.startYear, endYear - 5, endYear, endYear - 5);

  return {
    startYear,
    endYear,
  };
}

export function formatFetchInterval(settings: PortalDataSettings): string {
  const normalized = normalizeDataSettings(settings);
  if (normalized.fetchIntervalUnit === 'hours') {
    if (normalized.fetchIntervalValue === 24) return 'Daily';
    return `Every ${normalized.fetchIntervalValue} hour${normalized.fetchIntervalValue === 1 ? '' : 's'}`;
  }
  return `Every ${normalized.fetchIntervalValue} minutes`;
}

export function formatPortalDateLabel(value: string): string {
  const normalized = normalizeDataSettings({ portalDate: value });
  const [year, month, day] = normalized.portalDate.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function startUltraRunClientLock() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ULTRA_RUN_CLIENT_LOCK_KEY, JSON.stringify({
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ULTRA_RUN_CLIENT_LOCK_TTL_MS).toISOString(),
  }));
}

export function clearUltraRunClientLock() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ULTRA_RUN_CLIENT_LOCK_KEY);
}

export function isUltraRunClientLocked(): boolean {
  if (typeof window === 'undefined') return false;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(ULTRA_RUN_CLIENT_LOCK_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw);
    const expiresAt = new Date(parsed?.expiresAt || '').getTime();
    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) return true;
  } catch {
    // Fall through and clear malformed locks.
  }

  window.localStorage.removeItem(ULTRA_RUN_CLIENT_LOCK_KEY);
  return false;
}
