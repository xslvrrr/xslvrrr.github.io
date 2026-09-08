import { parsePortalDate } from './school-terms';
import { formatCalendarDate } from './calendar-date';
import type { AttendancePeriodDay, AttendancePeriodMark } from '@/types/portal';

function dateKey(date: string): string {
  const parsed = parsePortalDate(date);
  return parsed ? formatCalendarDate(parsed) : date.trim();
}

/** A homepage refresh contributes one day, not a replacement for the register's history. */
export function mergeAttendancePeriods(
  existing: AttendancePeriodDay[] = [],
  incoming: AttendancePeriodDay[] = [],
): AttendancePeriodDay[] {
  const days = new Map<string, AttendancePeriodDay>();
  for (const day of [...existing, ...incoming]) {
    const key = dateKey(day.date);
    if (!key) continue;
    const previous = days.get(key);
    const periods = new Map<string, AttendancePeriodMark>();
    for (const mark of [...(previous?.periods || []), ...(day.periods || [])]) {
      const label = mark.label.trim().toLowerCase().replace(/^p/, '');
      if (!label) continue;
      const saved = periods.get(label);
      // An uncoloured homepage span is not evidence that an official mark was revoked.
      const sameClass = !saved?.classCode || !mark.classCode
        || saved.classCode.trim().toLowerCase() === mark.classCode.trim().toLowerCase();
      if (saved && sameClass && mark.status === 'unmarked' && saved.status !== 'unmarked') continue;
      periods.set(label, { ...saved, ...mark, reason: mark.reason || saved?.reason });
    }
    days.set(key, { ...previous, ...day, date: key, periods: [...periods.values()] });
  }
  return [...days.values()].sort((left, right) => right.date.localeCompare(left.date));
}
