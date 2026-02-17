# Implementation Guide

## Phase 1: Foundations
1. Confirm requirements with product/finance (all apps).
2. Create Paddle accounts for sandbox and production.
3. Define plan matrix and map each plan to Paddle product + price IDs.
4. Define payment failure policy, including dunning cadence and grace period before restriction.
5. Add Paddle secrets and config (apps/api-server config): vendor ID, API key, webhook secret, environment.
6. Define local development overrides (apps/api-server config): default plan, per-account override, and stubbed billing mode.
7. Create billing data model and migration plan (apps/api-server/src/migrations). Use native Postgres `boolean` columns for boolean fields (`cancelAtPeriodEnd`, `enabled`). Register new table interfaces in `apps/api-server/src/modules/database/schema/index.ts`.

## Phase 2: Provider Integration
0. Migrate or replace `packages/billing` (Paddle Classic v1 wrapper) with Paddle Billing v2 client. Remove the legacy `BillingProvider`/`useBillingClient` if no longer needed.
1. Implement Paddle client wrapper under modules (apps/api-server/src/modules/billing).
2. Implement an opaque billing service interface (apps/api-server/src/services/billing.ts) that hides provider specifics.
3. Implement a development billing adapter that bypasses Paddle and returns the configured plan (apps/api-server/src/services/billingDev.ts).
4. Create checkout session endpoint (apps/api-server/src/routers/billing.ts) that accepts plan ID and returns Paddle checkout URL.
5. Store Paddle customer + subscription IDs on account records in billing tables.
6. Implement webhook receiver (apps/api-server/src/routers/billingWebhook.ts + apps/api-server/src/services/billingWebhook.ts).
7. Verify webhook signatures with Paddle secret and ensure idempotency by event ID.
8. Handle subscription lifecycle events: subscription_created, subscription_updated, subscription_cancelled, payment_succeeded, payment_failed.
9. Update entitlements and invalidate entitlement caches immediately on webhook events (apps/api-server/src/services/billingEntitlements.ts).

## Phase 3: Product Surfaces
1. Pricing page with plan comparison and CTA to create Paddle checkout session (apps/workspace/src/routes/PricingRoute.tsx).
2. Checkout flow integration: call billing API, redirect to Paddle checkout URL (apps/workspace/src/routes/CheckoutRoute.tsx + apiBridge).
3. Billing settings page with plan status and cancel/upgrade actions (apps/workspace/src/routes/BillingSettingsRoute.tsx).
4. Feature gates in API and UI (apps/api-server/src/services/featureGate.ts + apps/workspace/src/hooks/useEntitlements.ts).

## Phase 4: Rollout and Operations
1. Add integration tests against Paddle sandbox for checkout, webhooks, and entitlements.
2. Sandbox testing and QA (apps/api-server tests + apps/workspace smoke flows).
3. Staged rollout to internal users then external (apps/api-server feature flags).
4. Monitor payment failures and webhook errors (apps/api-server logging/alerts).
5. Document local dev overrides and reset steps (reference/TROUBLESHOOTING.md updates).

## Verification Checklist
- Checkout succeeds and creates subscription.
- Webhooks update subscription status.
- Plan upgrades/downgrades propagate to entitlements.
- Cancellation updates access after period end.
- Billing portal access works.
- Payment failure handling follows policy.

## Rollback Plan
- Disable checkout routes.
- Stop processing webhooks.
- Remove plan gating while keeping monitoring.
