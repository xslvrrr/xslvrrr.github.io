import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import { StudyServiceError } from "../../../../lib/study/errors";
import {
  guardStudyRequest,
  studyFailureResponse,
  studySuccessResponse,
} from "../../../../lib/study/http";
import { StudyImportService } from "../../../../lib/study/import-service";
import { STUDY_IMPORT_MAX_BYTES } from "../../../../lib/study/imports";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";

/** Leaves room for the JSON envelope around the file content itself. */
const MAX_IMPORT_BODY_BYTES = STUDY_IMPORT_MAX_BYTES + 64 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const Route = createFileRoute("/api/study/import")({
  server: {
    handlers: {
      // One route, three explicit actions: preview validates, commit applies, rollback reverses.
      POST: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-import-write",
          limit: 20,
          windowSeconds: 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, MAX_IMPORT_BODY_BYTES);
          if (!isRecord(body)) {
            throw new StudyServiceError("STUDY_INVALID_INPUT", "This import request is invalid.", 400);
          }

          const service = new StudyImportService(new SupabaseStudyRepository());
          const { action, ...command } = body;

          if (action === "preview") return studySuccessResponse(await service.preview(guard.userId, command));
          if (action === "commit") return studySuccessResponse(await service.commit(guard.userId, command));
          if (action === "rollback") return studySuccessResponse(await service.rollback(guard.userId, command));

          throw new StudyServiceError(
            "STUDY_INVALID_INPUT",
            "Choose preview, commit, or rollback.",
            400,
          );
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study import failed", "Failed to import flashcards");
        }
      },
    },
  },
});
