# Analysis

## Current State Assumptions
- The product uses a centralized auth system and a user/account model across apps.
- There is no current billing provider integration.
- Feature access is not currently gated by plan or entitlements.

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
