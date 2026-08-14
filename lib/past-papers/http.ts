import { internalErrorResponse } from "../api-response";
import { crossOriginMutationResponse } from "../csrf";
import { consumeRateLimit, rateLimitResponse } from "../rate-limit";
import { requestBodyErrorResponse } from "../request-body";
import { readStartSession } from "../start-session";

/**
 * Route entry checks for past papers, mirroring the Study equivalent deliberately.
 *
 * The two feature areas sit next to each other in the sidebar and share a threat model — signed
 * session, same-origin mutations, durable per-user rate limits — so they share a shape. Anyone
 * auditing one should be able to read the other without relearning it.
 */

export const pastPapersNoStoreHeaders = {
  "Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "Cookie",
};

export class PastPapersError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "PastPapersError";
    this.code = code;
    this.status = status;
  }
}

export interface PastPapersRequestGuard {
  bucket: string;
  limit: number;
  windowSeconds: number;
  mutation: boolean;
}

export type PastPapersGuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

export async function guardPastPapersRequest(
  request: Request,
  guard: PastPapersRequestGuard,
): Promise<PastPapersGuardResult> {
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
        { status: 401, headers: pastPapersNoStoreHeaders },
      ),
    };
  }

  const limit = await consumeRateLimit(guard.bucket, session.userId, guard.limit, guard.windowSeconds);
  if (!limit.allowed) {
    return { ok: false, response: rateLimitResponse(limit, pastPapersNoStoreHeaders, { success: false }) };
  }

  return { ok: true, userId: session.userId };
}

export function pastPapersSuccessResponse(data: unknown): Response {
  return Response.json({ success: true, data }, { headers: pastPapersNoStoreHeaders });
}

/** Typed failures carry their message through; anything unexpected stays content-free. */
export function pastPapersFailureResponse(
  error: unknown,
  logMessage: string,
  userMessage: string,
): Response {
  const bodyError = requestBodyErrorResponse(error, pastPapersNoStoreHeaders, { success: false });
  if (bodyError) return bodyError;

  if (error instanceof PastPapersError) {
    return Response.json({
      success: false,
      message: error.message,
      error: { code: error.code, retryable: error.status >= 500 },
    }, { status: error.status, headers: pastPapersNoStoreHeaders });
  }

  return internalErrorResponse(logMessage, userMessage, error, pastPapersNoStoreHeaders, { success: false });
}
