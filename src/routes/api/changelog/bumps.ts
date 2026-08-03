import { createFileRoute } from '@tanstack/react-router';

import { internalErrorResponse } from '../../../../lib/api-response';
import { isChangelogSectionId } from '../../../../lib/changelog';
import { bumpChangelogSection, loadChangelogBumpState, resolveVoterIdentity } from '../../../../lib/changelog-bumps';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { consumeRateLimit, rateLimitResponse, requestNetworkDiscriminator } from '../../../../lib/rate-limit';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { readStartSession } from '../../../../lib/start-session';

const BUMP_RATE_LIMIT = 12;
const BUMP_RATE_WINDOW_SECONDS = 60 * 60;
const MAX_BODY_BYTES = 4 * 1024;

function jsonResponse(body: unknown, setCookie?: string, status = 200): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (setCookie) headers.append('Set-Cookie', setCookie);
  return Response.json(body, { status, headers });
}

export const Route = createFileRoute('/api/changelog/bumps')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readStartSession(request);
        const voter = resolveVoterIdentity(request, session.loggedIn ? session.userId : null);

        try {
          return jsonResponse(await loadChangelogBumpState(voter.voterKey), voter.setCookie);
        } catch (error) {
          return internalErrorResponse('Changelog bump state load failed', 'Failed to load bumps', error);
        }
      },
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;

        // The changelog is public, so the network discriminator is the only durable handle on a
        // caller that keeps discarding its visitor cookie.
        const limit = await consumeRateLimit(
          'changelog-bump',
          requestNetworkDiscriminator(request),
          BUMP_RATE_LIMIT,
          BUMP_RATE_WINDOW_SECONDS,
        );
        if (!limit.allowed) return rateLimitResponse(limit);

        const session = readStartSession(request);
        const voter = resolveVoterIdentity(request, session.loggedIn ? session.userId : null);

        try {
          const body = await readJsonBody<Record<string, unknown>>(request, MAX_BODY_BYTES);
          const sectionId = body?.sectionId;
          if (!isChangelogSectionId(sectionId)) {
            return jsonResponse({ message: 'Unknown changelog section' }, voter.setCookie, 400);
          }

          return jsonResponse(await bumpChangelogSection(voter.voterKey, sectionId), voter.setCookie);
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error);
          if (bodyError) return bodyError;
          return internalErrorResponse('Changelog bump failed', 'Failed to record bump', error);
        }
      },
    },
  },
});
