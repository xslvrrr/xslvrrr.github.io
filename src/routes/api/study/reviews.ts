import { createFileRoute } from "@tanstack/react-router";

import { internalErrorResponse } from "../../../../lib/api-response";
import { crossOriginMutationResponse } from "../../../../lib/csrf";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { readJsonBody, requestBodyErrorResponse } from "../../../../lib/request-body";
import { readStartSession } from "../../../../lib/start-session";
import { StudyServiceError } from "../../../../lib/study/errors";
import { StudyService } from "../../../../lib/study/service";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";

const noStoreHeaders = {
  "Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "Cookie",
};

export const Route = createFileRoute("/api/study/reviews")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;

        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
        }

        const limit = await consumeRateLimit("study-review-write", session.userId, 300, 60);
        if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders, { success: false });

        try {
          const body = await readJsonBody<unknown>(request, 16 * 1024);
          const service = new StudyService(new SupabaseStudyRepository());
          const data = await service.reviewCard(session.userId, body);
          return Response.json({ success: true, data }, { headers: noStoreHeaders });
        } catch (error: unknown) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders, { success: false });
          if (bodyError) return bodyError;
          if (error instanceof StudyServiceError) {
            return Response.json({
              success: false,
              message: error.message,
              error: { code: error.code, retryable: error.status >= 500 },
            }, { status: error.status, headers: noStoreHeaders });
          }
          return internalErrorResponse(
            "Study review failed",
            "Failed to save Study review",
            error,
            noStoreHeaders,
            { success: false },
          );
        }
      },
    },
  },
});
