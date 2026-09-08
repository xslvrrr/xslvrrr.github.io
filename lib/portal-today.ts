import type { FullTimetable, FullTimetableEntry, PortalData, TimetableEntry, TodayTimetable } from '@/types/portal';
import { getSchoolDate, getSchoolWeekType } from './portal-class-changes';

/** School dates are civil days, so the weekday has to be read back in UTC rather than locally. */
function weekdayName(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' });
}

export function currentHomepageTimetable(today: TodayTimetable | undefined, now = new Date()): TodayTimetable | undefined {
  return today?.date === getSchoolDate(now) ? today : undefined;
}

/** Display-only overlay. Never write this back over the normal Week A/B timetable. */
export function overlayTodayTimetable(
  timetable: FullTimetable,
  today: TodayTimetable | undefined,
  currentWeek: 'weekA' | 'weekB',
  now = new Date(),
): FullTimetable {
  const current = currentHomepageTimetable(today, now);
  if (!current) return timetable;
  const day = weekdayName(current.date);
  const allEntries = [...timetable.weekA, ...timetable.weekB];
  const entries: FullTimetableEntry[] = current.entries.map(entry => ({
    day, period: entry.period, classCode: entry.subject, teacher: entry.teacher, room: entry.room,
    course: allEntries.find(value => value.classCode.trim().toLowerCase() === entry.subject.trim().toLowerCase())?.course || entry.subject,
  }));
  return { ...timetable, [currentWeek]: [...timetable[currentWeek].filter(entry => entry.day.toLowerCase() !== day.toLowerCase()), ...entries] };
}

export function getTodayClasses(data: PortalData | null | undefined, now = new Date()): TimetableEntry[] {
  if (!data) return [];
  const current = currentHomepageTimetable(data.todayTimetable, now);
  if (current) return current.entries;
  if (Array.isArray(data.timetable)) return data.timetable;
  const timetable = data.timetable;
  if (!timetable) return [];
  const day = weekdayName(getSchoolDate(now));
  return timetable[getSchoolWeekType(now)]
    .filter(entry => entry.day.toLowerCase() === day.toLowerCase())
    .map(entry => ({ period: entry.period, subject: entry.course || entry.classCode,
      teacher: entry.teacher, room: entry.room, attendanceStatus: 'unmarked' }));
}
