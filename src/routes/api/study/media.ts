import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import { STUDY_MEDIA_MAX_BYTES } from "../../../../lib/study/media";
import {
  guardStudyRequest,
  studyFailureResponse,
  studySuccessResponse,
} from "../../../../lib/study/http";
import { SupabaseStudyRepository } from "../../../../lib/study/supabase-repository";
import { StudyWorkshopService } from "../../../../lib/study/workshop-service";

/** Base64 expands by about a third; the envelope needs a little more room again. */
const MAX_MEDIA_BODY_BYTES = Math.ceil(STUDY_MEDIA_MAX_BYTES * 1.4) + 8 * 1024;

export const Route = createFileRoute("/api/study/media")({
  server: {
    handlers: {
      // Returns a short-lived signed URL. Study media is private and never publicly readable.
      GET: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-media-read",
          limit: 240,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          const mediaId = new URL(request.url).searchParams.get("mediaId") ?? "";
          const service = new StudyWorkshopService(new SupabaseStudyRepository());
          return studySuccessResponse({ url: await service.createMediaUrl(guard.userId, mediaId) });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study media read failed", "Failed to load image");
        }
      },

      POST: async ({ request }) => {
        const guard = await guardStudyRequest(request, {
          bucket: "study-media-write",
          limit: 30,
          windowSeconds: 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, MAX_MEDIA_BODY_BYTES);
          const service = new StudyWorkshopService(new SupabaseStudyRepository());
          return studySuccessResponse({ media: await service.uploadMedia(guard.userId, body) });
        } catch (error: unknown) {
          return studyFailureResponse(error, "Study media upload failed", "Failed to upload image");
        }
      },
    },
  },
});
