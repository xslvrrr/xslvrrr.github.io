import Stripe from "stripe";

import type { AiPlanTier } from "./ai-models";

let stripeClient: Stripe | null = null;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured.");
  stripeClient ||= new Stripe(secretKey);
  return stripeClient;
}

export function getStripePriceId(tier: Exclude<AiPlanTier, "free">) {
  const value = tier === "study"
    ? process.env.STRIPE_STUDY_PRICE_ID
    : process.env.STRIPE_FRONTIER_PRICE_ID;
  if (!value) throw new Error(`Stripe price for ${tier} tier is not configured.`);
  return value;
}

const EXPECTED_MONTHLY_PRICES_AUD: Record<Exclude<AiPlanTier, "free">, number> = {
  study: 1_000,
  frontier: 3_000,
};

export async function getValidatedStripePrice(tier: Exclude<AiPlanTier, "free">) {
  const price = await getStripe().prices.retrieve(getStripePriceId(tier));
  const expectedAmount = EXPECTED_MONTHLY_PRICES_AUD[tier];
  const correctlyConfigured = (
    price.active
    && price.currency.toLowerCase() === "aud"
    && price.unit_amount === expectedAmount
    && price.type === "recurring"
    && price.recurring?.interval === "month"
    && price.recurring.interval_count === 1
  );
  if (!correctlyConfigured) {
    throw new Error(
      `Stripe ${tier} price must be an active monthly AUD price for A$${(expectedAmount / 100).toFixed(2)}.`,
    );
  }
  return price;
}

export function tierForStripePrice(priceId: string | null | undefined): AiPlanTier {
  if (priceId && priceId === process.env.STRIPE_FRONTIER_PRICE_ID) return "frontier";
  if (priceId && priceId === process.env.STRIPE_STUDY_PRICE_ID) return "study";
  return "free";
}

export function appOrigin(request: Request) {
  const configured = process.env.APP_URL?.replace(/\/$/, "");
  return configured || new URL(request.url).origin;
}
