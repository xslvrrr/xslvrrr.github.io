import { createFileRoute } from '@tanstack/react-router';
import { readStartSession } from '../../../../lib/start-session';
import { getUserNotificationStates, updateUserNotificationStates } from '../../../../lib/users';
import { internalErrorResponse } from '../../../../lib/api-response';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { FREE_ASSISTANT_MODEL } from '../../../../lib/ai-models';
import {
  isNotificationCategory,
  NOTIFICATION_CATEGORY_BATCH_LIMIT,
  readCachedNotificationCategories,
  writeCachedNotificationCategories,
  type NotificationCategoryId,
} from '../../../../lib/notification-categories';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = FREE_ASSISTANT_MODEL;

const CATEGORISE_SYSTEM_PROMPT = 'Categorise school notifications. Return only JSON: {"categories":{"notification-id":"category"}}. Valid categories: alerts (urgent warnings or required immediate attention), events (dated activities, meetings, excursions), assignments (homework, assessments, tasks or due work), inbox (everything else). Include every supplied id exactly once.';

export const Route = createFileRoute('/api/user/notifications')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401 });
        }

        try {
          return Response.json({ states: await getUserNotificationStates(session.userId) });
        } catch (error) {
          return internalErrorResponse('Notification state load failed', 'Failed to load notification states', error);
        }
      },
      PUT: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401 });
        }

        try {
          const { states } = await readJsonBody<{ states?: unknown }>(request, 5 * 1024 * 1024);
          if (!states || typeof states !== 'object' || Array.isArray(states)) {
            return Response.json({ message: 'Invalid notification state payload' }, { status: 400 });
          }
          return Response.json({
            states: await updateUserNotificationStates(session.userId, states as Record<string, any>),
          });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error);
          if (bodyError) return bodyError;
          return internalErrorResponse('Notification state save failed', 'Failed to save notification states', error);
        }
      },
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401 });
        }

        try {
          const { notifications } = await readJsonBody<{ notifications?: unknown }>(request, 256 * 1024);
          if (
            !Array.isArray(notifications)
            || notifications.length === 0
            || notifications.length > NOTIFICATION_CATEGORY_BATCH_LIMIT
          ) {
            return Response.json({ message: 'Invalid notifications payload' }, { status: 400 });
          }

          const items = notifications.map((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
            const record = item as Record<string, unknown>;
            const id = typeof record.id === 'string' ? record.id.slice(0, 200) : '';
            if (!id) return null;
            return {
              id,
              title: typeof record.title === 'string' ? record.title.slice(0, 500) : '',
              preview: typeof record.preview === 'string' ? record.preview.slice(0, 1500) : '',
            };
          }).filter((item): item is NonNullable<typeof item> => Boolean(item));
          if (items.length === 0) return Response.json({ message: 'Invalid notifications payload' }, { status: 400 });

          // Notice ids are content hashes, so a notice already categorised for one student at this
          // school is already categorised for every other student who receives it. Only what nobody
          // has seen before reaches the model.
          const cached = await readCachedNotificationCategories(items.map((item) => item.id));
          const uncached = items.filter((item) => !cached[item.id]);
          if (uncached.length === 0) return Response.json({ categories: cached });

          const apiKey = process.env.OPENROUTER_API_KEY;
          // A missing key still serves whatever the shared cache already knows; only the new notices
          // are unresolvable.
          if (!apiKey) {
            return Object.keys(cached).length > 0
              ? Response.json({ categories: cached })
              : Response.json({ message: 'AI categorisation is unavailable' }, { status: 503 });
          }

          const response = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: OPENROUTER_MODEL,
              temperature: 0,
              max_tokens: 2000,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: CATEGORISE_SYSTEM_PROMPT },
                { role: 'user', content: JSON.stringify(uncached) },
              ],
            }),
          });
          if (!response.ok) {
            return Object.keys(cached).length > 0
              ? Response.json({ categories: cached })
              : Response.json({ message: 'AI categorisation failed' }, { status: 502 });
          }

          const provider = await response.json() as any;
          const content = provider?.choices?.[0]?.message?.content;
          const parsed = typeof content === 'string' ? JSON.parse(content) : content;
          // Model output is untrusted: only ids that were actually asked about, and only the four
          // known categories, survive.
          const allowedIds = new Set(uncached.map((item) => item.id));
          const decided = Object.entries(parsed?.categories || {}).reduce<Record<string, NotificationCategoryId>>(
            (accepted, [id, category]) => (allowedIds.has(id) && isNotificationCategory(category)
              ? { ...accepted, [id]: category }
              : accepted),
            {},
          );

          await writeCachedNotificationCategories(decided, OPENROUTER_MODEL);
          return Response.json({ categories: { ...cached, ...decided } });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error);
          if (bodyError) return bodyError;
          return internalErrorResponse('Notification categorisation failed', 'Failed to categorise notifications', error);
        }
      },
    },
  },
});
