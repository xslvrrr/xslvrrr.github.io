/**
 * Resolving a school day into an actual list of classes.
 *
 * The assistant used to be handed `weekA` and `weekB` as two undifferentiated grids and asked to
 * work out, in prose, which one applies today, whether today is a school day at all, and what time
 * each period runs. That is three separate deductions before the first useful word, and free models
 * get all three wrong often enough that "what have I got today" was the least reliable question in
 * the product rather than the easiest.
 *
 * None of it needs a model. The week rotation is arithmetic, the holiday check is a lookup, and the
 * bell times are a constant. This module does all three and returns the answer, so the tool that
 * uses it hands the model a finished list to read out.
 *
 * Pure and date-only. Callers pass raw portal data; nothing here touches the network or the clock
 * except through the `now` argument.
 */

import { getPeriodBounds } from "../bell-times.ts";
import { isHolidayEntry, parsePortalDate } from "../school-terms.ts";

export type TimetableWeekKey = "weekA" | "weekB";

/**
 * The Monday that starts a Week A.
 *
 * Mirrors `getAutoWeekType` in the dashboard screen, which is the only other place the rotation is
 * decided. Kept as a date literal in one module so the client and the assistant cannot drift into
 * disagreeing about which week it is — a disagreement a student would read as the assistant being
 * wrong, since the grid on screen is the thing they trust.
 */
export const WEEK_A_REFERENCE = new Date(2026, 1, 16);

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

export interface ScheduledPeriod {
  period: string;
  course: string;
  classCode: string;
  teacher: string;
  room: string;
  /** `HH:MM` in school local time, or null when the period code has no known bell time. */
  startsAt: string | null;
  endsAt: string | null;
  /** Minutes from midnight, for ordering and for "what is on now". */
  startMinutes: number | null;
  endMinutes: number | null;
}

export interface DaySchedule {
  /** `YYYY-MM-DD` for the day this describes. */
  date: string;
  weekday: string;
  week: TimetableWeekKey | null;
  weekLabel: "Week A" | "Week B" | null;
  isWeekend: boolean;
  /** True only when classes actually run: a weekday, not a holiday, with timetable rows. */
  isSchoolDay: boolean;
  /** Plain-language reason when `isSchoolDay` is false, for the model to quote. */
  notSchoolDayReason: string | null;
  /** Titles of any calendar entries falling on this date, holiday or not. */
  calendarEvents: string[];
  periods: ScheduledPeriod[];
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function toIsoDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function toClockTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function cleanText(value: unknown, maximum = 200): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

/**
 * Which week of the fortnight a date falls in.
 *
 * `Math.floor` on a negative difference already rounds towards negative infinity, so a date before
 * the reference alternates correctly without a special case — `-1` is Week B, `-2` is Week A.
 */
export function resolveWeekType(date: Date): TimetableWeekKey {
  const weekNumber = Math.floor((startOfDay(date).getTime() - WEEK_A_REFERENCE.getTime()) / MS_PER_WEEK);
  return ((weekNumber % 2) + 2) % 2 === 0 ? "weekA" : "weekB";
}

/** The identity used to match a timetable row against the unenrolled list, as the snapshot does. */
export function timetableEntryKey(entry: any): string {
  const code = cleanText(entry?.classCode, 80).toLowerCase().replace(/\s+/g, " ");
  const course = cleanText(entry?.course || entry?.subject, 200).toLowerCase().replace(/\s+/g, " ");
  return code ? `code:${code}` : `course:${course}`;
}

function comparePeriods(left: ScheduledPeriod, right: ScheduledPeriod): number {
  if (left.startMinutes !== null && right.startMinutes !== null) {
    if (left.startMinutes !== right.startMinutes) return left.startMinutes - right.startMinutes;
  } else if (left.startMinutes === null && right.startMinutes !== null) {
    return 1;
  } else if (left.startMinutes !== null && right.startMinutes === null) {
    return -1;
  }
  return left.period.localeCompare(right.period, undefined, { numeric: true });
}

export interface ResolveScheduleOptions {
  /** Class identities the student has marked as no longer theirs. */
  unenrolledClassKeys?: Iterable<string>;
}

/**
 * The classes that run on one date.
 *
 * A day with no timetable rows is reported as not a school day with the reason stated, rather than
 * as an empty list — "you have nothing on" and "I could not tell" read identically to a student and
 * mean opposite things.
 */
export function resolveDaySchedule(
  portalData: any,
  date: Date,
  options: ResolveScheduleOptions = {},
): DaySchedule {
  const day = startOfDay(date);
  const weekday = WEEKDAY_NAMES[day.getDay()];
  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
  const unenrolled = new Set(options.unenrolledClassKeys || []);

  const calendarEntries = Array.isArray(portalData?.calendar) ? portalData.calendar : [];
  const onThisDate = calendarEntries.filter((entry: any) => {
    const single = parsePortalDate(entry?.date);
    if (single && toIsoDate(single) === toIsoDate(day)) return true;
    const many = Array.isArray(entry?.dates) ? entry.dates : [];
    return many.some((value: unknown) => {
      const parsed = parsePortalDate(value);
      return parsed !== null && toIsoDate(parsed) === toIsoDate(day);
    });
  });
  const holiday = onThisDate.find((entry: any) => isHolidayEntry(entry));

  const timetable = portalData?.timetable;
  const rows = timetable && !Array.isArray(timetable)
    ? (Array.isArray(timetable[resolveWeekType(day)]) ? timetable[resolveWeekType(day)] : [])
    : [];
  const hasAnyTimetable = timetable && !Array.isArray(timetable)
    && ((timetable.weekA?.length || 0) + (timetable.weekB?.length || 0)) > 0;

  const periods: ScheduledPeriod[] = isWeekend || holiday
    ? []
    : rows
      .filter((entry: any) => cleanText(entry?.day, 40).toLowerCase() === weekday.toLowerCase())
      .filter((entry: any) => !unenrolled.has(timetableEntryKey(entry)))
      .map((entry: any) => {
        const period = cleanText(entry?.period, 40);
        const bounds = getPeriodBounds(weekday, period);
        return {
          period,
          course: cleanText(entry?.course || entry?.subject, 200),
          classCode: cleanText(entry?.classCode, 80),
          teacher: cleanText(entry?.teacher, 200),
          room: cleanText(entry?.room, 100),
          startsAt: bounds ? toClockTime(bounds.start) : null,
          endsAt: bounds ? toClockTime(bounds.end) : null,
          startMinutes: bounds ? bounds.start : null,
          endMinutes: bounds ? bounds.end : null,
        };
      })
      .sort(comparePeriods);

  const notSchoolDayReason = isWeekend
    ? `${weekday} is a weekend.`
    : holiday
      ? `${cleanText(holiday.title, 240) || "A school holiday"} falls on this date.`
      : !hasAnyTimetable
        ? "No timetable has been synced from the portal yet."
        : periods.length === 0
          ? "The timetable has no periods for this day."
          : null;

  return {
    date: toIsoDate(day),
    weekday,
    week: isWeekend ? null : resolveWeekType(day),
    weekLabel: isWeekend ? null : resolveWeekType(day) === "weekA" ? "Week A" : "Week B",
    isWeekend,
    isSchoolDay: notSchoolDayReason === null,
    notSchoolDayReason,
    calendarEvents: onThisDate.map((entry: any) => cleanText(entry?.title, 240)).filter(Boolean).slice(0, 20),
    periods,
  };
}

export interface NextClassResult {
  /** Null when no school day with classes was found inside the search window. */
  period: ScheduledPeriod | null;
  date: string | null;
  weekday: string | null;
  weekLabel: string | null;
  /** True when the class is later on the same date the search started from. */
  isToday: boolean;
  /** Days skipped, with why, so the answer can say "Monday, because Friday is a pupil-free day". */
  skipped: Array<{ date: string; weekday: string; reason: string }>;
}

/** How far ahead to look before giving up. Two full fortnights covers any normal break. */
const NEXT_CLASS_SEARCH_DAYS = 28;

/**
 * The next class after a moment in time.
 *
 * Walks forward day by day rather than jumping to "tomorrow", because the reason a next-class answer
 * is wrong is almost always a day that was skipped silently. Every skipped day comes back in
 * `skipped` with its reason attached.
 */
export function findNextClass(
  portalData: any,
  now: Date,
  options: ResolveScheduleOptions = {},
): NextClassResult {
  const startMinutes = now.getHours() * 60 + now.getMinutes();
  const skipped: NextClassResult["skipped"] = [];

  for (let offset = 0; offset < NEXT_CLASS_SEARCH_DAYS; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const schedule = resolveDaySchedule(portalData, date, options);

    if (!schedule.isSchoolDay) {
      if (schedule.notSchoolDayReason?.startsWith("No timetable")) break;
      skipped.push({
        date: schedule.date,
        weekday: schedule.weekday,
        reason: schedule.notSchoolDayReason || "Not a school day.",
      });
      continue;
    }

    const candidate = offset === 0
      ? schedule.periods.find((entry) => entry.startMinutes === null || entry.startMinutes > startMinutes)
      : schedule.periods[0];

    if (candidate) {
      return {
        period: candidate,
        date: schedule.date,
        weekday: schedule.weekday,
        weekLabel: schedule.weekLabel,
        isToday: offset === 0,
        skipped,
      };
    }

    if (offset === 0) {
      skipped.push({
        date: schedule.date,
        weekday: schedule.weekday,
        reason: "The school day has already finished.",
      });
    }
  }

  return { period: null, date: null, weekday: null, weekLabel: null, isToday: false, skipped };
}

/** The class running right now, if one is. */
export function findCurrentClass(
  portalData: any,
  now: Date,
  options: ResolveScheduleOptions = {},
): ScheduledPeriod | null {
  const schedule = resolveDaySchedule(portalData, now, options);
  if (!schedule.isSchoolDay) return null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return schedule.periods.find((entry) => (
    entry.startMinutes !== null
    && entry.endMinutes !== null
    && minutes >= entry.startMinutes
    && minutes < entry.endMinutes
  )) || null;
}
