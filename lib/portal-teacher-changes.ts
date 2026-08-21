/**
 * Telling a permanent teacher change apart from a one-off substitute.
 *
 * The portal never says which it is. A class simply has a different name against it one morning,
 * and the student has to work out whether their teacher has actually changed for the rest of the
 * year or whether someone is covering a single lesson. Those two facts warrant completely different
 * reactions, and until now the product reported neither: the timetable diff treated a teacher swap
 * as an ordinary field change, indistinguishable from a room move.
 *
 * The portal will answer the question if it is asked twice. The fortnightly grid is served for a
 * date, so fetching it again for the same weekday a fortnight out — the same point in the Week A/B
 * rotation — shows what the timetable is expected to look like once any short-term cover has
 * lapsed. If the new name is still there, the change is permanent. If the old name is back, someone
 * is covering.
 *
 * This module is pure: it is handed the previous grid, the freshly scraped grid, and the lookahead
 * grid, and it returns the changes. Fetching is the scraper's job and storing is the caller's.
 */

export type TeacherChangeKind = 'permanent' | 'substitute' | 'unconfirmed';

export interface TimetableEntryLike {
  day?: unknown;
  period?: unknown;
  course?: unknown;
  classCode?: unknown;
  teacher?: unknown;
  room?: unknown;
}

export interface FullTimetableLike {
  weekA?: unknown;
  weekB?: unknown;
}

export type TimetableWeek = 'weekA' | 'weekB';

export interface TeacherChange {
  /**
   * Stable identity for one change, so a change already shown is not shown again on the next sync.
   *
   * Both teachers are part of it deliberately. A class that changes hands twice in a term is two
   * separate pieces of news, and keying on the period alone would silently swallow the second.
   */
  key: string;
  week: TimetableWeek;
  day: string;
  period: string;
  course: string;
  classCode: string;
  room: string;
  previousTeacher: string;
  currentTeacher: string;
  kind: TeacherChangeKind;
  /** The day the lookahead grid was fetched for, or null when there was no lookahead to read. */
  lookaheadDate: string | null;
}

/** How far ahead to look. Two weeks is one full Week A/B rotation, so the same day of the cycle. */
export const TEACHER_LOOKAHEAD_DAYS = 14;

const WEEKS: readonly TimetableWeek[] = ['weekA', 'weekB'];

/** Upper bound on how many changes one sync may report, so a mangled scrape cannot flood the modal. */
export const MAX_TEACHER_CHANGES_PER_SYNC = 24;

function text(value: unknown, maximum = 120): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

/**
 * Whether two teacher names are the same person as far as the portal is concerned.
 *
 * The portal is inconsistent about case, spacing and trailing punctuation between pages — the
 * fortnight grid and the same grid fetched for another date have been seen to disagree on
 * "MRS J SMITH" versus "Mrs J Smith". Comparing raw strings would report a teacher change every
 * sync for classes nobody had touched.
 */
function sameTeacher(left: string, right: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return normalize(left) === normalize(right);
}

/**
 * The identity of a timetable slot, independent of who teaches it.
 *
 * Room is not part of it: a room move and a teacher change are separate events, and folding the
 * room in would make a relocated class look like a brand-new slot with no previous teacher to
 * compare against.
 */
function slotKey(week: TimetableWeek, entry: TimetableEntryLike): string {
  return [
    week,
    text(entry.day, 20).toLowerCase(),
    text(entry.period, 12).toLowerCase(),
    text(entry.classCode, 40).toLowerCase(),
    text(entry.course, 80).toLowerCase(),
  ].join('');
}

function indexTimetable(timetable: FullTimetableLike | null | undefined): Map<string, TimetableEntryLike> {
  const index = new Map<string, TimetableEntryLike>();
  if (!timetable || typeof timetable !== 'object') return index;

  for (const week of WEEKS) {
    const entries = (timetable as Record<string, unknown>)[week];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as TimetableEntryLike;
      // First writer wins. A duplicated row in the portal's HTML is the same lesson twice, and
      // letting the later copy overwrite would make the comparison depend on scrape order.
      const key = slotKey(week, candidate);
      if (!index.has(key)) index.set(key, candidate);
    }
  }

  return index;
}

/**
 * How a change looks a fortnight out.
 *
 * `unconfirmed` covers three different situations that share one honest answer: there was no
 * lookahead grid, the slot is missing from it (a one-off timetable collapse, an exam block), or a
 * third name has appeared. Guessing between permanent and substitute on that evidence would be
 * inventing a fact, and the modal says "unconfirmed" rather than picking one.
 */
function classify(
  change: Pick<TeacherChange, 'previousTeacher' | 'currentTeacher'>,
  lookaheadEntry: TimetableEntryLike | undefined,
): TeacherChangeKind {
  if (!lookaheadEntry) return 'unconfirmed';
  const ahead = text(lookaheadEntry.teacher);
  if (!ahead) return 'unconfirmed';
  if (sameTeacher(ahead, change.currentTeacher)) return 'permanent';
  if (sameTeacher(ahead, change.previousTeacher)) return 'substitute';
  return 'unconfirmed';
}

export interface DetectTeacherChangesInput {
  previous: FullTimetableLike | null | undefined;
  current: FullTimetableLike | null | undefined;
  /** The same fortnight grid fetched for a date `TEACHER_LOOKAHEAD_DAYS` later, when one was taken. */
  lookahead?: FullTimetableLike | null;
  /** ISO date the lookahead grid was fetched for, recorded so the modal can say what it checked. */
  lookaheadDate?: string | null;
}

/**
 * Every slot whose teacher changed between two syncs, classified.
 *
 * A slot with no previous teacher, or no current one, is not a change. Those are the first sync for
 * a class and a partial scrape respectively, and reporting either would mean telling a student
 * their teacher changed on the day they signed up.
 */
export function detectTeacherChanges(input: DetectTeacherChangesInput): TeacherChange[] {
  const previousIndex = indexTimetable(input.previous);
  if (previousIndex.size === 0) return [];

  const lookaheadIndex = indexTimetable(input.lookahead);
  const lookaheadDate = input.lookahead ? text(input.lookaheadDate, 40) || null : null;
  const changes: TeacherChange[] = [];

  for (const week of WEEKS) {
    const entries = (input.current as Record<string, unknown> | null | undefined)?.[week];
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as TimetableEntryLike;
      const currentTeacher = text(candidate.teacher);
      if (!currentTeacher) continue;

      const key = slotKey(week, candidate);
      const previousEntry = previousIndex.get(key);
      if (!previousEntry) continue;

      const previousTeacher = text(previousEntry.teacher);
      if (!previousTeacher || sameTeacher(previousTeacher, currentTeacher)) continue;

      const change: TeacherChange = {
        key: `${key}${previousTeacher.toLowerCase()}${currentTeacher.toLowerCase()}`,
        week,
        day: text(candidate.day, 20),
        period: text(candidate.period, 12),
        course: text(candidate.course, 80),
        classCode: text(candidate.classCode, 40),
        room: text(candidate.room, 40),
        previousTeacher,
        currentTeacher,
        kind: 'unconfirmed',
        lookaheadDate,
      };
      change.kind = classify(change, lookaheadIndex.get(key));
      changes.push(change);

      if (changes.length >= MAX_TEACHER_CHANGES_PER_SYNC) return changes;
    }
  }

  return changes;
}

/** The date the lookahead grid should be fetched for, given the day the sync is running. */
export function teacherLookaheadDate(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + TEACHER_LOOKAHEAD_DAYS);
}

export function describeTeacherChange(change: TeacherChange): string {
  const where = [change.course || change.classCode, change.period && `period ${change.period}`, change.day]
    .filter(Boolean)
    .join(', ');
  if (change.kind === 'permanent') {
    return `${where}: ${change.currentTeacher} has taken over from ${change.previousTeacher}.`;
  }
  if (change.kind === 'substitute') {
    return `${where}: ${change.currentTeacher} is covering for ${change.previousTeacher}.`;
  }
  return `${where}: ${change.currentTeacher} is listed instead of ${change.previousTeacher}. Whether that is permanent is not confirmed yet.`;
}
