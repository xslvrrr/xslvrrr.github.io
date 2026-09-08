export interface PortalDataCounts {
  timetable: number;
  todayTimetable: number;
  todayTimetableDays: number;
  timetableReferences: number;
  attendanceRecentDays: number;
  attendancePeriods: number;
  notices: number;
  grades: number;
  attendanceYears: number;
  attendanceSubjects: number;
  calendar: number;
  reports: number;
  classes: number;
  total: number;
}

export class PortalDataIntegrityError extends Error {
  status = 422;
  counts: PortalDataCounts;

  constructor(message: string, counts: PortalDataCounts) {
    super(message);
    this.name = 'PortalDataIntegrityError';
    this.counts = counts;
  }
}

// Home-only snapshots can legitimately contain a dated day with no lessons.
// Require a real date and an entries/periods array so empty/error payloads fail.
function hasValidDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!iso && !local) return false;
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(local![3]), Number(local![2]), Number(local![1])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function getPortalDataCounts(data: any): PortalDataCounts {
  const timetable = Array.isArray(data?.timetable)
    ? data.timetable.length
    : (data?.timetable?.weekA?.length || 0) + (data?.timetable?.weekB?.length || 0);
  const attendanceYears = data?.attendance?.yearly?.length || 0;
  const attendanceSubjects = data?.attendance?.subjects?.length || 0;

  const today = hasValidDate(data?.todayTimetable?.date) && Array.isArray(data?.todayTimetable?.entries)
    ? data.todayTimetable : null;
  const recentDays = Array.isArray(data?.attendance?.recentPeriods)
    ? data.attendance.recentPeriods.filter((day: any) => hasValidDate(day?.date) && Array.isArray(day?.periods))
    : [];
  const references = Array.isArray(data?.timetableReferences)
    ? data.timetableReferences.filter((reference: any) => hasValidDate(reference?.date)
      && Array.isArray(reference?.timetable?.weekA) && Array.isArray(reference?.timetable?.weekB))
    : [];

  const counts = {
    timetable,
    todayTimetable: today?.entries.length || 0,
    todayTimetableDays: today ? 1 : 0,
    timetableReferences: references.reduce((total: number, reference: any) => (
      total + reference.timetable.weekA.length + reference.timetable.weekB.length
    ), 0),
    attendanceRecentDays: recentDays.length,
    attendancePeriods: recentDays.reduce((total: number, day: any) => total + day.periods.length, 0),
    notices: data?.notices?.length || 0,
    grades: data?.grades?.length || 0,
    attendanceYears,
    attendanceSubjects,
    calendar: data?.calendar?.length || 0,
    reports: data?.reports?.length || 0,
    classes: data?.classes?.length || 0,
    total: 0,
  };

  counts.total = counts.timetable
    + counts.todayTimetable
    + counts.todayTimetableDays
    + counts.timetableReferences
    + counts.attendanceRecentDays
    + counts.attendancePeriods
    + counts.notices
    + counts.grades
    + counts.attendanceYears
    + counts.attendanceSubjects
    + counts.calendar
    + counts.reports
    + counts.classes;

  return counts;
}

export function hasUsefulPortalData(data: any): boolean {
  return getPortalDataCounts(data).total > 0;
}

export function assertUsefulPortalSyncData(data: any, message = 'Portal sync returned no usable data') {
  const counts = getPortalDataCounts(data);
  if (counts.total === 0) {
    throw new PortalDataIntegrityError(message, counts);
  }
}
