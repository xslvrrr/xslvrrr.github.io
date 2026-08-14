import { createFileRoute } from '@tanstack/react-router';
import { readStartSession } from '../../../../lib/start-session';
import { getUserPreferences, updateUserPreferences } from '../../../../lib/users';
import { internalErrorResponse } from '../../../../lib/api-response';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { normalizeTourPreferences } from '../../../../lib/tour/persistence';

// Preferences are per-account and change from any device the student is signed in on, so no layer
// between Supabase and the dashboard may hold a copy of this response.
const noStoreHeaders = {
  'Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  Vary: 'Cookie',
};

export const Route = createFileRoute('/api/user/preferences')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders });
        }

        try {
          return Response.json(await getUserPreferences(session.userId), { headers: noStoreHeaders });
        } catch (error) {
          return internalErrorResponse('User preferences load failed', 'Failed to load preferences', error);
        }
      },
      PUT: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders });
        }

        try {
          const body = await readJsonBody<Record<string, unknown>>(request, 2 * 1024 * 1024);
          const { homeSettings, homeLayout, notificationFolders, animationSettings, attendanceSettings } = body;
          const tourPreferences = body.tourPreferences === undefined
            ? undefined
            : normalizeTourPreferences(body.tourPreferences);
          const updated = await updateUserPreferences(session.userId, {
            homeSettings,
            homeLayout,
            notificationFolders: Array.isArray(notificationFolders) ? notificationFolders : undefined,
            animationSettings,
            attendanceSettings,
            tourPreferences,
          });
          return Response.json(updated, { headers: noStoreHeaders });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error);
          if (bodyError) return bodyError;
          return internalErrorResponse('User preferences save failed', 'Failed to save preferences', error);
        }
      },
    },
  },
});
