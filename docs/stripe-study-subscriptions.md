# Stripe setup for Millennium study subscriptions

The application code is ready for two recurring subscription tiers:

- **Study** — Sonnet 5, 5.6 Luna, and Gemini 3 Pro.
- **Frontier** — everything in Study plus Fable 5 and 5.6 Sol.

Free users retain Nemotron 3 Nano, flashcards, spaced repetition, and one fixed-purpose Frontier study-planning trial.

## 1. Decide pricing and commercial policy

The initial pricing is:

- **Study: A$10 per month**
- **Frontier: A$30 per month**

Before launch, also decide:

- whether to offer annual prices later;
- refund/cancellation policy;
- countries you will sell into;
- whether taxes are included in or added to the displayed price.

The server defaults to monthly OpenRouter cost ceilings of **US$6 for Study** and **US$20 for Frontier** per user. Set retail prices with room for Stripe fees, OpenRouter costs, tax, support, refunds, and margin. The cost ceiling stops paid-model access for the rest of a calendar month; free-model and flashcard access continue.

## 2. Create the Stripe products and prices

Do this in **Stripe Dashboard → Product catalog**, in test mode first.

1. Create a product named **Millennium Study**.
2. Give it one recurring monthly Price:
   - currency: **AUD**
   - amount: **A$10.00**
   - interval: **Monthly**
3. Create a separate product named **Millennium Frontier**.
4. Give it one recurring monthly Price:
   - currency: **AUD**
   - amount: **A$30.00**
   - interval: **Monthly**
5. Choose and record the appropriate Stripe Tax product code for each product; confirm it with your tax adviser rather than guessing.
6. Use the same tax behaviour for both Prices.
7. Copy each `price_...` ID and set:

   ```env
   STRIPE_STUDY_PRICE_ID=price_...
   STRIPE_FRONTIER_PRICE_ID=price_...
   ```

Study and Frontier are distinct Products because they provide different service tiers. Multiple Prices on one Product should instead represent variants of the same tier, such as monthly/annual billing or another currency. The server validates that the configured IDs are active monthly AUD Prices for exactly A$10 and A$30. Do not reuse test Price IDs in production; live mode creates different IDs.

## 3. Configure subscription Checkout

The app creates hosted Stripe Checkout sessions. In **Settings → Checkout and Payment Links**:

1. Add Millennium branding, support details, terms URL, and privacy URL.
2. Enable the payment methods you will accept. The code deliberately does not hardcode `payment_method_types`, so Stripe can use eligible dynamic payment methods.
3. Decide whether promotion codes should remain enabled. The implementation currently allows them.
4. Review the statement descriptor and customer email settings.

Create a restricted API key with only the permissions this server needs—Customers, Checkout Sessions, Billing Portal Sessions, Prices read, and Subscriptions read—and set it as the server key:

```env
STRIPE_SECRET_KEY=rk_test_...
APP_URL=http://millennium-five.vercel.app
```

Keep `APP_URL=http://millennium-five.vercel.app` for now. At production launch, change it to `https://millennium-five.vercel.app`. Store the key as a sensitive Vercel environment variable; never expose it through a `VITE_` variable or commit it.

Checkout validates the configured Price and tags each Session with a unique Millennium integration identifier. Billing automatically creates invoices for these subscriptions.

## 4. Configure the customer portal

In **Settings → Billing → Customer portal**:

1. Enable subscription cancellation.
2. Choose whether cancellation is immediate or at period end. Period-end cancellation is the safer default for prepaid monthly access.
3. Enable plan switching and add both Study and Frontier products to the portal catalog.
4. Because these are separate Products, use immediate switching with your chosen proration behaviour. Stripe's scheduled end-of-period downgrade option only works between Prices on the same Product; supporting scheduled cross-product downgrades would require a custom subscription-schedule flow.
5. Enable payment-method updates and invoice-history access.
6. Add business information, support contact, privacy policy, and terms.
7. Set the default portal return URL to `http://millennium-five.vercel.app/dashboard#settings/billing` for testing.
8. Save the test configuration, then separately configure live mode.

The app sends existing subscribers to this portal rather than opening a second Checkout subscription.

## 5. Create and secure the webhook

For local testing, install Stripe CLI and run:

```sh
stripe login
stripe listen --forward-to millennium-five.vercel.app/api/stripe/webhook
```

Copy the temporary `whsec_...` value printed by `stripe listen`:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

For production, create a webhook endpoint in **Developers → Webhooks**:

```text
https://YOUR_DOMAIN/api/stripe/webhook
```

Subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Copy that endpoint's signing secret to the production `STRIPE_WEBHOOK_SECRET`. Test and live webhook secrets are different. The endpoint verifies Stripe's signature against the raw request body and records event IDs to make retries idempotent.

## 6. Apply the database migration

Apply:

```text
supabase/migrations/202607240002_study_billing.sql
```

It adds subscription entitlement fields, flashcard storage, AI usage tracking, one-use study trials, and Stripe webhook idempotency records. Confirm the server's Supabase service role can access the new tables. Browser roles are deliberately revoked from the billing and usage tables.

## 7. Configure tax

If you use Stripe Tax:

1. Determine where the business has tax obligations with an accountant or tax adviser.
2. Add registrations in **Tax → Registrations**.
3. Set and confirm the product tax code on both Millennium products.
4. Confirm whether each price is tax-inclusive or tax-exclusive.
5. Test customer addresses in your main markets.
6. Only then set:

   ```env
   STRIPE_AUTOMATIC_TAX=true
   ```

Leaving this false does not remove your tax obligations; it only prevents this integration from asking Stripe to calculate tax automatically.

## 8. Set provider budgets

Configure monthly provider-cost safeguards:

```env
AI_STUDY_MONTHLY_BUDGET_CENTS=600
AI_FRONTIER_MONTHLY_BUDGET_CENTS=2000
```

These values are internal OpenRouter-spend limits in US cents, not customer-facing subscription prices. Review real usage after launch and tune them against plan economics.

The one-time frontier trial sends no free-form user prompt. It uses a fixed subject-flashcard generation prompt plus capped class and school-calendar context, then permits exactly one `create_flashcard_sets` tool call. System context is capped at 20,000 characters and completion output at 4,000 tokens. Recalculate the conservative cost ceiling whenever the configured provider model or pricing changes; monthly provider budgets remain the enforced spend safeguard.

## 9. Test the full lifecycle in Stripe test mode

Use Stripe's test cards and verify:

1. Free user sees only Nemotron and can create/review flashcards.
2. Study Checkout completes and the webhook grants Study models.
3. Frontier Checkout grants all models.
4. A paid user can switch tiers in the portal and the webhook updates access.
5. Period-end cancellation preserves access until the period end.
6. Immediate cancellation removes paid access.
7. `invoice.payment_failed` removes paid access because the subscription becomes non-active.
8. Duplicate webhook delivery does not process twice.
9. The Frontier trial can complete once; a provider failure permits a retry.
10. A user cannot select a paid model by manually changing the API request.
11. Monthly cost ceilings block only paid-model calls.
12. Success and cancel redirects return to **Settings → Billing**.

Useful Stripe CLI commands:

```sh
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed
```

For lifecycle accuracy, also complete a real test-mode Checkout from the app; generic trigger fixtures may not contain Millennium metadata.

## 10. Production launch checklist

1. Complete Stripe account activation, business verification, bank payout details, and two-factor authentication.
2. Create live product prices.
3. Configure the live customer portal.
4. Create the live webhook and signing secret.
5. Set live environment variables.
6. Set the production `APP_URL`.
7. Apply the database migration before deploying the code.
8. Deploy, then make one low-value live purchase with an authorised card.
9. Confirm the user entitlement, webhook event, invoice, portal, cancellation, and refund paths.
10. Add alerts for webhook failures, unusual AI spend, trial failures, payment failures, and entitlement mismatches.
11. Document support procedures for refunds, duplicate subscriptions, chargebacks, and manual entitlement correction.
12. Review privacy disclosures: calendar/class context is sent to OpenRouter only when the user invokes the study trial or AI assistant.

## Environment variable summary

```env
APP_URL=https://millennium-five.vercel.app
STRIPE_SECRET_KEY=rk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STUDY_PRICE_ID=price_...
STRIPE_FRONTIER_PRICE_ID=price_...
STRIPE_AUTOMATIC_TAX=false
AI_STUDY_MONTHLY_BUDGET_CENTS=600
AI_FRONTIER_MONTHLY_BUDGET_CENTS=2000
OPENROUTER_API_KEY=...
```
