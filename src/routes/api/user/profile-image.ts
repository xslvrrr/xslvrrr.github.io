import { createFileRoute } from '@tanstack/react-router';
import { readStartSession } from '../../../../lib/start-session';
import { findUserSessionById, updateUserProfileImage } from '../../../../lib/users';
import { internalErrorResponse } from '../../../../lib/api-response';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import { crossOriginMutationResponse } from '../../../../lib/csrf';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function extractDataUrlPayload(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

export const Route = createFileRoute('/api/user/profile-image')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401 });
        }

        try {
          const user = await findUserSessionById(session.userId);
          return Response.json(
            { profileImage: user?.profileImage || null },
            { headers: { 'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800' } },
          );
        } catch (error) {
          return internalErrorResponse('Profile image load failed', 'Failed to load profile image', error);
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
          const { dataUrl } = await readJsonBody<{ dataUrl?: unknown }>(request, 35 * 1024 * 1024);

          if (!dataUrl || typeof dataUrl !== 'string') {
            return Response.json({ message: 'Missing dataUrl' }, { status: 400 });
          }

          const payload = extractDataUrlPayload(dataUrl);
          if (!payload) {
            return Response.json({ message: 'Invalid data URL' }, { status: 400 });
          }

          if (!ALLOWED_MIME_TYPES.has(payload.mimeType)) {
            return Response.json({ message: 'Unsupported image type' }, { status: 400 });
          }

          if (Buffer.from(payload.base64, 'base64').length > MAX_IMAGE_BYTES) {
            return Response.json({ message: 'Image exceeds 5 MB limit' }, { status: 413 });
          }

          const updated = await updateUserProfileImage(session.userId, dataUrl);
          return Response.json({ profileImage: updated?.profileImage || null });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error);
          if (bodyError) return bodyError;
          return internalErrorResponse('Profile image save failed', 'Failed to save profile image', error);
        }
      },
      DELETE: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401 });
        }

        try {
          const updated = await updateUserProfileImage(session.userId, null);
          return Response.json({ profileImage: updated?.profileImage || null });
        } catch (error) {
          return internalErrorResponse('Profile image removal failed', 'Failed to remove profile image', error);
        }
      },
    },
  },
});
