# Detailed Proposal

## Provider Recommendation
- Use Paddle for subscription billing with hosted checkout, customer portal, webhooks, and tax calculation. The system should support multiple environments (test/prod) and a simple plan mapping strategy.

## Data Model Proposal
- BillingCustomer: links internal account/user to provider customer ID.
- BillingPlan: DB-backed plan definitions mapping to provider product and price IDs. Stored in the database so that environment-specific Paddle IDs (sandbox vs production) can be seeded per environment without code changes, and plans can be activated/deactivated without deploys. Plans are identified by name (e.g. "Pro Monthly", "Team Annual") — there is no rigid tier enum, allowing new plans to be added or old ones grandfathered without migrations.
- BillingPlanEntitlement: entitlements defined per plan. Each row maps a plan to a feature flag and optional limit. An account's entitlements are derived from its subscription's linked plan — there are no per-account entitlement records.
- BillingSubscription: internal representation of the Paddle subscription, status, plan, billing period, and cancellation metadata. An account may have multiple subscription records over time (e.g. after cancellation and re-subscription), but at most one with a non-terminal status (`active`, `trialing`, `past_due`, `paused`) at any given time. Entitlement lookups must filter for the current active subscription.
- BillingEvent: audit log of inbound webhooks and key billing actions.

## Core Flows
- Checkout: create checkout session, redirect user, handle success/cancel, store provider IDs.
- Portal: provide billing portal link and allow payment method management.
- Subscription lifecycle: upgrades/downgrades, cancellation at period end, immediate cancellation.
- Payment failures: pause or restrict access after a defined grace period, notify users via dunning communications.

## Entitlement Strategy
- Entitlements are defined per plan, not per account. An account's entitlements are derived by looking up its active subscription's plan and reading the associated `BillingPlanEntitlement` rows.
- This keeps entitlement data normalized and avoids fragmentation — changing a plan's entitlements automatically applies to all subscribers on that plan.
- Grandfathering is supported by creating a new plan and leaving existing subscribers on the old one.
- Entitlement lookups (account → subscription → plan → plan entitlements) are cached for short periods and refreshed on webhook events.
- Single source of truth in backend; frontends consume via API.

## Future Consideration: Usage/Credit-Based Billing

A future extension may support usage or credit-based billing for AI features (e.g. top-up credits for AI requests). The current model accommodates this without changes to existing tables:

- **Plan credit allocation**: A `BillingPlanEntitlement` row with `feature: 'ai_credits'` and a `limit` defines the monthly credit allowance per plan.
- **Credit ledger** (new table): An append-only transaction log recording all credit movements — additions (plan allocation on renewal, top-up purchases, manual adjustments) and deductions (per-request AI usage). Account balance is derived from the ledger.
- **Top-up purchases**: One-time transactions via Paddle checkout (not subscriptions). The `transaction.completed` webhook credits the account via a ledger entry.
- **Usage metering** (new service): Checks balance before allowing an AI request and deducts credits atomically.
- **Caching**: Credit balance checks must be synchronous and low-latency, which connects to the Phase 2 caching discovery topic.

No changes to existing billing tables are anticipated — the extension is fully additive.

**Free tier and credits**: Usage/credit-based features (e.g. AI) will not be available on the free tier, or may be offered as a paid add-on. However, a small free credit allocation may be granted to free accounts to demonstrate value. The credit ledger model must support attaching credits to free-tier accounts (which have no Paddle subscription or customer record). This is primarily a product decision, but the billing model must not preclude it — the credit ledger should key on `accountId`, not `subscriptionId`.

## Security and Compliance
- Webhooks verified with provider signing secrets.
- Idempotent handling with event IDs.
- Minimal PII stored; rely on provider for payment data.

## Observability
- Structured logging for webhook handling.
- Alerting for webhook failures and repeated payment failures.
- Dashboard for billing events and account states.
