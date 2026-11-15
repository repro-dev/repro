---
name: billing
description: Billing workflows for plans, subscriptions, entitlements, and Paddle integration.
---

# Billing Skill

Load this skill when working on billing features: subscriptions, plans, entitlements, checkout, webhooks, or the `packages/billing` frontend package.

## Architecture overview

Billing is implemented with **Paddle** as the payment provider. Key packages:

- `apps/api-server/src/services/billing.ts` — server-side `BillingService` (factory function)
- `apps/api-server/src/services/billingWebhook.ts` — webhook handler service
- `apps/api-server/src/services/billingEntitlements.ts` — entitlement cache service
- `apps/api-server/src/routers/billing.ts` — Fastify billing routes
- `apps/api-server/src/routers/billingWebhook.ts` — Fastify webhook route (conditionally registered)
- `apps/api-server/src/modules/billing/` — Paddle client adapter (`paddle.ts`), stub (`stubPaddleClient.ts`), plan config helpers (`planConfig.ts`, `seedPlans.ts`)
- `packages/billing/src/index.tsx` — frontend `BillingProvider`, `BillingClient`, `useBillingClient`

## Server-side: BillingService

Created via `createBillingService(database, env, injectedPaddleClient?)`. The optional third argument allows test code to inject a mock Paddle client.

### Key methods

| Method                                                   | Description                                                                                                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provisionFreeSubscription(accountId)`                   | Called at account creation. Idempotent: no-op if a subscription already exists. Uses `self_provisioned_<accountId>` sentinel prefix for the `providerSubscriptionId`. |
| `getOrCreateCustomer(accountId, email, name?)`           | Finds or creates a Paddle customer record                                                                                                                             |
| `createCheckoutSession(accountId, email, planId, name?)` | Returns a `CheckoutResult` with a `transactionId` for Paddle's frontend checkout overlay                                                                              |
| `getEntitlements(accountId)`                             | Returns cached `BillingEntitlement[]` for an account — always use this rather than querying plans directly                                                            |
| `invalidateEntitlementCache(accountId)`                  | Must be called after any subscription mutation so the next `getEntitlements` call re-fetches                                                                          |
| `upsertSubscription(params)`                             | Used by the webhook handler to apply Paddle subscription events to the database                                                                                       |
| `changePlan(accountId, newPlanId)`                       | Upgrades/downgrades via Paddle API + upserts locally                                                                                                                  |
| `cancelSubscription(accountId)`                          | Schedules cancellation at period end via Paddle                                                                                                                       |
| `recordWebhookEvent(...)`                                | Idempotency record for webhook events — returns `alreadyProcessed: boolean`                                                                                           |
| `markWebhookEventProcessed(eventId, status, error?)`     | Marks the event as success/failed                                                                                                                                     |

### Free plan provisioning

`provisionFreeSubscription` is called by `accountService` during registration:

- Looks up the plan named by `env.BILLING_DEFAULT_PLAN`.
- Sets `currentPeriodEnd` ~100 years in the future (effectively infinite for a free plan).
- Uses `self_provisioned_<accountId>` as the provider subscription ID — **this sentinel identifies records that were not created by Paddle**.
- If the free plan hasn't been seeded yet (e.g. fresh env), the error is swallowed with a warning log rather than failing registration. **Don't treat a missing free plan as a hard error at signup.**

### Stub mode

When `env.BILLING_STUBBED` is `true`, `createBillingService` uses `createStubPaddleClient` instead of the real Paddle SDK. The stub is backed by the local database — it creates customers/subscriptions directly in `billing_customers` / `billing_subscriptions` tables without touching Paddle. This is the default in local development.

The webhook router is **never registered** in stub mode:

```ts
// apps/api-server/src/index.ts
const billingWebhookRouter =
  !env.BILLING_STUBBED && env.PADDLE_API_KEY && env.PADDLE_WEBHOOK_SECRET
    ? createBillingWebhookRouter(...)
    : null
```

### Entitlement caching

Entitlements are cached in memory per `accountId`. After any subscription mutation (plan change, cancellation, webhook upsert), always call `invalidateEntitlementCache(accountId)` using `tapF` (from `@repro/future-utils`) so the cache is cleared while the original value passes through:

```ts
import { tapF } from "@repro/future-utils";

return doSomeMutation(accountId).pipe(
  tapF(() => billingService.invalidateEntitlementCache(accountId)),
);
```

## Database schema (key tables)

| Table                    | Purpose                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| `billing_customers`      | Maps `accountId` → Paddle `providerCustomerId`                             |
| `billing_plans`          | Plan definitions with `providerPriceId`, `providerProductId`, `interval`   |
| `billing_subscriptions`  | Active subscriptions; `providerSubscriptionId` = Paddle sub ID or sentinel |
| `billing_entitlements`   | Feature entitlements per plan (`feature`, `enabled`, `limit`)              |
| `billing_webhook_events` | Idempotency log for Paddle webhook events                                  |

## Frontend: BillingProvider and BillingClient

`packages/billing/src/index.tsx` exposes:

```tsx
<BillingProvider
  config={{ environment: "sandbox", token: "paddle-client-token" }}
>
  <App />
</BillingProvider>
```

`BillingProvider` accepts either a `config` object or a pre-built `client` instance (for testing). The client lazily loads the Paddle.js script and initialises `window.Paddle` on first call to `client.init()`.

```ts
const client = useBillingClient();

client.init(); // Load Paddle.js and initialise
client.openCheckout(options); // Open Paddle checkout overlay
client.closeCheckout(); // Close overlay
```

`openCheckout` proxies to `window.Paddle.Checkout.open(options)`. The `options` object follows the [Paddle Checkout JS API](https://developer.paddle.com/paddlejs/methods/paddle-checkout-open).

## Webhook flow

1. Paddle posts to `/billing/webhook`.
2. `recordWebhookEvent(providerEventId, eventType, payload)` writes an idempotency record and returns `alreadyProcessed: boolean`. If already processed, skip.
3. Dispatch on `eventType` (e.g. `subscription.created`, `subscription.updated`, `subscription.canceled`).
4. Call `upsertSubscription(params)` to apply the change.
5. Call `invalidateEntitlementCache(accountId)` to bust the cache.
6. Call `markWebhookEventProcessed(eventId, 'success' | 'failed', errorMsg?)`.

## Gotchas

- All IDs (plan IDs, account IDs, subscription IDs) passed to `BillingService` methods are **encoded string IDs** (Sqids), not raw integers. Internally, `decodeId` is called before DB queries. Never pass raw numeric IDs from outside the module.
- The stub Paddle client skips the actual Paddle API but does write to the local DB. This means `createTransaction` in stub mode returns a mock transaction with a fake `id` — the frontend checkout overlay will not actually work locally.
- `BILLING_DEFAULT_PLAN` must match the `name` column of a row in `billing_plans`. If the seed hasn't run, free subscriptions will silently fail to provision (with a console warning).
- `listPlansWithEntitlements` joins plans and entitlements and returns a `BillingPlanWithEntitlements[]` — use this for the pricing page, not separate calls.
