import { createFileRoute } from "@tanstack/react-router";

import {
  AdministratorActionError,
  type AdministratorAiResetAction,
  listAdministratorUsers,
  requireAdministrator,
  resetAdministratorUserAi,
  setAdministratorUserRole,
  type UserRole,
} from "../../../../lib/admin";
import { internalErrorResponse } from "../../../../lib/api-response";
import { crossOriginMutationResponse } from "../../../../lib/csrf";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { readJsonBody, requestBodyErrorResponse } from "../../../../lib/request-body";
import { readStartSession } from "../../../../lib/start-session";

const noStoreHeaders = { "Cache-Control": "no-store" };
const ADMIN_BODY_MAX_BYTES = 8 * 1024;
const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resetActions = new Set<AdministratorAiResetAction>([
  "reset-ai-limit",
  "reset-trial",
  "reset-ai-all",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function administratorErrorResponse(error: unknown): Response | null {
  if (!(error instanceof AdministratorActionError)) return null;
  return Response.json({ message: error.message }, { status: error.status, headers: noStoreHeaders });
}

async function administratorUserId(request: Request): Promise<string | Response> {
  const session = readStartSession(request);
  if (!session.loggedIn || !session.userId) {
    return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
  }
  await requireAdministrator(session.userId);
  return session.userId;
}

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actorUserId = await administratorUserId(request);
          if (actorUserId instanceof Response) return actorUserId;
          const limit = await consumeRateLimit("admin-users-read", actorUserId, 60, 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);

          const url = new URL(request.url);
          const page = Number(url.searchParams.get("page") || 1);
          const pageSize = Number(url.searchParams.get("pageSize") || 25);
          const search = url.searchParams.get("search") || "";
          return Response.json(await listAdministratorUsers({
            actorUserId,
            search,
            page,
            pageSize,
          }), { headers: noStoreHeaders });
        } catch (error) {
          const adminError = administratorErrorResponse(error);
          if (adminError) return adminError;
          return internalErrorResponse(
            "Administrator user list failed",
            "Failed to load administrator tools.",
            error,
            noStoreHeaders,
          );
        }
      },
      PATCH: async ({ request }) => {
        try {
          const actorUserId = await administratorUserId(request);
          if (actorUserId instanceof Response) return actorUserId;
          const crossOrigin = crossOriginMutationResponse(request);
          if (crossOrigin) return crossOrigin;
          const limit = await consumeRateLimit("admin-users-write", actorUserId, 30, 5 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);

          const body = await readJsonBody<unknown>(request, ADMIN_BODY_MAX_BYTES);
          if (
            !isRecord(body)
            || typeof body.userId !== "string"
            || !userIdPattern.test(body.userId)
            || (body.role !== "user" && body.role !== "admin")
          ) {
            return Response.json(
              { message: "Administrator role request is invalid." },
              { status: 400, headers: noStoreHeaders },
            );
          }
          const user = await setAdministratorUserRole({
            actorUserId,
            targetUserId: body.userId,
            role: body.role as UserRole,
          });
          return Response.json({ user }, { headers: noStoreHeaders });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          const adminError = administratorErrorResponse(error);
          if (adminError) return adminError;
          return internalErrorResponse(
            "Administrator role update failed",
            "Failed to update user role.",
            error,
            noStoreHeaders,
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const actorUserId = await administratorUserId(request);
          if (actorUserId instanceof Response) return actorUserId;
          const crossOrigin = crossOriginMutationResponse(request);
          if (crossOrigin) return crossOrigin;
          const limit = await consumeRateLimit("admin-debug-write", actorUserId, 30, 5 * 60);
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);

          const body = await readJsonBody<unknown>(request, ADMIN_BODY_MAX_BYTES);
          if (
            !isRecord(body)
            || typeof body.userId !== "string"
            || !userIdPattern.test(body.userId)
            || typeof body.action !== "string"
            || !resetActions.has(body.action as AdministratorAiResetAction)
          ) {
            return Response.json(
              { message: "Administrator reset request is invalid." },
              { status: 400, headers: noStoreHeaders },
            );
          }
          const result = await resetAdministratorUserAi({
            actorUserId,
            targetUserId: body.userId,
            action: body.action as AdministratorAiResetAction,
          });
          return Response.json({ result }, { headers: noStoreHeaders });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          const adminError = administratorErrorResponse(error);
          if (adminError) return adminError;
          return internalErrorResponse(
            "Administrator AI reset failed",
            "Failed to reset AI state.",
            error,
            noStoreHeaders,
          );
        }
      },
    },
  },
});
