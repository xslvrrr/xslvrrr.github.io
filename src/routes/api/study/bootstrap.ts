import { createFileRoute } from "@tanstack/react-router";

import { internalErrorResponse } from "../../../../lib/api-response";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { readStartSession } from "../../../../lib/start-session";
import { StudyServiceError } from "../../../../lib/study/errors";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";

const noStoreHeaders = {
  "Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "Cookie",
};

export const Route = createFileRoute("/api/study/bootstrap")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
        }

        const limit = await consumeRateLimit("study-bootstrap-read", session.userId, 120, 60);
        if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);

        try {
          const repository = new SupabaseStudyRepository();
          const data = await repository.getBootstrap(session.userId);
          return Response.json({ success: true, data }, { headers: noStoreHeaders });
        } catch (error: unknown) {
          if (error instanceof StudyServiceError) {
            return Response.json({
              success: false,
              message: error.message,
              error: { code: error.code, retryable: error.status >= 500 },
            }, { status: error.status, headers: noStoreHeaders });
          }
          return internalErrorResponse(
            "Study bootstrap failed",
            "Failed to load Study data",
            error,
            noStoreHeaders,
            { success: false },
          );
        }
      },
    },
  },
});
