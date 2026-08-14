import { portalClassKey, sanitizeClassEntries } from '@/lib/portal-classes';
import type { PortalData } from '@/types/portal';

function hasItems(value: any): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return !!value && typeof value === 'object' && Object.values(value).some((entry) => Array.isArray(entry) && entry.length > 0);
}

function mergeByKey<T>(existing: T[] | undefined, incoming: T[] | undefined, keyFor: (item: T) => string): T[] {
  const merged = new Map<string, T>();
  [...(existing || []), ...(incoming || [])].forEach((item) => {
    const key = keyFor(item);
    if (key) merged.set(key, { ...((merged.get(key) as any) || {}), ...(item as any) });
  });
  return Array.from(merged.values());
}

function mergeNotices(existing: any[] | undefined, incoming: any[] | undefined): any[] {
  const merged = new Map<string, any>();
  [...(existing || []), ...(incoming || [])].forEach((notice) => {
    const plainText = String(notice?.content || '');
    const compactHtml = typeof notice?.contentHtml === 'string'
      ? notice.contentHtml
          .replace(/<img\b[^>]*\bsrc\s*=\s*["']?data:[^>]*>/gi, '')
          .replace(/data:[^"'\s>]+/gi, '')
          .trim()
          .slice(0, 64 * 1024)
      : '';
    const key = [
      String(notice?.title || '').trim().toLowerCase(),
      String(notice?.content || notice?.preview || '').trim().toLowerCase(),
    ].join('::');
    if (!key.trim()) return;

    const current = merged.get(key) || {};
    const dates = new Set([
      ...(Array.isArray(current.dates) ? current.dates : []),
      ...(current.date ? [current.date] : []),
      ...(Array.isArray(notice?.dates) ? notice.dates : []),
      ...(notice?.date ? [notice.date] : []),
    ].filter(Boolean));
    const nextDates = Array.from(dates).sort();

    merged.set(key, {
      ...current,
      ...notice,
      contentHtml: compactHtml && compactHtml !== plainText ? compactHtml : undefined,
      date: nextDates[nextDates.length - 1] || notice?.date || current.date,
      dates: nextDates.length ? nextDates : undefined,
    });
  });
  return Array.from(merged.values());
}

export function compactPortalNotices(notices: unknown): any[] {
  return mergeNotices([], Array.isArray(notices) ? notices : []);
}

const TIMETABLE_KEY_FIELDS = ['day', 'period', 'classCode', 'course', 'subject'] as const;

function timetableEntryKey(entry: any): string {
  return TIMETABLE_KEY_FIELDS
    .map((field) => String(entry?.[field] ?? '').trim().toLowerCase())
    .join('');
}

/**
 * Timetables arrive as deltas too: a sync that only changed one period sends only that period.
 * Mirroring the payload would leave the dashboard holding a one-period week, so weeks are merged
 * entry by entry against the same key the server-side diff uses.
 */
function mergeTimetable(existing: any, incoming: any) {
  if (!hasItems(incoming)) return existing ?? incoming;
  if (Array.isArray(existing) || Array.isArray(incoming)) {
    return mergeByKey(
      Array.isArray(existing) ? existing : undefined,
      Array.isArray(incoming) ? incoming : undefined,
      timetableEntryKey
    );
  }

  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...(incoming && typeof incoming === 'object' ? incoming : {}),
    weekA: mergeByKey(existing?.weekA, incoming?.weekA, timetableEntryKey),
    weekB: mergeByKey(existing?.weekB, incoming?.weekB, timetableEntryKey),
  };
}

function mergeAttendance(existing: any, incoming: any) {
  return {
    yearly: mergeByKey(existing?.yearly, incoming?.yearly, (entry: any) => String(entry?.year || '')),
    subjects: mergeByKey(existing?.subjects, incoming?.subjects, (entry: any) => String(entry?.classCode || entry?.course || '')),
    absences: incoming?.absences?.length ? incoming.absences : (existing?.absences || []),
    recentPeriods: incoming?.recentPeriods?.length ? incoming.recentPeriods : (existing?.recentPeriods || []),
    totals: incoming?.totals || existing?.totals,
  };
}

/**
 * Merges an incremental portal payload onto the snapshot already in memory.
 *
 * Every caller passes a *delta*: `/api/portal/sync` returns only the sections — and within a
 * section, only the records — whose content changed, and the ultra run feeds one year at a time.
 * Sections must therefore be merged record by record. Mirroring a section wholesale is what caused
 * a routine sync that touched one class to leave the dashboard showing that single subject until
 * the next full read; the durable database snapshot unions these sections for exactly this reason.
 */
export function mergePortalData(existing: PortalData | null | undefined, incoming: PortalData | null | undefined): PortalData | null {
  if (!incoming) return existing ?? null;

  const base: any = existing || {};
  const next: any = incoming || {};

  return {
    ...base,
    ...next,
    user: next.user || base.user,
    account: next.account || base.account,
    timetable: mergeTimetable(base.timetable, next.timetable),
    notices: mergeNotices(base.notices, next.notices),
    diary: mergeByKey(base.diary, next.diary, (entry: any) => [
      entry?.date,
      entry?.title,
      entry?.description,
    ].join('::')),
    grades: mergeByKey(base.grades, next.grades, (entry: any) => [
      entry?.subject,
      entry?.task,
      entry?.result,
      entry?.date,
    ].join('::')),
    attendance: mergeAttendance(base.attendance, next.attendance),
    calendar: mergeByKey(base.calendar, next.calendar, (entry: any) => [
      entry?.title,
      entry?.date,
      entry?.type,
    ].join('::')),
    reports: mergeByKey(base.reports, next.reports, (entry: any) => [
      entry?.url,
      entry?.title,
      entry?.calendarYear,
      entry?.semester,
    ].join('::')),
    // Merged by portal class key rather than mirrored. A sync payload carries only the classes
    // whose counters moved, so replacing the list with it dropped every unchanged subject.
    // Unenrolment is a separate, explicit decision (`unenrolledClassKeys` plus the review prompt),
    // and junk rows are removed here rather than by discarding the accumulated set.
    classes: sanitizeClassEntries(mergeByKey(base.classes, next.classes, portalClassKey)),
    lastUpdated: next.lastUpdated || base.lastUpdated || new Date().toISOString(),
  } as PortalData;
}
