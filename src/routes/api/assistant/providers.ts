import { createFileRoute } from "@tanstack/react-router";

import { internalErrorResponse } from "../../../../lib/api-response";
import {
  deleteAssistantProviderConnection,
  listAssistantProviderConnections,
  saveAssistantProviderConnection,
  validateAssistantProviderConnectionInput,
} from "../../../../lib/assistant/provider-connections";
import { crossOriginMutationResponse } from "../../../../lib/csrf";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { readJsonBody, requestBodyErrorResponse } from "../../../../lib/request-body";
import { readStartSession } from "../../../../lib/start-session";

const noStoreHeaders = { "Cache-Control": "no-store" };
const BODY_LIMIT = 8 * 1024;

function authenticatedUserId(request: Request): string | null {
  const session = readStartSession(request);
  return session.loggedIn && session.userId ? session.userId : null;
}

export const Route = createFileRoute("/api/assistant/providers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = authenticatedUserId(request);
        if (!userId) {
          return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
        }
        try {
          const limit = await consumeRateLimit("assistant-providers-read", userId, 60, 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
          return Response.json(
            { connections: await listAssistantProviderConnections(userId) },
            { headers: noStoreHeaders },
          );
        } catch (error) {
          return internalErrorResponse(
            "Assistant provider connections load failed",
            "Failed to load provider connections.",
            error,
            noStoreHeaders,
          );
        }
      },
      PUT: async ({ request }) => {
        const userId = authenticatedUserId(request);
        if (!userId) {
          return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
        }
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        try {
          const limit = await consumeRateLimit("assistant-providers-write", userId, 10, 10 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
          const body = await readJsonBody<unknown>(request, BODY_LIMIT);
          if (!validateAssistantProviderConnectionInput(body)) {
            return Response.json(
              { message: "Provider connection is invalid." },
              { status: 400, headers: noStoreHeaders },
            );
          }
          const connection = await saveAssistantProviderConnection(userId, body);
          return Response.json({ connection }, { headers: noStoreHeaders });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          const message = error instanceof Error ? error.message : "Provider connection failed.";
          if (/Provider|Model|credential/i.test(message)) {
            return Response.json({ message }, { status: 400, headers: noStoreHeaders });
          }
          return internalErrorResponse(
            "Assistant provider connection save failed",
            "Failed to save provider connection.",
            error,
            noStoreHeaders,
          );
        }
      },
      DELETE: async ({ request }) => {
        const userId = authenticatedUserId(request);
        if (!userId) {
          return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
        }
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        try {
          const limit = await consumeRateLimit("assistant-providers-delete", userId, 10, 10 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
          const url = new URL(request.url);
          const connectionId = url.searchParams.get("id") || "";
          if (!/^[0-9a-f-]{36}$/i.test(connectionId)) {
            return Response.json({ message: "Connection id is invalid." }, { status: 400, headers: noStoreHeaders });
          }
          const deleted = await deleteAssistantProviderConnection(userId, connectionId);
          return Response.json({ deleted }, { status: deleted ? 200 : 404, headers: noStoreHeaders });
        } catch (error) {
          return internalErrorResponse(
            "Assistant provider connection delete failed",
            "Failed to remove provider connection.",
            error,
            noStoreHeaders,
          );
        }
      },
    },
  },
});

