import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";

import { logger } from "../../../../lib/logger";
import { getStripe, tierForStripePrice } from "../../../../lib/stripe";
import { supabaseAdmin } from "../../../../lib/supabase";

async function findUserId(customerId: string | null, metadataUserId?: string) {
  if (metadataUserId && /^[0-9a-f-]{36}$/i.test(metadataUserId)) return metadataUserId;
  if (!customerId) return null;
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return typeof data?.id === "string" ? data.id : null;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const value = subscription as unknown as Record<string, any>;
  const customerId = typeof value.customer === "string" ? value.customer : value.customer?.id || null;
  const userId = await findUserId(customerId, value.metadata?.millenniumUserId);
  if (!userId) throw new Error("Stripe subscription does not map to a Millennium user.");

  const priceId = value.items?.data?.[0]?.price?.id;
  const tier = tierForStripePrice(priceId);
  const currentPeriodEnd = value.current_period_end || value.items?.data?.[0]?.current_period_end;
  const deleted = value.status === "canceled";
  const { error } = await supabaseAdmin
    .from("users")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: deleted ? null : value.id,
      subscription_tier: deleted ? "free" : tier,
      subscription_status: deleted ? "canceled" : value.status || "inactive",
      subscription_current_period_end: currentPeriodEnd
        ? new Date(Number(currentPeriodEnd) * 1000).toISOString()
        : null,
      subscription_cancel_at_period_end: value.cancel_at_period_end === true,
    })
    .eq("id", userId);
  if (error) throw error;
}

async function processStripeEvent(event: Stripe.Event) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const value = session as unknown as Record<string, any>;
    const customerId = typeof value.customer === "string" ? value.customer : value.customer?.id || null;
    const subscriptionId = typeof value.subscription === "string" ? value.subscription : value.subscription?.id || null;
    const userId = await findUserId(customerId, value.metadata?.millenniumUserId || value.client_reference_id);
    if (!userId) throw new Error("Stripe Checkout session does not map to a Millennium user.");
    const { error } = await supabaseAdmin
      .from("users")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        subscription_tier: value.metadata?.millenniumTier === "frontier" ? "frontier" : "study",
      })
      .eq("id", userId);
    if (error) throw error;
    if (subscriptionId) {
      await syncSubscription(await getStripe().subscriptions.retrieve(subscriptionId));
    }
    return;
  }

  if (
    event.type === "customer.subscription.created"
    || event.type === "customer.subscription.updated"
    || event.type === "customer.subscription.deleted"
  ) {
    await syncSubscription(event.data.object as Stripe.Subscription);
    return;
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as unknown as Record<string, any>;
    const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id || null;
    if (!customerId) return;
    const { error } = await supabaseAdmin
      .from("users")
      .update({ subscription_status: "past_due" })
      .eq("stripe_customer_id", customerId);
    if (error) throw error;
  }
}

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("stripe-signature");
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!signature || !webhookSecret) {
          return Response.json({ message: "Stripe webhook is not configured." }, { status: 503 });
        }

        let event: Stripe.Event;
        try {
          event = getStripe().webhooks.constructEvent(await request.text(), signature, webhookSecret);
        } catch (error) {
          logger.warn("Stripe webhook signature rejected", error);
          return Response.json({ message: "Invalid webhook signature." }, { status: 400 });
        }

        const { error: eventInsertError } = await supabaseAdmin.from("stripe_events").insert({
          event_id: event.id,
          event_type: event.type,
          livemode: event.livemode,
        });
        if (eventInsertError?.code === "23505") return Response.json({ received: true, duplicate: true });
        if (eventInsertError) {
          logger.error("Stripe event reservation failed", eventInsertError);
          return Response.json({ message: "Webhook processing failed." }, { status: 500 });
        }

        try {
          await processStripeEvent(event);
          return Response.json({ received: true });
        } catch (error) {
          await supabaseAdmin.from("stripe_events").delete().eq("event_id", event.id);
          logger.error(`Stripe webhook failed: ${event.type}`, error);
          return Response.json({ message: "Webhook processing failed." }, { status: 500 });
        }
      },
    },
  },
});

