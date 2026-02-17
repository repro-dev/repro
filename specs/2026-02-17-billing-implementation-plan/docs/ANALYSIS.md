# Analysis

## Current State Assumptions
- The product uses a centralized auth system and a user/account model across apps.
- `packages/billing` contains a minimal Paddle Classic (v1) React wrapper (`BillingProvider`, `useBillingClient`) that initializes the Paddle.js SDK with a vendor ID. It does not handle subscriptions, webhooks, or entitlements.
- Feature access is not currently gated by plan or entitlements.
- Billing will be a day-0 feature with no existing users to migrate.

## Migration Note
- The existing `packages/billing` package targets Paddle Classic (v1) which uses `Paddle.Setup({ vendor })`. The new implementation targets Paddle Billing (v2) which uses a different API surface. The existing package should be replaced or upgraded as part of Phase 2.

## Gaps
- No billing data model (plans, subscriptions, entitlements).
- No billing provider integration or webhook handling.
- No billing UI (pricing, checkout, portal, invoices).
- No observability for billing failures or payment issues.

## Risks
- Without centralized entitlements, access control will be inconsistent.
- Webhook failures could lead to stale subscription state.
- Incomplete plan-to-feature mapping risks UX inconsistency.

## Dependencies
- Product decision on plan tiers, pricing, and trial policies.
- Backend ownership for billing state and entitlements.
- Legal/finance requirements for taxes and invoicing.
