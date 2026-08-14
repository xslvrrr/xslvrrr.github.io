import { createFileRoute } from "@tanstack/react-router";

import { readJsonBody } from "../../../../lib/request-body";
import {
  guardPastPapersRequest,
  pastPapersFailureResponse,
  pastPapersSuccessResponse,
} from "../../../../lib/past-papers/http";
import { mergePastPaperPreferences } from "../../../../lib/past-papers/preferences";
import { loadPreferences, savePreferences } from "../../../../lib/past-papers/repository";

export const Route = createFileRoute("/api/past-papers/preferences")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-preferences-read",
          limit: 120,
          windowSeconds: 60,
          mutation: false,
        });
        if (!guard.ok) return guard.response;

        try {
          return pastPapersSuccessResponse({ preferences: await loadPreferences(guard.userId) });
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past paper preferences read failed", "Could not load settings");
        }
      },
      PUT: async ({ request }) => {
        const guard = await guardPastPapersRequest(request, {
          bucket: "past-papers-preferences-write",
          limit: 120,
          windowSeconds: 5 * 60,
          mutation: true,
        });
        if (!guard.ok) return guard.response;

        try {
          const body = await readJsonBody<unknown>(request, 16 * 1024);
          // Merged onto the stored value rather than replacing it, so a settings page that does
          // not know about a newer field cannot silently reset it.
          const current = await loadPreferences(guard.userId);
          const next = mergePastPaperPreferences(current, body);
          await savePreferences(guard.userId, next);
          return pastPapersSuccessResponse({ preferences: next });
        } catch (error: unknown) {
          return pastPapersFailureResponse(error, "Past paper preferences write failed", "Could not save settings");
        }
      },
    },
  },
});
