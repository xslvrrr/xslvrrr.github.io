import { internalErrorResponse } from "../api-response";
import { crossOriginMutationResponse } from "../csrf";
import { consumeRateLimit, rateLimitResponse } from "../rate-limit";
import { requestBodyErrorResponse } from "../request-body";
import { readStartSession } from "../start-session";
import { StudyServiceError } from "./errors";

export const studyNoStoreHeaders = {
  "Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "Cookie",
};

export interface StudyRequestGuard {
  bucket: string;
  limit: number;
  windowSeconds: number;
  mutation: boolean;
}

export type StudyGuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

/**
 * Shared Study route entry check: same-origin for mutations, signed session, durable rate limit.
 */
export async function guardStudyRequest(
  request: Request,
  guard: StudyRequestGuard,
): Promise<StudyGuardResult> {
  if (guard.mutation) {
    const crossOrigin = crossOriginMutationResponse(request);
    if (crossOrigin) return { ok: false, response: crossOrigin };
  }

  const session = readStartSession(request);
  if (!session.loggedIn || !session.userId) {
    return {
      ok: false,
      response: Response.json(
        { success: false, message: "Not authenticated" },
        { status: 401, headers: studyNoStoreHeaders },
      ),
    };
  }

  const limit = await consumeRateLimit(guard.bucket, session.userId, guard.limit, guard.windowSeconds);
  if (!limit.allowed) {
    return { ok: false, response: rateLimitResponse(limit, studyNoStoreHeaders, { success: false }) };
  }

  return { ok: true, userId: session.userId };
}

export function studySuccessResponse(data: unknown): Response {
  return Response.json({ success: true, data }, { headers: studyNoStoreHeaders });
}

/**
 * Maps typed Study failures to a stable envelope. Unexpected failures stay content-free.
 */
export function studyFailureResponse(
  error: unknown,
  logMessage: string,
  userMessage: string,
): Response {
  const bodyError = requestBodyErrorResponse(error, studyNoStoreHeaders, { success: false });
  if (bodyError) return bodyError;

  if (error instanceof StudyServiceError) {
    return Response.json({
      success: false,
      message: error.message,
      error: { code: error.code, retryable: error.status >= 500 },
    }, { status: error.status, headers: studyNoStoreHeaders });
  }

  return internalErrorResponse(logMessage, userMessage, error, studyNoStoreHeaders, { success: false });
}
