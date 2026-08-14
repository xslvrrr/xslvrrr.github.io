import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import { readStudyBrowserQuery } from "../../../../lib/study/browser";
import {
  guardStudyRequest,
  studyFailureResponse,
  studySuccessResponse,
} from "../../../../lib/study/http";
import { StudyService } from "../../../../lib/study/service";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";

export const Route = createFileRoute("/api/study/browser")({
  server: {
    handlers: {
      // Paginated card search. Filters arrive as typed query parameters, never as query text.
      GET: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-browser-read",
          limit: 120,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const service = new StudyService(new SupabaseStudyRepository());
          const page = await service.searchCards(guard.userId, readStudyBrowserQuery(new URL(request.url)));
          return studySuccessResponse(page);
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study browser search failed", "Failed to search flashcards");
        }
      },

      // Bulk actions on a bounded selection.
      POST: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-browser-write",
          limit: 60,
          windowSeconds: 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, 64 * 1024);
          const service = new StudyService(new SupabaseStudyRepository());
          return studySuccessResponse(await service.bulkUpdateCards(guard.userId, body));
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study bulk action failed", "Failed to update flashcards");
        }
      },
    },
  },
});
