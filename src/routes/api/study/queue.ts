import { createFileRoute } from "@tanstack/react-router";

import {
  guardStudyRequest,
  studyFailureResponse,
  studySuccessResponse,
} from "../../../../lib/study/http";
import { StudyService } from "../../../../lib/study/service";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";

export const Route = createFileRoute("/api/study/queue")({
  server: {
    handlers: {
      // Due-first review queue with the note content each card renders.
      GET: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-queue-read",
          limit: 120,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const url = new URL(request.url);
          const service = new StudyService(new SupabaseStudyRepository());
          const items = await service.getReviewQueue(guard.userId, {
            deckId: url.searchParams.get("deckId") ?? undefined,
            limit: url.searchParams.get("limit") ?? undefined,
            includeNew: url.searchParams.get("includeNew") ?? undefined,
          });
          return studySuccessResponse({ items });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study queue read failed", "Failed to load review queue");
        }
      },
    },
  },
});
