import { createFileRoute } from "@tanstack/react-router";

import { getBillingState } from "../../../../lib/billing";
import { crossOriginMutationResponse } from "../../../../lib/csrf";
import { internalErrorResponse } from "../../../../lib/api-response";
import { readStartSession } from "../../../../lib/start-session";
import { appOrigin, getStripe } from "../../../../lib/stripe";

const noStoreHeaders = { "Cache-Control": "no-store" };

export const Route = createFileRoute("/api/billing/portal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
        }

        try {
          const billing = await getBillingState(session.userId);
          if (!billing.customerId) {
            return Response.json({ message: "No billing account exists yet." }, { status: 404, headers: noStoreHeaders });
          }

          const portal = await getStripe().billingPortal.sessions.create({
            customer: billing.customerId,
            return_url: `${appOrigin(request)}/dashboard#settings/billing`,
          });
          return Response.json({ url: portal.url }, { headers: noStoreHeaders });
        } catch (error) {
          return internalErrorResponse("Stripe portal creation failed", "Failed to open billing portal", error, noStoreHeaders);
        }
      },
    },
  },
});

