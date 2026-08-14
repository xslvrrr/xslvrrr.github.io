import { createFileRoute } from '@tanstack/react-router';
import {
  OPENROUTER_ASSISTANT_MODEL,
  buildDashboardSnapshot,
  getAssistantTools,
  normalizeAssistantSkills,
  normalizeAssistantPreferences,
} from '../../../../lib/assistant/actions.ts';
import { readStartSession } from '../../../../lib/start-session';
import {
  getUserAssistantPortalSnapshot,
  getUserLocalCalendar,
  getUserPreferences,
  getUserThemeBuilder,
  getUserAssistantState,
  getUserNotificationStates,
} from '../../../../lib/users';
import { internalErrorResponse } from '../../../../lib/api-response';
import { consumeRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';
import { getUserFlashcardSets } from '../../../../lib/study-server';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

export const Route = createFileRoute('/api/assistant/context')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders });
        }

        try {
          const limit = await consumeRateLimit('assistant-context-read', session.userId, 60, 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
          const [user, preferences, localCalendar, themeBuilder, assistantState, notificationStates, flashcardSets] = await Promise.all([
            getUserAssistantPortalSnapshot(session.userId),
            getUserPreferences(session.userId),
            getUserLocalCalendar(session.userId),
            getUserThemeBuilder(session.userId),
            getUserAssistantState(session.userId),
            getUserNotificationStates(session.userId),
            getUserFlashcardSets(session.userId),
          ]);
          const state = {
            user: {
              name: user.name,
              school: user.school,
            },
            portalData: user.portalData,
            preferences: normalizeAssistantPreferences(preferences),
            localCalendar,
            themeBuilder,
            notificationStates: notificationStates || {},
            skills: normalizeAssistantSkills(assistantState.skills),
            flashcardSets,
          };

          return Response.json({
            model: OPENROUTER_ASSISTANT_MODEL,
            hasApiKey: Boolean(process.env.OPENROUTER_API_KEY),
            tools: getAssistantTools().map((tool) => tool.function.name),
            snapshot: buildDashboardSnapshot(state),
          }, { headers: noStoreHeaders });
        } catch (error) {
          return internalErrorResponse('Assistant context load failed', 'Failed to load assistant context.', error, noStoreHeaders);
        }
      },
    },
  },
});
