import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import {
  guardStudyRequest,
  studyFailureResponse,
  studySuccessResponse,
} from "../../../../lib/study/http";
import { StudyService } from "../../../../lib/study/service";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";

function studyService(): StudyService {
  return new StudyService(new SupabaseStudyRepository());
}

export const Route = createFileRoute("/api/study/undo")({
  server: {
    handlers: {
      // Reports the newest review that can still be undone, so the UI only offers a real Undo.
      GET: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-undo-read",
          limit: 240,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const url = new URL(request.url);
          const cardId = url.searchParams.get("cardId") ?? undefined;
          const review = await studyService().findUndoableReview(guard.userId, cardId);
          return studySuccessResponse({ review });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study undo lookup failed", "Failed to check undo state");
        }
      },
      // Undo inserts a compensating event and restores the target event's exact before state.
      POST: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-undo-write",
          limit: 120,
          windowSeconds: 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, 8 * 1024);
          const data = await studyService().undoReview(guard.userId, body);
          return studySuccessResponse(data);
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study undo failed", "Failed to undo review");
        }
      },
    },
  },
});
