/**
 * Infers school terms from the portal calendar.
 *
 * The portal publishes holidays but never term numbers, so terms are derived from the gaps
 * between them: an Australian school year runs four terms separated by three mid-year breaks,
 * with Term 1 starting late January or early February after the summer break.
 *
 * Everything here is pure and date-only. Callers pass the raw portal calendar entries and get
 * back terms for one calendar year, or null when the calendar does not cover enough of it.
 */

export interface SchoolTerm {
  /** 1-4. Terms are numbered by order within the calendar year. */
  readonly number: number;
  readonly label: string;
  readonly start: Date;
  /** Inclusive last day of the term. */
  readonly end: Date;
}

export interface PortalCalendarEntry {
  date?: unknown;
  title?: unknown;
  type?: unknown;
}

/** Runs shorter than this are public holidays or pupil-free days, not term breaks. */
const MIN_BREAK_DAYS = 7;

/** Gap tolerated inside one break so a weekend does not split it in two. */
const MAX_RUN_GAP_DAYS = 3;

/** A break starting on or before this day-of-year is the summer break preceding Term 1. */
const SUMMER_BREAK_CUTOFF_MONTH = 1; // February (0-indexed)

/** Used only when the calendar has no leading summer break to end. */
const FALLBACK_TERM_ONE_START = { month: 0, day: 29 };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

/**
 * Parses the date shapes the portal emits: ISO (`2026-03-12`), day-first numeric
 * (`12/03/2026`, `12-3-26`), and day-month-name (`12 Mar 2026`, `Mar 12 2026`).
 * Day-first is assumed for ambiguous numeric dates because the portal is Australian.
 */
export function parsePortalDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : startOfDay(value);
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (iso) return buildDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const numeric = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(trimmed);
  if (numeric) {
    const year = Number(numeric[3]);
    return buildDate(year < 100 ? 2000 + year : year, Number(numeric[2]) - 1, Number(numeric[1]));
  }

  const named = /^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{2,4})$/.exec(trimmed)
    || /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/.exec(trimmed);
  if (named) {
    const dayFirst = /^\d/.test(trimmed);
    const month = monthFromName(dayFirst ? named[2] : named[1]);
    if (month === null) return null;
    const day = Number(dayFirst ? named[1] : named[2]);
    const year = Number(named[3]);
    return buildDate(year < 100 ? 2000 + year : year, month, day);
  }

  return null;
}

const MONTH_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

function monthFromName(name: string): number | null {
  const index = MONTH_NAMES.indexOf(name.slice(0, 3).toLowerCase());
  return index < 0 ? null : index;
}

function buildDate(year: number, month: number, day: number): Date | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(year, month, day);
  // Rejects overflow such as 31 February silently rolling into March.
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

export function isHolidayEntry(entry: PortalCalendarEntry): boolean {
  return /holiday|vacation|break|pupil.?free|staff development/i.test(
    `${String(entry?.type ?? '')} ${String(entry?.title ?? '')}`
  );
}

interface DateRun {
  start: Date;
  end: Date;
  /** Inclusive length in calendar days. */
  length: number;
}

/** Groups sorted dates into runs, bridging gaps of up to `MAX_RUN_GAP_DAYS` (weekends). */
export function groupIntoRuns(dates: readonly Date[]): DateRun[] {
  const sorted = [...dates].sort((left, right) => left.getTime() - right.getTime());
  const runs: DateRun[] = [];

  for (const date of sorted) {
    const current = runs[runs.length - 1];
    if (current && daysBetween(current.end, date) <= MAX_RUN_GAP_DAYS) {
      if (date > current.end) current.end = date;
      continue;
    }
    runs.push({ start: date, end: date, length: 1 });
  }

  return runs.map((run) => ({ ...run, length: daysBetween(run.start, run.end) + 1 }));
}

/**
 * Derives the terms of one calendar year. Returns null when no term break can be found,
 * which is the honest answer for a calendar that has not been synced across a break.
 */
export function inferSchoolTerms(
  entries: readonly PortalCalendarEntry[],
  year: number
): SchoolTerm[] | null {
  const holidayDates = entries
    .filter(isHolidayEntry)
    .map((entry) => parsePortalDate(entry.date))
    .filter((date): date is Date => date !== null && date.getFullYear() === year);

  if (holidayDates.length === 0) return null;

  const runs = groupIntoRuns(holidayDates).filter((run) => run.length >= MIN_BREAK_DAYS);
  if (runs.length === 0) return null;

  const yearEnd = new Date(year, 11, 31);
  const summerBreak = runs.find((run) => run.start.getMonth() <= SUMMER_BREAK_CUTOFF_MONTH);
  const termOneStart = summerBreak
    ? addDays(summerBreak.end, 1)
    : new Date(year, FALLBACK_TERM_ONE_START.month, FALLBACK_TERM_ONE_START.day);

  const laterRuns = runs.filter((run) => run.start > termOneStart);
  // A December break closes Term 4 rather than separating two terms.
  const closingBreak = laterRuns.find((run) => run.start.getMonth() === 11);
  const separators = laterRuns.filter((run) => run !== closingBreak);

  // Keep the three longest breaks so a stray week-long event cannot invent a fifth term.
  const orderedSeparators = [...separators]
    .sort((left, right) => right.length - left.length)
    .slice(0, 3)
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  const terms: SchoolTerm[] = [];
  let cursor = termOneStart;

  orderedSeparators.forEach((separator) => {
    const end = addDays(separator.start, -1);
    if (end < cursor) return;
    terms.push(buildTerm(terms.length + 1, cursor, end));
    cursor = addDays(separator.end, 1);
  });

  const finalEnd = closingBreak ? addDays(closingBreak.start, -1) : yearEnd;
  if (finalEnd >= cursor) terms.push(buildTerm(terms.length + 1, cursor, finalEnd));

  return terms.length > 0 ? terms : null;
}

function buildTerm(number: number, start: Date, end: Date): SchoolTerm {
  return { number, label: `Term ${number}`, start, end };
}

export function findTermForDate(terms: readonly SchoolTerm[], date: Date): SchoolTerm | null {
  const day = startOfDay(date);
  return terms.find((term) => day >= term.start && day <= term.end) ?? null;
}

/** Terms for every year the calendar covers, keyed by calendar year. */
export function inferSchoolTermsByYear(
  entries: readonly PortalCalendarEntry[]
): Map<number, SchoolTerm[]> {
  const years = new Set<number>();
  entries.forEach((entry) => {
    const date = parsePortalDate(entry.date);
    if (date) years.add(date.getFullYear());
  });

  const byYear = new Map<number, SchoolTerm[]>();
  years.forEach((year) => {
    const terms = inferSchoolTerms(entries, year);
    if (terms) byYear.set(year, terms);
  });
  return byYear;
}
