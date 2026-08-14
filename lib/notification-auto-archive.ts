import type { HomeSettings } from '../types/home';
import type { Notice, NotificationState } from '../types/portal';

export type AutoArchiveNoticeRecord = {
  notificationId: string;
  notice: Pick<Notice, 'date' | 'dates'>;
};

export const parseNotificationDate = (value?: string): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

export const isOlderThanAutoArchivePeriod = (
  notice: Pick<Notice, 'date' | 'dates'>,
  period: HomeSettings['notificationAutoArchiveAfter'],
  now: Date,
): boolean => {
  if (period === 'never') return false;
  const dates = [notice.date, ...(notice.dates || [])]
    .map(parseNotificationDate)
    .filter((date): date is Date => Boolean(date));
  if (dates.length === 0) return false;

  const latestNoticeDate = Math.max(...dates.map((date) => date.getTime()));
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  if (period === '1w') cutoff.setDate(cutoff.getDate() - 7);
  else cutoff.setMonth(cutoff.getMonth() - Number.parseInt(period, 10));
  return latestNoticeDate < cutoff.getTime();
};

export function reconcileAutoArchivedNotifications(
  states: Record<string, NotificationState>,
  noticeRecords: readonly AutoArchiveNoticeRecord[],
  period: HomeSettings['notificationAutoArchiveAfter'],
  now: Date,
): Record<string, NotificationState> {
  let next = states;

  const replaceState = (notificationId: string, state: NotificationState) => {
    if (next === states) next = { ...states };
    next[notificationId] = state;
  };

  noticeRecords.forEach(({ notice, notificationId }) => {
    const state = next[notificationId];
    const isOlder = isOlderThanAutoArchivePeriod(notice, period, now);

    if (isOlder && !state?.archived && !state?.pinned) {
      replaceState(notificationId, {
        ...state,
        archived: true,
        autoArchived: true,
      } as NotificationState);
      return;
    }

    if (!isOlder && state?.autoArchived) {
      const restoredState = {
        ...state,
        archived: false,
      };
      delete restoredState.autoArchived;
      replaceState(notificationId, restoredState);
    }
  });

  return next;
}
