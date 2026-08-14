import { createFileRoute } from '@tanstack/react-router';
import { internalErrorResponse } from '../../../../../../lib/api-response';
import {
  CLASSROOM_SNAPSHOT_MAX_BYTES,
  ClassroomDataValidationError,
  normalizeClassroomSnapshot,
} from '../../../../../../lib/classroom-data';
import {
  completeClassroomSyncUpload,
  isClassroomSyncSessionId,
} from '../../../../../../lib/classroom-sync-sessions';
import {
  consumeRateLimit,
  rateLimitResponse,
  requestNetworkDiscriminator,
} from '../../../../../../lib/rate-limit';
import { readJsonBody, requestBodyErrorResponse } from '../../../../../../lib/request-body';

const noStoreHeaders = {
  'Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length);
  return token && !token.includes(' ') ? token : null;
}

export const Route = createFileRoute('/api/classroom/sync-sessions/$sessionId/upload')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isClassroomSyncSessionId(params.sessionId)) {
          return Response.json({ message: 'Classroom sync session ID is invalid.' }, { status: 400, headers: noStoreHeaders });
        }

        const token = bearerToken(request);
        if (!token) {
          return Response.json({ message: 'A valid upload token is required.' }, {
            status: 401,
            headers: { ...noStoreHeaders, 'WWW-Authenticate': 'Bearer' },
          });
        }

        try {
          const networkLimit = await consumeRateLimit(
            'classroom-sync-upload',
            requestNetworkDiscriminator(request),
            30,
            10 * 60,
          );
          if (!networkLimit.allowed) return rateLimitResponse(networkLimit, noStoreHeaders);

          const body = await readJsonBody<unknown>(request, CLASSROOM_SNAPSHOT_MAX_BYTES);
          if (!isRecord(body) || !('snapshot' in body)) {
            return Response.json({ message: 'Classroom snapshot is required.' }, { status: 400, headers: noStoreHeaders });
          }
          const snapshot = normalizeClassroomSnapshot(body.snapshot);
          const outcome = await completeClassroomSyncUpload(params.sessionId, token, snapshot);

          if (outcome === 'invalid') {
            return Response.json({ message: 'Upload token is invalid or expired.' }, {
              status: 401,
              headers: { ...noStoreHeaders, 'WWW-Authenticate': 'Bearer' },
            });
          }
          if (outcome === 'partial') {
            return Response.json({
              message: 'Partial Classroom data did not replace the last successful snapshot.',
              error: { code: 'PARTIAL_SNAPSHOT_REJECTED', retryable: true },
            }, { status: 409, headers: noStoreHeaders });
          }
          if (outcome === 'stale') {
            return Response.json({
              message: 'Older Classroom data did not replace the current snapshot.',
              error: { code: 'STALE_SNAPSHOT_REJECTED', retryable: true },
            }, { status: 409, headers: noStoreHeaders });
          }

          return Response.json({
            success: true,
            integrity: snapshot.sync.integrity,
            counts: snapshot.sync.counts,
            syncedAt: snapshot.sync.syncedAt,
          }, { headers: noStoreHeaders });
        } catch (error: unknown) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          if (error instanceof ClassroomDataValidationError) {
            return Response.json({
              message: error.message,
              error: { code: error.code, retryable: true },
            }, { status: error.status, headers: noStoreHeaders });
          }
          return internalErrorResponse(
            'Classroom snapshot upload failed',
            'Failed to save Classroom data.',
            error,
            noStoreHeaders,
          );
        }
      },
    },
  },
});
