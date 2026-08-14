export type CalendarDateString = `${number}-${number}-${number}`;

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a provider calendar date without converting it through UTC.
 * Google Calendar all-day dates are civil dates, not instants.
 */
export function parseCalendarDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(0);
  parsed.setHours(0, 0, 0, 0);
  parsed.setFullYear(year, month - 1, day);

  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function formatCalendarDate(value: Date): CalendarDateString {
  if (!Number.isFinite(value.getTime())) {
    throw new RangeError('Cannot format an invalid calendar date');
  }

  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}` as CalendarDateString;
}

export function addCalendarDays(value: Date, days: number): Date {
  if (!Number.isFinite(value.getTime()) || !Number.isInteger(days)) {
    throw new RangeError('Calendar date and day offset must be valid');
  }

  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Google Calendar requires an exclusive end date for all-day events.
 * New single-day UI events supply the same start and end date, while mapped
 * Google events already carry an exclusive end. Preserve the latter.
 */
export function toExclusiveAllDayEnd(start: Date, end?: Date): CalendarDateString {
  const startDate = new Date(start);
  startDate.setHours(0, 0, 0, 0);
  if (!Number.isFinite(startDate.getTime())) {
    throw new RangeError('All-day event start date must be valid');
  }

  const candidate = end && Number.isFinite(end.getTime())
    ? new Date(end)
    : startDate;
  candidate.setHours(0, 0, 0, 0);
  const exclusiveEnd = candidate.getTime() > startDate.getTime()
    ? candidate
    : addCalendarDays(startDate, 1);

  return formatCalendarDate(exclusiveEnd);
}
