import { createFileRoute } from "@tanstack/react-router";

import type { AiPlanTier } from "../../../../lib/ai-models";
import { getBillingState } from "../../../../lib/billing";
import { crossOriginMutationResponse } from "../../../../lib/csrf";
import { internalErrorResponse } from "../../../../lib/api-response";
import { readJsonBody, requestBodyErrorResponse } from "../../../../lib/request-body";
import { readStartSession } from "../../../../lib/start-session";
import { appOrigin, getStripe, getValidatedStripePrice } from "../../../../lib/stripe";
import { supabaseAdmin } from "../../../../lib/supabase";

const noStoreHeaders = { "Cache-Control": "no-store" };

export const Route = createFileRoute("/api/billing/checkout")({
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
          const body = await readJsonBody<{ tier?: unknown }>(request, 8 * 1024);
          const tier = body.tier === "study" || body.tier === "frontier"
            ? body.tier as Exclude<AiPlanTier, "free">
            : null;
          if (!tier) {
            return Response.json({ message: "Invalid subscription tier." }, { status: 400, headers: noStoreHeaders });
          }

          const billing = await getBillingState(session.userId);
          if (billing.tier !== "free" && billing.subscriptionId) {
            return Response.json(
              { message: "Manage your existing subscription through the billing portal." },
              { status: 409, headers: noStoreHeaders },
            );
          }

          const { data: user, error } = await supabaseAdmin
            .from("users")
            .select("email, name, stripe_customer_id")
            .eq("id", session.userId)
            .maybeSingle();
          if (error) throw error;

          const stripe = getStripe();
          let customerId = typeof user?.stripe_customer_id === "string" ? user.stripe_customer_id : null;
          if (!customerId) {
            const customer = await stripe.customers.create({
              email: typeof user?.email === "string" && user.email ? user.email : undefined,
              name: typeof user?.name === "string" && user.name ? user.name : undefined,
              metadata: { millenniumUserId: session.userId },
            });
            customerId = customer.id;
            const { error: updateError } = await supabaseAdmin
              .from("users")
              .update({ stripe_customer_id: customerId })
              .eq("id", session.userId);
            if (updateError) throw updateError;
          }

          const origin = appOrigin(request);
          const automaticTax = process.env.STRIPE_AUTOMATIC_TAX === "true";
          const price = await getValidatedStripePrice(tier);
          const integrationSuffix = Array.from(
            crypto.getRandomValues(new Uint8Array(8)),
            (value) => String.fromCharCode(97 + (value % 26)),
          ).join("");
          const checkout = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customerId,
            client_reference_id: session.userId,
            line_items: [{ price: price.id, quantity: 1 }],
            allow_promotion_codes: true,
            billing_address_collection: automaticTax ? "required" : "auto",
            automatic_tax: { enabled: automaticTax },
            customer_update: automaticTax ? { address: "auto", name: "auto" } : undefined,
            integration_identifier: `millennium_ai_${integrationSuffix}`,
            subscription_data: {
              metadata: {
                millenniumUserId: session.userId,
                millenniumTier: tier,
              },
            },
            metadata: {
              millenniumUserId: session.userId,
              millenniumTier: tier,
            },
            success_url: `${origin}/dashboard?billing=success#settings/billing`,
            cancel_url: `${origin}/dashboard?billing=cancelled#settings/billing`,
          });

          return Response.json({ url: checkout.url }, { headers: noStoreHeaders });
        } catch (error) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          return internalErrorResponse("Stripe checkout creation failed", "Failed to start checkout", error, noStoreHeaders);
        }
      },
    },
  },
});
