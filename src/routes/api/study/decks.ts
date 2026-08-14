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

export const Route = createFileRoute("/api/study/decks")({
  server: {
    handlers: {
      // Deck contents are paginated; Study home uses the bootstrap summary instead.
      GET: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-deck-read",
          limit: 240,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const url = new URL(request.url);
          const data = await studyService().getDeckContents(guard.userId, {
            deckId: url.searchParams.get("deckId") ?? undefined,
            cursor: url.searchParams.get("cursor") ?? undefined,
            limit: url.searchParams.get("limit") ?? undefined,
          });
          return studySuccessResponse(data);
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study deck read failed", "Failed to load flashcards");
        }
      },
      POST: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-content-write",
          limit: 60,
          windowSeconds: 5 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, 8 * 1024);
          const deck = await studyService().saveDeck(guard.userId, body);
          return studySuccessResponse({ deck });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study deck write failed", "Failed to save flashcard set");
        }
      },
      DELETE: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-content-delete",
          limit: 30,
          windowSeconds: 5 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<Record<string, unknown>>(request, 4 * 1024);
          await studyService().deleteContent(guard.userId, { deckId: body.deckId });
          return studySuccessResponse({ deleted: true });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study deck delete failed", "Failed to delete flashcard set");
        }
      },
    },
  },
});
