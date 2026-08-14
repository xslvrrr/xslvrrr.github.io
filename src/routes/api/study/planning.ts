import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import { StudyServiceError } from "../../../../lib/study/errors";
import {
  guardStudyRequest,
  studyFailureResponse,
  studySuccessResponse,
} from "../../../../lib/study/http";
import { StudyPlanningService } from "../../../../lib/study/planning-service";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const Route = createFileRoute("/api/study/planning")({
  server: {
    handlers: {
      // Exam plans, their coverage, and this account's share links.
      GET: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-planning-read",
          limit: 120,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const service = new StudyPlanningService(new SupabaseStudyRepository());
          const url = new URL(request.url);
          const plans = await service.listExamPlans(guard.userId);
          const deckIds = url.searchParams.getAll("deckId");

          return studySuccessResponse({
            plans,
            publications: await service.listPublications(guard.userId),
            coverage: await service.getExamCoverage(guard.userId, deckIds),
          });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study planning read failed", "Failed to load exam plans");
        }
      },

      POST: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-planning-write",
          limit: 60,
          windowSeconds: 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, 32 * 1024);
          if (!isRecord(body)) {
            throw new StudyServiceError("STUDY_INVALID_INPUT", "That request is invalid.", 400);
          }

          const service = new StudyPlanningService(new SupabaseStudyRepository());
          const { action, ...command } = body;

          if (action === "save-plan") {
            return studySuccessResponse({ plan: await service.saveExamPlan(guard.userId, command) });
          }
          if (action === "publish") {
            return studySuccessResponse(await service.publishDeck(guard.userId, command));
          }
          if (action === "revoke") {
            await service.revokePublication(guard.userId, command);
            return studySuccessResponse({ revoked: true });
          }
          if (action === "subscribe") {
            return studySuccessResponse(await service.applySubscription(guard.userId, command));
          }

          throw new StudyServiceError(
            "STUDY_INVALID_INPUT",
            "Choose save-plan, publish, revoke, or subscribe.",
            400,
          );
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study planning write failed", "Failed to save this change");
        }
      },
    },
  },
});
