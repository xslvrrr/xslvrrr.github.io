import type { FullTimetable, FullTimetableEntry, PortalData, TimetableEntry } from '../types/portal';
import { addCalendarDays, formatCalendarDate, parseCalendarDate } from './calendar-date';
import { parsePortalDate } from './school-terms';

/** Structural until the scraper's optional extensions land in PortalData. */
export type PortalClassChangeInput = Pick<PortalData, 'timetable'>
  & Partial<Pick<PortalData, 'calendar' | 'lastUpdated' | 'userId' | 'sync' | 'syncMeta'>> & {
    todayTimetable?: { date: string; entries: TimetableEntry[] };
    timetableReferences?: Array<{ date: string; timetable: FullTimetable }>;
  };

export type PortalTimetableWeek = 'weekA' | 'weekB';

interface ChangeDetails {
  date: string;
  /** Canonical full period, e.g. 3a; never collapses a/b into the numeric period. */
  period: string;
  /** Normalized destination class code for a class-change. */
  classCode: string;
  from: string;
  to: string;
}

export type PortalClassChange =
  | (ChangeDetails & { type: 'substitute' })
  | (ChangeDetails & { type: 'teacher-change'; referenceDates: string[] })
  | (ChangeDetails & { type: 'room-change' })
  | (ChangeDetails & { type: 'class-change' });

const WEEKS = ['weekA', 'weekB'] as const;
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const clean = (value: string | undefined) => (value ?? '').trim().replace(/\s+/g, ' ');
const comparable = (value: string | undefined) => clean(value).toLowerCase();

/** Civil strings are already school dates; instants are converted in Australia/Sydney. */
export function getPortalSchoolDate(value: string | Date): string | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return parseCalendarDate(value) ? value : null;
  }
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const instant = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** UI convenience; detection itself never reads the clock. */
export function getSchoolDate(now: Date = new Date()): string {
  const date = getPortalSchoolDate(now);
  if (!date) throw new RangeError('Cannot format an invalid school date');
  return date;
}

/** Same Week A anchor as the dashboard, using civil UTC days so DST cannot shift weeks. */
function weekTypeForSchoolDate(date: string): PortalTimetableWeek {
  const dayOffset = (Date.parse(`${date}T00:00:00Z`) - Date.UTC(2026, 1, 16)) / 86_400_000;
  return Math.floor(dayOffset / 7) % 2 === 0 ? 'weekA' : 'weekB';
}

export function getPortalWeekType(value: string | Date): PortalTimetableWeek | null {
  const date = getPortalSchoolDate(value);
  return date ? weekTypeForSchoolDate(date) : null;
}

/** UI convenience: today's rotation, which unlike an arbitrary value always resolves. */
export function getSchoolWeekType(now: Date = new Date()): PortalTimetableWeek {
  return weekTypeForSchoolDate(getSchoolDate(now));
}

export function normalizePortalClassCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

function periodKey(value: string): string {
  const match = /^(?:p(?:eriod)?\s*)?0*(\d+)\s*([ab]?)$/i.exec(clean(value));
  return match ? `${Number(match[1])}${match[2].toLowerCase()}` : comparable(value);
}

function monday(date: Date): string {
  return formatCalendarDate(addCalendarDays(date, -((date.getDay() + 6) % 7)));
}

function fullTimetable(value: PortalClassChangeInput['timetable'] | undefined): FullTimetable | null {
  return value && !Array.isArray(value)
    && Array.isArray(value.weekA) && Array.isArray(value.weekB) ? value : null;
}

/** Only dated markers within this school week establish a calendar rotation. */
function calendarWeek(data: PortalClassChangeInput, date: Date): PortalTimetableWeek | null | undefined {
  const labels = new Set<PortalTimetableWeek>();
  for (const event of data.calendar ?? []) {
    const eventDate = parsePortalDate(event?.date);
    if (!eventDate || monday(eventDate) !== monday(date)) continue;
    const text = `${String(event?.title ?? '')} ${String(event?.type ?? '')}`;
    for (const match of text.matchAll(/\bweek\s+([ab])\b/gi)) {
      labels.add(match[1].toLowerCase() === 'a' ? 'weekA' : 'weekB');
    }
  }
  return labels.size === 1 ? [...labels][0] : labels.size ? null : undefined;
}

/**
 * Same-week calendar labels and a unique homepage class/period pattern override
 * the dashboard's 2026-02-16 Week A anchor.
 * Inferred holiday/term boundaries do not prove a rotation reset. Conflicting
 * labels return null, requiring callers to agree across both rotations.
 */
export function resolvePortalTimetableWeek(
  data: PortalClassChangeInput,
  date: string,
): PortalTimetableWeek | null {
  const parsed = parseCalendarDate(date);
  if (!parsed) return null;
  const marked = calendarWeek(data, parsed);
  if (marked !== undefined) return marked;
  const timetable = fullTimetable(data.timetable);
  if (timetable && data.todayTimetable?.date === date) {
    const entries = data.todayTimetable.entries.filter((entry) => normalizePortalClassCode(entry.subject));
    const matches = entries.length ? WEEKS.filter((week) => entries.every((entry) => {
      const slot = readSlot(timetable, [week], parsed, periodKey(entry.period));
      return slot?.classCode === normalizePortalClassCode(entry.subject);
    })) : [];
    if (matches.length === 1) return matches[0];
  }
  return getPortalWeekType(date);
}

interface Slot { classCode: string; teacher: string; room: string }

function consensus(values: string[]): string {
  return values.length && values.every((value) => comparable(value) === comparable(values[0]))
    ? clean(values[0]) : '';
}

function readSlot(
  timetable: FullTimetable,
  weeks: readonly PortalTimetableWeek[],
  date: Date,
  period: string,
): Slot | null {
  const rows: FullTimetableEntry[] = [];
  for (const week of weeks) {
    const matches = timetable[week].filter((entry) => comparable(entry.day) === DAYS[date.getDay()]
      && periodKey(entry.period) === period);
    // An absent rotation/slot is unknown, not evidence of a deleted class.
    if (!matches.length) return null;
    rows.push(...matches);
  }
  const codes = rows.map((row) => normalizePortalClassCode(row.classCode));
  if (!codes[0] || !codes.every((code) => code === codes[0])) return null;
  return {
    classCode: codes[0],
    teacher: consensus(rows.map((row) => row.teacher)),
    room: consensus(rows.map((row) => row.room)),
  };
}

function hasReferenceFailure(data: PortalClassChangeInput): boolean {
  const relevant = (name: string) => /timetable|reference/i.test(name);
  return [...(data.sync?.failedPages ?? []), ...(data.syncMeta?.failedPages ?? [])]
    .some((failure) => relevant(`${failure.page} ${failure.section}`))
    || Object.entries(data.syncMeta?.sections ?? {})
      .some(([section, status]) => relevant(section) && status.failed > 0);
}

/** Every supplied reference in each of three distinct calendar weeks must agree. */
function sustainedTeacher(
  data: PortalClassChangeInput,
  date: Date,
  classCode: string,
  teacher: string,
): string[] | null {
  if (hasReferenceFailure(data)) return null;
  const buckets = [0, 7, 14].map((offset) => monday(addCalendarDays(date, offset)));
  const covered = new Set<string>();
  const dates = new Set<string>();
  for (const reference of data.timetableReferences ?? []) {
    const referenceDate = parseCalendarDate(reference.date);
    if (!referenceDate) return null;
    const bucket = monday(referenceDate);
    if (!buckets.includes(bucket)) continue;
    const timetable = fullTimetable(reference.timetable);
    if (!timetable) return null;
    // A reference can contain BOTH rotations; its request date does not select one.
    const week = resolvePortalTimetableWeek(data, reference.date);
    for (const rotation of week ? [week] : WEEKS) {
      const rows = timetable[rotation].filter((row) => normalizePortalClassCode(row.classCode) === classCode);
      if (!rows.length || rows.some((row) => !clean(row.teacher)
        || comparable(row.teacher) !== comparable(teacher))) return null;
    }
    covered.add(bucket);
    dates.add(reference.date);
  }
  return covered.size === 3 ? [...dates].sort() : null;
}

/**
 * Teacher changes are class-wide: stable across polling dates and repeated lessons.
 * Daily overrides retain their date AND full period. JSON tuples avoid delimiter collisions.
 * Persist these keys to acknowledge events; the detector itself stores no state.
 */
export function getPortalClassChangeKey(change: PortalClassChange): string {
  const values = change.type === 'class-change'
    ? [normalizePortalClassCode(change.from), normalizePortalClassCode(change.to)]
    : [comparable(change.from), comparable(change.to)];
  return JSON.stringify([
    change.type,
    ...(change.type === 'teacher-change' ? [] : [change.date, periodKey(change.period)]),
    normalizePortalClassCode(change.classCode),
    ...values,
  ]);
}

/** Codes for consumers to exclude from missing-class review after a slot replacement. */
export function getAffectedClassCodes(changes: readonly PortalClassChange[]): Set<string> {
  return new Set(changes.filter((change) => change.type === 'class-change')
    .flatMap((change) => [normalizePortalClassCode(change.from), normalizePortalClassCode(change.to)])
    .filter(Boolean));
}

/** One sentence per change, for surfaces that report a change rather than render it. */
export function describePortalClassChange(change: PortalClassChange): string {
  const where = `${change.classCode}, period ${change.period}, ${change.date}`;
  if (change.type === 'teacher-change') {
    return `${where}: ${change.to} has taken over from ${change.from}, and is still listed a fortnight ahead.`;
  }
  if (change.type === 'substitute') return `${where}: ${change.to} is covering for ${change.from}.`;
  if (change.type === 'room-change') return `${where}: moved from ${change.from} to ${change.to}.`;
  return `${where}: ${change.to} is timetabled instead of ${change.from}.`;
}

/**
 * A permanent handover also reaches the recurring grid, including for classes that do not meet
 * today. Confirmed against the same references; an unconfirmed grid difference emits nothing,
 * because a grid the portal has already rewritten is not evidence of a one-day cover.
 */
function detectSustainedGridChanges(
  current: PortalClassChangeInput,
  timetable: FullTimetable,
  prior: FullTimetable,
  date: Date,
  today: string,
  add: (change: PortalClassChange) => void,
): void {
  const before = new Map<string, string>();
  for (const week of WEEKS) {
    for (const entry of prior[week]) {
      before.set(
        [week, comparable(entry.day), periodKey(entry.period), normalizePortalClassCode(entry.classCode)].join('\u001f'),
        clean(entry.teacher),
      );
    }
  }
  for (const week of WEEKS) {
    for (const entry of timetable[week]) {
      const period = periodKey(entry.period);
      const code = normalizePortalClassCode(entry.classCode);
      const teacher = clean(entry.teacher);
      // A slot missing a teacher on either side is a partial scrape, not a vacancy.
      const was = before.get([week, comparable(entry.day), period, code].join('\u001f'));
      if (!period || !code || !teacher || !was || comparable(was) === comparable(teacher)) continue;
      const referenceDates = sustainedTeacher(current, date, code, teacher);
      if (referenceDates) {
        add({ date: today, period, classCode: code, type: 'teacher-change', from: was, to: teacher, referenceDates });
      }
    }
  }
}

/**
 * Pure overlay detection: never changes the normal recurring timetable.
 * Previous must be a prior persisted snapshot for the same student. A previous
 * homepage override is deliberately NEVER a normal-teacher baseline.
 * Without complete reference evidence, only an actual homepage-vs-current teacher
 * difference is a substitute; an unconfirmed historical change emits nothing.
 */
export function detectPortalClassChanges(
  current: PortalClassChangeInput,
  previous?: PortalClassChangeInput | null,
): PortalClassChange[] {
  const today = current.todayTimetable;
  const date = today && parseCalendarDate(today.date);
  const timetable = fullTimetable(current.timetable);
  if (!today || !date || !timetable) return [];
  const differentUser = current.userId && previous?.userId && current.userId !== previous.userId;
  const currentTime = Date.parse(current.lastUpdated ?? '');
  const previousTime = Date.parse(previous?.lastUpdated ?? '');
  const prior = differentUser || previousTime >= currentTime ? null : fullTimetable(previous?.timetable);
  const week = resolvePortalTimetableWeek(current, today.date);
  const weeks = week ? [week] : WEEKS;
  const changes = new Map<string, PortalClassChange>();
  const add = (change: PortalClassChange) => changes.set(getPortalClassChangeKey(change), change);
  const entries = new Map<string, TimetableEntry[]>();
  for (const entry of today.entries) {
    const period = periodKey(entry.period);
    if (period) entries.set(period, [...(entries.get(period) ?? []), entry]);
  }
  for (const [period, rows] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
    const code = normalizePortalClassCode(rows[0].subject);
    if (!code || rows.some((row) => normalizePortalClassCode(row.subject) !== code)) continue;
    const teacher = consensus(rows.map((row) => row.teacher));
    const room = consensus(rows.map((row) => row.room));
    const normal = readSlot(timetable, weeks, date, period);
    if (!normal) continue;
    const old = prior && readSlot(prior, weeks, date, period);
    const base = { date: today.date, period, classCode: code };
    const replaced = normal.classCode !== code ? normal : old?.classCode !== code ? old : null;
    if (replaced) {
      add({ ...base, type: 'class-change', from: replaced.classCode, to: code });
      // Teacher/room differences between different classes are not separate changes.
      continue;
    }
    const todayTeacherDiffers = teacher && normal.teacher && comparable(teacher) !== comparable(normal.teacher);
    const oldTeacher = todayTeacherDiffers ? normal.teacher
      : old?.classCode === code ? old.teacher : '';
    if (teacher && oldTeacher && comparable(teacher) !== comparable(oldTeacher)) {
      const referenceDates = sustainedTeacher(current, date, code, teacher);
      if (referenceDates) add({ ...base, type: 'teacher-change', from: oldTeacher, to: teacher, referenceDates });
      else if (todayTeacherDiffers) add({ ...base, type: 'substitute', from: oldTeacher, to: teacher });
    }
    const oldRoom = normal.room && comparable(normal.room) !== comparable(room) ? normal.room
      : old?.classCode === code ? old.room : '';
    if (room && oldRoom && comparable(room) !== comparable(oldRoom)) {
      add({ ...base, type: 'room-change', from: oldRoom, to: room });
    }
  }
  if (prior) detectSustainedGridChanges(current, timetable, prior, date, today.date, add);
  return [...changes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, change]) => change);
}
