# Analysis

## Current State Assumptions
- The product uses a centralized auth system and a user/account model across apps.
- `packages/billing` contains a minimal Paddle Classic (v1) React wrapper (`BillingProvider`, `useBillingClient`) that initializes Paddle.js with a numeric vendor ID via `Paddle.Setup({ vendor })`. This package is outdated and should not be treated as canonical. It does not handle subscriptions, webhooks, or entitlements.
- Feature access is not currently gated by plan or entitlements.
- Billing will be a day-0 feature with no existing users to migrate.

## Migration Note
- The existing `packages/billing` package targets Paddle Classic (v1) which uses `Paddle.Setup({ vendor })`. The new implementation targets Paddle Billing (v2) which uses `Paddle.Initialize({ token })` with a client-side token. The v2 API also replaces the numeric vendor ID with Bearer token authentication (API key) for server-side requests. The existing package should be replaced as part of Phase 2.

## Gaps
- No billing data model (plans, subscriptions, entitlements).
- No billing provider integration or webhook handling.
- No billing UI (pricing, checkout, portal, invoices).
- No observability for billing failures or payment issues.

## Scoping Decision
- Billing domain types are backend-only through Phase 1 and Phase 2. The `packages/domain` package is reserved for types shared between frontend and backend (e.g. generated codecs, account/project interfaces). Shared billing API response types will be introduced in Phase 3 alongside the frontend surfaces that consume them.

## Risks
- Without centralized entitlements, access control will be inconsistent.
- Webhook failures could lead to stale subscription state.
- Incomplete plan-to-feature mapping risks UX inconsistency.

## Dependencies
- Product decision on plan tiers, pricing, and trial policies.
- Backend ownership for billing state and entitlements.
- Legal/finance requirements for taxes and invoicing.
