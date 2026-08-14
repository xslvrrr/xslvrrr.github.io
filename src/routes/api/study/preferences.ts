import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import {
  guardStudyRequest,
  studyFailureResponse,
  studySuccessResponse,
} from "../../../../lib/study/http";
import { StudyService } from "../../../../lib/study/service";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";

export const Route = createFileRoute("/api/study/preferences")({
  server: {
    handlers: {
      // Learner-facing setup: experience mode, workload budget, and retention target.
      PUT: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-preferences-write",
          limit: 30,
          windowSeconds: 5 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, 4 * 1024);
          const service = new StudyService(new SupabaseStudyRepository());
          const preferences = await service.savePreferences(guard.userId, body);
          return studySuccessResponse({ preferences });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study preferences write failed", "Failed to save Study preferences");
        }
      },
    },
  },
});
