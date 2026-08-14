import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import { StudyServiceError } from "../../../../lib/study/errors";
import {
  guardStudyRequest,
  studyFailureResponse,
  studySuccessResponse,
} from "../../../../lib/study/http";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";
import { StudyWorkshopService } from "../../../../lib/study/workshop-service";

/** Source text plus a bounded draft batch. Images use their own limit in the media route. */
const MAX_WORKSHOP_BODY_BYTES = 256 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const Route = createFileRoute("/api/study/workshop")({
  server: {
    handlers: {
      // Drafts waiting for the user to review.
      GET: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-workshop-read",
          limit: 120,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const service = new StudyWorkshopService(new SupabaseStudyRepository());
          return studySuccessResponse({ drafts: await service.listPendingDrafts(guard.userId) });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study draft read failed", "Failed to load drafts");
        }
      },

      // `draft` stores suggestions; `approve` is the only action that writes cards.
      POST: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-workshop-write",
          limit: 40,
          windowSeconds: 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, MAX_WORKSHOP_BODY_BYTES);
          if (!isRecord(body)) {
            throw new StudyServiceError("STUDY_INVALID_INPUT", "That request is invalid.", 400);
          }

          const service = new StudyWorkshopService(new SupabaseStudyRepository());
          const { action, ...command } = body;

          if (action === "draft") return studySuccessResponse(await service.createDrafts(guard.userId, command));
          if (action === "approve") return studySuccessResponse(await service.approveDrafts(guard.userId, command));
          if (action === "reject") return studySuccessResponse(await service.rejectDrafts(guard.userId, command));

          throw new StudyServiceError("STUDY_INVALID_INPUT", "Choose draft, approve, or reject.", 400);
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study workshop write failed", "Failed to update drafts");
        }
      },
    },
  },
});
