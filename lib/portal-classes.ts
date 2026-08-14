import type { ClassEntry } from '@/types/portal';

/**
 * Portal class tables occasionally leak rows from unrelated tables on the same page
 * (room lists, period indexes), which surface as "classes" named `100`, `101`, `102`.
 * Every genuine course name contains letters, so that is the discriminator used here,
 * plus the header/footer labels the portal repeats inside table bodies.
 */

const HEADER_LABELS = new Set([
  'course',
  'courses',
  'subject',
  'subjects',
  'class',
  'classes',
  'teacher',
  'teachers',
  'room',
  'rooms',
  'total',
  'totals',
  'lessons',
  'merits',
  'quick merits',
  'rolls',
  'rolls marked',
  'rollsmarked',
  'absences',
  'absent',
]);

const MIN_COURSE_LENGTH = 2;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normalize(value: unknown): string {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

function hasLetters(value: string): boolean {
  return /[a-z]/i.test(value);
}

/** Stable identity for a class row, matching `getClassReviewKey` in the classes UI. */
export function portalClassKey(entry: Pick<ClassEntry, 'course' | 'classCode'>): string {
  const code = normalize(entry?.classCode);
  if (code) return `code:${code}`;
  return `course:${normalize(entry?.course)}`;
}

/**
 * True when a scraped row is not a real class. Rejects numeric-only names, header and
 * total labels the portal repeats mid-table, and rows with no usable course at all.
 */
export function isJunkClassEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return true;

  const candidate = entry as Partial<ClassEntry>;
  const course = clean(candidate.course);
  const classCode = clean(candidate.classCode);

  if (!course && !classCode) return true;

  const label = course || classCode;
  if (label.length < MIN_COURSE_LENGTH) return true;
  if (!hasLetters(label)) return true;
  if (HEADER_LABELS.has(normalize(label))) return true;
  if (normalize(label).startsWith('total:')) return true;

  // A row whose course is only digits/punctuation is table bleed even when a code exists.
  if (course && !hasLetters(course)) return true;

  return false;
}

/** Drops junk rows and duplicates while preserving portal order. */
export function sanitizeClassEntries<T extends Partial<ClassEntry>>(entries: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(entries)) return [];

  const seen = new Set<string>();
  const result: T[] = [];

  for (const entry of entries) {
    if (isJunkClassEntry(entry)) continue;
    const key = portalClassKey(entry as ClassEntry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }

  return result;
}

/** Junk rows found in already-stored data, so callers can report what was cleaned up. */
export function findJunkClassEntries<T extends Partial<ClassEntry>>(entries: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => isJunkClassEntry(entry));
}

/** Removes keys belonging to junk classes from a saved preference list. */
export function pruneJunkClassKeys(
  keys: readonly string[] | null | undefined,
  junkEntries: readonly Partial<ClassEntry>[]
): string[] {
  const list = Array.isArray(keys) ? keys : [];
  if (junkEntries.length === 0) return [...list];

  const junkKeys = new Set(junkEntries.map((entry) => portalClassKey(entry as ClassEntry)));
  return list.filter((key) => !junkKeys.has(key));
}

/** Removes colour overrides saved against junk class codes. */
export function pruneJunkClassColors(
  colors: Readonly<Record<string, string>> | null | undefined,
  junkEntries: readonly Partial<ClassEntry>[]
): Record<string, string> {
  const source = colors && typeof colors === 'object' ? colors : {};
  if (junkEntries.length === 0) return { ...source };

  const junkCodes = new Set(
    junkEntries
      .map((entry) => clean(entry?.classCode))
      .filter(Boolean)
  );

  return Object.fromEntries(
    Object.entries(source).filter(([code]) => !junkCodes.has(code))
  );
}
