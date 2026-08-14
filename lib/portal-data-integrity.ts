export interface PortalDataCounts {
  timetable: number;
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

export function getPortalDataCounts(data: any): PortalDataCounts {
  const timetable = Array.isArray(data?.timetable)
    ? data.timetable.length
    : (data?.timetable?.weekA?.length || 0) + (data?.timetable?.weekB?.length || 0);
  const attendanceYears = data?.attendance?.yearly?.length || 0;
  const attendanceSubjects = data?.attendance?.subjects?.length || 0;

  const counts = {
    timetable,
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
