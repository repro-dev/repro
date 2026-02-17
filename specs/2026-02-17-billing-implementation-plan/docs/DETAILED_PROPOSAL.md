# Detailed Proposal

## Provider Recommendation
- Use Paddle for subscription billing with hosted checkout, customer portal, webhooks, and tax calculation. The system should support multiple environments (test/prod) and a simple plan mapping strategy.

## Data Model Proposal
- BillingCustomer: links internal account/user to provider customer ID.
- BillingPlan: internal plan definition mapped to provider price IDs.
- BillingSubscription: internal representation of the Paddle subscription, status, plan, billing period, and cancellation metadata.
- BillingEntitlement: derived entitlements for feature gating, based on plan and usage.
- BillingEvent: audit log of inbound webhooks and key billing actions.

## Core Flows
- Checkout: create checkout session, redirect user, handle success/cancel, store provider IDs.
- Portal: provide billing portal link and allow payment method management.
- Subscription lifecycle: upgrades/downgrades, cancellation at period end, immediate cancellation.
- Payment failures: pause or restrict access after a defined grace period, notify users via dunning communications.

## Entitlement Strategy
- Centralized service or module that resolves entitlements for a given account.
- Entitlements cached for short periods and refreshed immediately on webhook events.
- Single source of truth in backend; frontends consume via API.

## Security and Compliance
- Webhooks verified with provider signing secrets.
- Idempotent handling with event IDs.
- Minimal PII stored; rely on provider for payment data.

## Observability
- Structured logging for webhook handling.
- Alerting for webhook failures and repeated payment failures.
- Dashboard for billing events and account states.
