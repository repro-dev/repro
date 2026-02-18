# Detailed Proposal

## Provider Recommendation
- Use Paddle for subscription billing with hosted checkout, customer portal, webhooks, and tax calculation. The system should support multiple environments (test/prod) and a simple plan mapping strategy.

## Data Model Proposal
- BillingCustomer: links internal account/user to provider customer ID.
- BillingPlan: DB-backed plan definitions mapping to provider product and price IDs. Stored in the database so that environment-specific Paddle IDs (sandbox vs production) can be seeded per environment without code changes, and plans can be activated/deactivated without deploys. Plans are identified by name (e.g. "Pro Monthly", "Team Annual") — there is no rigid tier enum, allowing new plans to be added or old ones grandfathered without migrations.
- BillingPlanEntitlement: entitlements defined per plan. Each row maps a plan to a feature flag and optional limit. An account's entitlements are derived from its subscription's linked plan — there are no per-account entitlement records.
- BillingSubscription: internal representation of the Paddle subscription, status, plan, billing period, and cancellation metadata.
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

## Security and Compliance
- Webhooks verified with provider signing secrets.
- Idempotent handling with event IDs.
- Minimal PII stored; rely on provider for payment data.

## Observability
- Structured logging for webhook handling.
- Alerting for webhook failures and repeated payment failures.
- Dashboard for billing events and account states.
