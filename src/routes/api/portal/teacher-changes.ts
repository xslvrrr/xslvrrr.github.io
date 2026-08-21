import { createFileRoute } from '@tanstack/react-router';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { logger } from '../../../../lib/logger';
import {
  acknowledgeTeacherChanges,
  listPendingTeacherChanges,
} from '../../../../lib/portal-teacher-changes-store';
import { consumeRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { readStartSession } from '../../../../lib/start-session';

/**
 * Teacher changes waiting to be shown, and the acknowledgement that stops them being shown again.
 *
 * The sync route already returns the changes it found in its own response, so this exists for the
 * other case: a change found by a background refresh, or on another device, that the student has
 * not seen yet. The dashboard asks once on load.
 */

/** Ceiling on the keys one dismissal may name. The modal lists far fewer; this is a body guard. */
const MAX_ACKNOWLEDGED_KEYS = 64;
const MAX_KEY_CHARS = 400;

function readChangeKeys(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('changeKeys must be an array of strings');
  if (value.length > MAX_ACKNOWLEDGED_KEYS) throw new Error('changeKeys is too long');

  return value.map((entry) => {
    if (typeof entry !== 'string') throw new Error('changeKeys must be an array of strings');
    const trimmed = entry.trim();
    if (!trimmed || trimmed.length > MAX_KEY_CHARS) throw new Error('changeKeys contains an unusable key');
    return trimmed;
  });
}

export const Route = createFileRoute('/api/portal/teacher-changes')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = readStartSession(request);
          if (!session.loggedIn || !session.userId) {
            return Response.json({ message: 'Unauthorized' }, { status: 401 });
          }

          const limit = await consumeRateLimit('portal-teacher-changes-read', session.userId, 60, 10 * 60);
          if (!limit.allowed) return rateLimitResponse(limit);

          const changes = await listPendingTeacherChanges(session.userId);
          return Response.json({ changes }, { headers: { 'Cache-Control': 'no-store' } });
        } catch (error: unknown) {
          logger.error('Teacher changes could not be read', error);
          return Response.json({ message: 'Teacher changes are unavailable right now.' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;

        try {
          const session = readStartSession(request);
          if (!session.loggedIn || !session.userId) {
            return Response.json({ message: 'Unauthorized' }, { status: 401 });
          }

          const limit = await consumeRateLimit('portal-teacher-changes-ack', session.userId, 60, 10 * 60);
          if (!limit.allowed) return rateLimitResponse(limit);

          const body = await readJsonBody<unknown>(request, 32 * 1024);
          const changeKeys = readChangeKeys((body as { changeKeys?: unknown } | null)?.changeKeys);
          // No keys means "everything outstanding", which is what dismissing the modal does.
          const acknowledged = await acknowledgeTeacherChanges(session.userId, changeKeys);

          return Response.json({ acknowledged }, { headers: { 'Cache-Control': 'no-store' } });
        } catch (error: unknown) {
          const bodyError = requestBodyErrorResponse(error);
          if (bodyError) return bodyError;
          if (error instanceof Error && /changeKeys/.test(error.message)) {
            return Response.json({ message: error.message }, { status: 400 });
          }
          logger.error('Teacher changes could not be acknowledged', error);
          return Response.json({ message: 'That could not be saved. Try again.' }, { status: 500 });
        }
      },
    },
  },
});
