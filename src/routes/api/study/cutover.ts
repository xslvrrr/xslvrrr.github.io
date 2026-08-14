import { createFileRoute } from "@tanstack/react-router";

import { internalErrorResponse } from "../../../../lib/api-response";
import { crossOriginMutationResponse } from "../../../../lib/csrf";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { readStartSession } from "../../../../lib/start-session";
import { StudyServiceError } from "../../../../lib/study/errors";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";

const noStoreHeaders = {
  "Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "Cookie",
};

export const Route = createFileRoute("/api/study/cutover")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
        }
        const limit = await consumeRateLimit("study-cutover-write", session.userId, 2, 60 * 60);
        if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders, { success: false });

        try {
          const data = await new SupabaseStudyRepository().cutoverStudy(session.userId);
          const isCutover = data.status === "cutover";
          return Response.json({
            success: isCutover,
            data,
            ...(!isCutover ? { message: "Study data changed or is not ready for cutover." } : {}),
          }, { status: isCutover ? 200 : 409, headers: noStoreHeaders });
        } catch (error: unknown) {
          if (error instanceof StudyServiceError) {
            return Response.json({
              success: false,
              message: error.message,
              error: { code: error.code, retryable: error.status >= 500 },
            }, { status: error.status, headers: noStoreHeaders });
          }
          return internalErrorResponse(
            "Study cutover failed",
            "Failed to activate normalized Study storage",
            error,
            noStoreHeaders,
            { success: false },
          );
        }
      },
    },
  },
});
