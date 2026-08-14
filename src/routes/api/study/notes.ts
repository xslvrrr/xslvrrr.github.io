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

export const Route = createFileRoute("/api/study/notes")({
  server: {
    handlers: {
      // Create or edit one note. Cards for unchanged templates keep their scheduling history.
      POST: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-content-write",
          limit: 60,
          windowSeconds: 5 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, 32 * 1024);
          const deck = await studyService().saveNote(guard.userId, body);
          return studySuccessResponse({ deck });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study note write failed", "Failed to save flashcard");
        }
      },
      DELETE: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-content-delete",
          limit: 60,
          windowSeconds: 5 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<Record<string, unknown>>(request, 4 * 1024);
          const deck = await studyService().deleteContent(guard.userId, { noteId: body.noteId });
          return studySuccessResponse({ deck });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study note delete failed", "Failed to delete flashcard");
        }
      },
    },
  },
});
