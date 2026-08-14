# Millennium Stripe implementation plan

## Business and scope

- **Business:** Millennium, a modern student dashboard with customisation, calendar/class data, study tools, and AI-assisted study.
- **Local integration origin:** `http://millennium-five.vercel.app`
- **Production origin later:** `https://millennium-five.vercel.app`
- **Stripe products in scope:** Billing and subscription-generated Invoicing.
- **Currency:** AUD only for the initial catalogue.

## Commercial model

| Tier | Stripe Product | Monthly Price | Access |
| --- | --- | ---: | --- |
| Free | No Stripe Product | A$0 | Free model, flashcards, spaced repetition, one fixed Frontier planning trial |
| Study | Millennium Study | A$10 | Sonnet 5, 5.6 Luna, Gemini 3 Pro |
| Frontier | Millennium Frontier | A$30 | Study models plus Fable 5 and 5.6 Sol |

Study and Frontier are separate Stripe Products because they are distinct service tiers. Each has one monthly AUD Price. Annual billing can later be added as another Price on the corresponding Product.

## Recommended architecture

```text
Settings → Billing
       │
       ├── Free user chooses a tier
       │       └── POST /api/billing/checkout
       │               └── Stripe-hosted subscription Checkout
       │
       ├── Existing subscriber
       │       └── POST /api/billing/portal
       │               └── Stripe-hosted customer portal
       │
       └── Stripe lifecycle events
               └── POST /api/stripe/webhook
                       └── verified + idempotent entitlement sync
```

The application—not client state—decides model access from the server-side subscription entitlement. Checkout and the customer portal remain Stripe-hosted, reducing payment-data and PCI scope.

## Stripe object model

1. One Stripe Customer per Millennium user.
2. At most one active AI subscription per user.
3. One subscription item referencing either the Study or Frontier Price.
4. Metadata on the Customer/Checkout Session/Subscription:
   - `millenniumUserId`
   - `millenniumTier`
5. Stripe-generated invoices for initial and recurring subscription payments.
6. Stripe customer portal for invoices, payment methods, cancellation, and plan changes.

## Subscription lifecycle

1. Server authenticates the Millennium session and rejects cross-site mutation requests.
2. Server retrieves and validates the configured Price:
   - active;
   - AUD;
   - monthly;
   - A$10 or A$30, depending on tier.
3. Server creates or reuses the Stripe Customer.
4. Hosted Checkout creates the subscription.
5. Signed webhook events synchronize subscription ID, tier, status, period end, and cancellation state.
6. Only `active` and `trialing` subscriptions receive paid entitlements.
7. `past_due`, canceled, incomplete, or expired states fall back to Free.

Before launch, decide whether `past_due` should lose paid access immediately, as it does now, or receive a short grace period while Stripe retries payment.

## Invoicing plan

Stripe Billing automatically generates invoices for subscription creation and renewal. Configure:

- invoice branding and business details;
- customer invoice emails;
- payment-failure and upcoming-renewal emails;
- Smart Retries/dunning rules;
- invoice history in the customer portal;
- tax IDs and tax display if relevant;
- a clear statement descriptor.

No custom invoice-creation endpoint is needed for the current fixed subscription model. Add one only if Millennium later sells school licences, manual adjustments, or one-off institutional services.

## Tax plan

Keep `STRIPE_AUTOMATIC_TAX=false` until:

1. a tax adviser confirms where Millennium is obligated to collect;
2. the relevant registration is active and marked Collecting in Stripe;
3. both Products have a confirmed product tax code;
4. both Prices have the intended inclusive/exclusive tax behaviour;
5. Australian and representative overseas Checkout addresses have been tested.

Enabling automatic tax without an active registration silently collects no tax.

## Security plan

- Prefer a least-privilege restricted API key (`rk_`) over an unrestricted secret key.
- Store it as a sensitive Vercel environment variable.
- Use separate test and live keys, Prices, portal configurations, and webhook secrets.
- Never expose a Stripe key through Vite/client variables.
- Verify webhooks with the raw UTF-8 body and `Stripe-Signature`.
- Keep webhook event IDs for idempotency.
- Require passkeys or authenticator-app 2FA for Stripe Dashboard users.
- Review Workbench request logs before granting permissions to the production restricted key.

Required restricted-key capabilities should be limited to the operations this implementation uses:

- Customers: create/read
- Checkout Sessions: create
- Billing Portal Sessions: create
- Prices: read
- Subscriptions: read

Webhook signature verification itself uses the endpoint signing secret, not the API key.

## Operational safeguards

- Study provider-cost ceiling: US$6 per user per calendar month by default.
- Frontier provider-cost ceiling: US$20 per user per calendar month by default.
- Free model and flashcards continue after a paid-model allowance is reached.
- Trial prompt is fixed and capped below US$0.50.
- Alert on webhook failures, repeated payment failures, trial failures, and unusual OpenRouter spend.
- Reconcile Stripe active subscriptions against Millennium entitlements regularly.

## Rollout order

1. Apply the Supabase migration.
2. Create test-mode Products and monthly AUD Prices.
3. Configure Checkout branding and dynamic payment methods.
4. Configure the test customer portal and invoice settings.
5. Create the local Stripe CLI webhook listener.
6. Add local test environment values.
7. Complete Study and Frontier test purchases.
8. Exercise upgrade, downgrade, cancellation, failed payment, webhook retry, and invoice-history flows.
9. Decide tax registrations and past-due grace policy.
10. Create the equivalent live Stripe objects.
11. Add sensitive Vercel environment values and production webhook.
12. Change `APP_URL` to the production origin only at launch.

## Existing integration review

Implemented and aligned:

- Billing APIs with hosted subscription Checkout.
- Hosted customer portal.
- Dynamic payment methods—no hardcoded `payment_method_types`.
- Server-side Price/tier mapping and entitlement enforcement.
- Raw-body webhook signature verification.
- Idempotent webhook event processing.
- Stripe Customer reuse.
- Separate monthly AI-spend safeguards.
- Monthly AUD Price validation.
- Checkout integration identifiers.
- Subscription-generated invoicing and portal invoice history.

Dashboard/operations work still required:

- Create the two test Products and Prices.
- Configure the portal, invoice emails, Smart Retries, and dunning.
- Create a least-privilege restricted test key.
- Configure and test the webhook destination.
- Confirm tax registrations/product tax codes before enabling Stripe Tax.
- Decide immediate versus grace-period handling for `past_due`.
- Repeat all configuration with live-mode objects before production.
