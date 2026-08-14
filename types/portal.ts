// Shared type definitions for portal data

export interface UserSession {
  loggedIn: boolean;
  username?: string;
  school?: string;
  userId?: string;
  portalUid?: string;
  timestamp?: string;
  createdAt?: string | null;
  role?: 'user' | 'admin';
  profileImage?: string | null;
  offline?: boolean;
}

export interface PortalAccount {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  nesaStudentNumber: string;
  usi: string;
  mobile: string;
  currentYear: string;
}

export interface TimetableEntry {
  period: string;
  room: string;
  subject: string;
  teacher: string;
  attendanceStatus: 'present' | 'absent' | 'partial' | 'unmarked';
}

// Full timetable entry in Week A/B format
export interface FullTimetableEntry {
  day: string;
  period: string;
  course: string;
  classCode: string;
  teacher: string;
  room: string;
}

export interface FullTimetable {
  weekA: FullTimetableEntry[];
  weekB: FullTimetableEntry[];
}

export interface Notice {
  title: string;
  preview: string;
  content: string;
  contentHtml?: string;
  date?: string;
  dates?: string[];
  currentDay?: string;
}

export interface GradeEntry {
  subject: string;
  task: string;
  result: string;
  date?: string;
}

export interface DiaryEntry {
  date: string;
  title: string;
  description?: string;
}

export interface ClassEntry {
  course: string;
  classCode: string;
  teacher: string;
  lessons: number;
  quickMerits: number;
  rollsMarked: number;
  absences: number;
}

export interface PortalData {
  userId?: string;
  user: {
    name: string;
    school: string;
    uid?: string;
  };
  account?: PortalAccount;
  timetable: TimetableEntry[] | FullTimetable;
  notices: Notice[];
  diary: DiaryEntry[];
  grades?: GradeEntry[];
  attendance?: AttendanceData;
  calendar?: any[];
  reports?: Report[];
  classes?: ClassEntry[];
  lastUpdated: string;
  sync?: {
    transport?: 'http' | 'browser';
    durationMs?: number;
    totalDurationMs?: number;
    shared?: boolean;
    degraded?: boolean;
    failedPages?: Array<{ page: string; section: string; code: string; message: string }>;
  };
  syncMeta?: {
    complete: boolean;
    degraded: boolean;
    pageCount: number;
    succeededPages: number;
    failedPages: Array<{ page: string; section: string; code: string; message: string }>;
    sections?: Record<string, { requested: number; succeeded: number; failed: number }>;
    durationMs: number;
  };
}

export type NotificationCategory = 'inbox' | 'alerts' | 'events' | 'assignments';
export type NotificationImportance = 'low' | 'medium' | 'high';

export interface NotificationState {
  read: boolean;
  pinned: boolean;
  archived: boolean;
  autoArchived?: boolean;
  category?: NotificationCategory;
  importance?: NotificationImportance;
  folderId?: string;
  /**
   * Set once the reader files (or deliberately unfiles) a notice by hand. Routing rules
   * never overwrite a manual decision, so a rule change cannot undo filing you did yourself.
   */
  folderManual?: boolean;
}

export interface NotificationCounts {
  unreadTotal: number;
  inbox: number;
  pinned: number;
  alerts: number;
  events: number;
  assignments: number;
  archive: number;
}

// Attendance data types
export interface YearlyAttendance {
  year: string;
  schoolDays: number;
  wholeDayAbsences: number;
  wholeDayPercentage: number;
  partialAbsences: number;
  totalPercentage: number;
}

export interface SubjectAttendance {
  classCode: string;
  rollsMarked: number;
  absent: number;
  percentage: number | null; // null when no data (e.g., "-")
}

export interface AttendanceAbsence {
  type: string;
  reason: string;
  start: string;
  end: string;
  detail?: string;
}

export interface AttendancePeriodMark {
  label: string;
  classCode?: string;
  reason?: string;
  status: 'present' | 'absent' | 'approved' | 'sick' | 'unmarked';
}

export interface AttendancePeriodDay {
  day: string;
  date: string;
  periods: AttendancePeriodMark[];
}

export interface AttendanceTotals {
  wholeDay: number;
  lateArrivals: number;
  leave: number;
  variationOfRoutine: number;
}

export interface AttendanceData {
  yearly: YearlyAttendance[];
  subjects: SubjectAttendance[];
  absences?: AttendanceAbsence[];
  recentPeriods?: AttendancePeriodDay[];
  totals?: AttendanceTotals;
}

export interface AttendanceDisplaySettings {
  perfectEffectEnabled: boolean;
  fillingEnabled: boolean;
  /** Percentage at or above which attendance is shown as excellent. */
  excellentThreshold?: number;
  /** Percentage at or above which attendance is shown as good. */
  goodThreshold?: number;
  /** Percentage below which attendance is highlighted as concerning. */
  concernThreshold?: number;
}

export const DEFAULT_ATTENDANCE_THRESHOLDS = {
  excellentThreshold: 95,
  goodThreshold: 85,
  concernThreshold: 75,
} as const;

export type AttendanceBand = 'excellent' | 'good' | 'warning' | 'poor';

/**
 * Minimum gap between two adjacent attendance thresholds.
 *
 * Bands are half-open (`>= excellent`, `>= good`, `>= concern`), so two thresholds that meet on the
 * same number collapse the band between them to nothing and the middle colour becomes unreachable.
 * Keeping every neighbour at least one percentage point apart is what stops that.
 */
export const ATTENDANCE_THRESHOLD_GAP = 1;

/**
 * Resolves the stored thresholds into a strictly descending set so a partially
 * configured or hand-edited payload can never produce an unreachable band.
 *
 * The lower thresholds give way to the higher ones: `excellent` keeps the value it was given and
 * each threshold below it is pushed down until it clears its neighbour by `ATTENDANCE_THRESHOLD_GAP`.
 */
export function resolveAttendanceThresholds(
  settings?: Pick<AttendanceDisplaySettings, 'excellentThreshold' | 'goodThreshold' | 'concernThreshold'>
): { excellent: number; good: number; concern: number } {
  const clamp = (value: number | undefined, fallback: number): number => (
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(100, Math.max(0, Math.round(value)))
      : fallback
  );

  const between = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const excellent = between(
    clamp(settings?.excellentThreshold, DEFAULT_ATTENDANCE_THRESHOLDS.excellentThreshold),
    ATTENDANCE_THRESHOLD_GAP * 2,
    100
  );
  const good = between(
    clamp(settings?.goodThreshold, DEFAULT_ATTENDANCE_THRESHOLDS.goodThreshold),
    ATTENDANCE_THRESHOLD_GAP,
    excellent - ATTENDANCE_THRESHOLD_GAP
  );
  const concern = between(
    clamp(settings?.concernThreshold, DEFAULT_ATTENDANCE_THRESHOLDS.concernThreshold),
    0,
    good - ATTENDANCE_THRESHOLD_GAP
  );
  return { excellent, good, concern };
}

/**
 * Moves one attendance threshold and drags its neighbours along so every pair stays
 * `ATTENDANCE_THRESHOLD_GAP` apart.
 *
 * The threshold the user actually moved keeps the value they chose; the others only shift as far as
 * they must to clear it. Raising `good` past `excellent` pushes `excellent` up, lowering `good`
 * past `concern` pushes `concern` down, and so on.
 */
export function applyAttendanceThreshold(
  current: { excellent: number; good: number; concern: number },
  key: 'excellent' | 'good' | 'concern',
  value: number
): Required<Pick<AttendanceDisplaySettings, 'excellentThreshold' | 'goodThreshold' | 'concernThreshold'>> {
  const gap = ATTENDANCE_THRESHOLD_GAP;
  const requested = Math.min(100, Math.max(0, Math.round(value)));

  let { excellent, good, concern } = current;

  if (key === 'excellent') {
    excellent = Math.max(gap * 2, requested);
    good = Math.min(good, excellent - gap);
    concern = Math.min(concern, good - gap);
  } else if (key === 'good') {
    good = Math.min(100 - gap, Math.max(gap, requested));
    excellent = Math.max(excellent, good + gap);
    concern = Math.min(concern, good - gap);
  } else {
    concern = Math.min(100 - gap * 2, requested);
    good = Math.max(good, concern + gap);
    excellent = Math.max(excellent, good + gap);
  }

  return {
    excellentThreshold: excellent,
    goodThreshold: good,
    concernThreshold: Math.max(0, concern),
  };
}

export function getAttendanceBand(
  percentage: number | null,
  thresholds: { excellent: number; good: number; concern: number }
): AttendanceBand | null {
  if (percentage === null) return null;
  if (percentage >= thresholds.excellent) return 'excellent';
  if (percentage >= thresholds.good) return 'good';
  if (percentage >= thresholds.concern) return 'warning';
  return 'poor';
}

// Report data types
export interface Report {
  id?: string;
  title: string;
  url: string;
  yearLevel: string;    // e.g., "Year 11"
  semester: number;     // 1 or 2
  calendarYear: number; // e.g., 2025
  storagePath?: string;
  checksum?: string;
  downloadedAt?: string;
  byteSize?: number;
}
