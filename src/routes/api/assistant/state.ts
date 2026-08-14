import { createFileRoute } from '@tanstack/react-router';
import {
  OPENROUTER_ASSISTANT_MODEL,
  normalizeAssistantSkills,
  normalizeAssistantThreads,
} from '../../../../lib/assistant/actions.ts';
import { readStartSession } from '../../../../lib/start-session';
import { getUserAssistantState, updateUserAssistantState } from '../../../../lib/users';
import { internalErrorResponse } from '../../../../lib/api-response';
import { consumeRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { ASSISTANT_STATE_BODY_MAX_BYTES } from '../../../../lib/assistant/guardrails.ts';
import { crossOriginMutationResponse } from '../../../../lib/csrf';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

function isStateBody(value: unknown): value is { threads?: unknown[]; skills?: unknown[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return (body.threads === undefined || Array.isArray(body.threads))
    && (body.skills === undefined || Array.isArray(body.skills));
}

export const Route = createFileRoute('/api/assistant/state')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders });
        }
        try {
          const limit = await consumeRateLimit('assistant-state-read', session.userId, 60, 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
          const state = await getUserAssistantState(session.userId);
          return Response.json({
            model: OPENROUTER_ASSISTANT_MODEL,
            hasApiKey: Boolean(process.env.OPENROUTER_API_KEY),
            threads: normalizeAssistantThreads(state.threads),
            skills: normalizeAssistantSkills(state.skills),
          }, { headers: noStoreHeaders });
        } catch (error) {
          return internalErrorResponse('Assistant state load failed', 'Failed to load assistant state.', error, noStoreHeaders);
        }
      },
      PUT: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders });
        }
        const crossOriginResponse = crossOriginMutationResponse(request);
        if (crossOriginResponse) return crossOriginResponse;

        try {
          const limit = await consumeRateLimit('assistant-state-write', session.userId, 30, 5 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
          const body = await readJsonBody<unknown>(request, ASSISTANT_STATE_BODY_MAX_BYTES);
          if (!isStateBody(body)) {
            return Response.json({ message: 'Assistant state request is invalid.' }, { status: 400, headers: noStoreHeaders });
          }
          const saved = await updateUserAssistantState(session.userId, {
            threads: body.threads === undefined ? undefined : normalizeAssistantThreads(body.threads),
            skills: body.skills === undefined ? undefined : normalizeAssistantSkills(body.skills),
          });
          return Response.json({
            threads: normalizeAssistantThreads(saved.threads),
            skills: normalizeAssistantSkills(saved.skills),
          }, { headers: noStoreHeaders });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          return internalErrorResponse('Assistant state save failed', 'Failed to save assistant state.', error, noStoreHeaders);
        }
      },
    },
  },
});
