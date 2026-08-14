import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import { StudyServiceError } from "../../../../lib/study/errors";
import {
  guardStudyRequest,
  studyFailureResponse,
  studySuccessResponse,
} from "../../../../lib/study/http";
import { StudyService } from "../../../../lib/study/service";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const Route = createFileRoute("/api/study/sessions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-sessions-read",
          limit: 120,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const service = new StudyService(new SupabaseStudyRepository());
          return studySuccessResponse({ sessions: await service.listSmartSessions(guard.userId) });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study session read failed", "Failed to load saved sessions");
        }
      },

      // `run` compiles a query and returns an ordered queue; `save` stores it for reuse.
      POST: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-sessions-write",
          limit: 90,
          windowSeconds: 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, 32 * 1024);
          if (!isRecord(body)) {
            throw new StudyServiceError("STUDY_INVALID_INPUT", "Session request is invalid.", 400);
          }

          const service = new StudyService(new SupabaseStudyRepository());
          const { action, ...command } = body;

          if (action === "run") return studySuccessResponse(await service.runSmartSession(guard.userId, command));
          if (action === "save") {
            return studySuccessResponse({ session: await service.saveSmartSession(guard.userId, command) });
          }
          throw new StudyServiceError("STUDY_INVALID_INPUT", "Choose run or save.", 400);
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study session write failed", "Failed to run this session");
        }
      },

      DELETE: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-sessions-write",
          limit: 90,
          windowSeconds: 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<{ sessionId?: string }>(request, 4 * 1024);
          const service = new StudyService(new SupabaseStudyRepository());
          await service.deleteSmartSession(guard.userId, body?.sessionId ?? "");
          return studySuccessResponse({ deleted: true });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study session delete failed", "Failed to delete this session");
        }
      },
    },
  },
});
