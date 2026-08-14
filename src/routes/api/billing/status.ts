import { createFileRoute } from "@tanstack/react-router";

import { getBillingSummary } from "../../../../lib/billing";
import { internalErrorResponse } from "../../../../lib/api-response";
import { readStartSession } from "../../../../lib/start-session";
import {
  listAssistantProviderConnections,
  providerConnectionModelId,
} from "../../../../lib/assistant/provider-connections";

const noStoreHeaders = { "Cache-Control": "no-store" };

export const Route = createFileRoute("/api/billing/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
        }

        try {
          const [summary, connections] = await Promise.all([
            getBillingSummary(session.userId),
            listAssistantProviderConnections(session.userId),
          ]);
          return Response.json({
            ...summary,
            models: [
              ...connections.map((connection) => ({
                id: providerConnectionModelId(connection.id),
                label: connection.label,
                description: `Your ${connection.provider} account · ${connection.model}`,
                minimumTier: "free",
                lab: connection.provider,
                recommended: true,
                locked: false,
                priceBand: 1,
                externalBilling: true,
              })),
              ...summary.models,
            ],
          }, { headers: noStoreHeaders });
        } catch (error) {
          return internalErrorResponse("Billing status load failed", "Failed to load billing status", error, noStoreHeaders);
        }
      },
    },
  },
});
