/**
 * Shared store for AI-assigned notification categories.
 *
 * A notice identity is a hash of the notice's own title, body, and dates, so two students at the
 * same school produce the same id for the same notice. Categorising is therefore work that only has
 * to happen once for the whole school: the first reader to open a notice pays for the model call and
 * everyone after them reads the stored answer.
 *
 * Only the hash and the resulting category are stored. Nothing here identifies an account, and the
 * notice text is never persisted, so the cache cannot be read back into the notices it describes.
 */

import { logger } from './logger';
import { supabaseAdmin } from './supabase';

export const NOTIFICATION_CATEGORIES = ['inbox', 'alerts', 'events', 'assignments'] as const;

export type NotificationCategoryId = (typeof NOTIFICATION_CATEGORIES)[number];

/** Ids accepted in one request. Matches the client's own batch cap. */
export const NOTIFICATION_CATEGORY_BATCH_LIMIT = 100;

export function isNotificationCategory(value: unknown): value is NotificationCategoryId {
  return typeof value === 'string' && (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Categories already known for these notice ids.
 *
 * A cache read must never be able to fail the request it serves: a database error here degrades to
 * "nothing cached", which costs a model call rather than an error page.
 */
export async function readCachedNotificationCategories(
  noticeIds: readonly string[],
): Promise<Record<string, NotificationCategoryId>> {
  if (noticeIds.length === 0) return {};

  const { data, error } = await supabaseAdmin
    .from('notification_category_cache')
    .select('notice_id, category')
    .in('notice_id', [...new Set(noticeIds)]);

  if (error) {
    logger.error('Notification category cache read failed', error);
    return {};
  }

  return (data || []).reduce<Record<string, NotificationCategoryId>>((cached, row) => {
    if (typeof row.notice_id !== 'string' || !isNotificationCategory(row.category)) return cached;
    return { ...cached, [row.notice_id]: row.category };
  }, {});
}

/**
 * Publishes freshly decided categories for every account to reuse.
 *
 * Written as an upsert on the notice id so two readers racing on the same new notice settle on one
 * row instead of failing each other, and so a re-run after a model change refreshes rather than
 * duplicates. A write failure is logged and swallowed: the caller already has an answer to return,
 * and losing the cache entry only costs a repeat call later.
 */
export async function writeCachedNotificationCategories(
  categories: Record<string, NotificationCategoryId>,
  providerModel: string,
): Promise<void> {
  const rows = Object.entries(categories).map(([noticeId, category]) => ({
    notice_id: noticeId,
    category,
    provider_model: providerModel,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return;

  const { error } = await supabaseAdmin
    .from('notification_category_cache')
    .upsert(rows, { onConflict: 'notice_id' });

  if (error) logger.error('Notification category cache write failed', error);
}
