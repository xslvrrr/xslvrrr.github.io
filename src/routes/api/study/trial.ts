import { createFileRoute } from "@tanstack/react-router";

import { crossOriginMutationResponse } from "../../../../lib/csrf";

const noStoreHeaders = { "Cache-Control": "no-store" };

export const Route = createFileRoute("/api/study/trial")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        return Response.json(
          { message: "Study trial moved to the AI Agent subject flashcard workflow." },
          { status: 410, headers: noStoreHeaders },
        );
      },
    },
  },
});
