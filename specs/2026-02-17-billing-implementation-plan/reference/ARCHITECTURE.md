# Billing Architecture

## Components
- Billing API: owns customer creation, checkout sessions, portal link generation.
- Webhook Receiver: validates and processes provider events.
- Entitlement Service: resolves feature access per account.
- UI Surfaces: pricing, checkout, billing settings.

## Data Flow
1. User initiates checkout from pricing page.
2. Billing API creates provider checkout session.
3. Provider redirects back to product; subscription created.
4. Webhook updates subscription status and entitlements.
5. API and UI consult entitlements for access control.

## Integration Points
- Auth/Accounts: map billing customers to internal accounts.
- Feature gating: API middleware and frontend guard hooks.
