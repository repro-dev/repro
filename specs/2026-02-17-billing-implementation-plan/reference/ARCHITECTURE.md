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
4. Webhook updates subscription status.
5. API and UI derive entitlements from account → subscription → plan → plan entitlements.

## Integration Points
- Auth/Accounts: map billing customers to internal accounts.
- Feature gating: API middleware and frontend guard hooks.

## Checkout Flow

```mermaid
sequenceDiagram
    participant User as User (Browser)
    participant UI as Workspace App
    participant API as API Server
    participant Paddle as Paddle API

    Note over User,Paddle: Checkout Flow

    User->>UI: Clicks plan on pricing page
    UI->>API: POST /billing/checkout { planId }
    API->>API: Look up plan → providerPriceId
    API->>Paddle: Create checkout session (priceId, customerId)
    Paddle-->>API: Checkout URL
    API-->>UI: Checkout URL
    UI->>Paddle: Redirect to hosted checkout
    User->>Paddle: Completes payment
    Paddle-->>UI: Redirect to success URL

    Note over Paddle,API: Paddle fires webhook async

    Paddle->>API: POST /billing/webhook (subscription.created)
    API->>API: Verify signature, check idempotency
    API->>API: Insert billing_subscription (status: active)
    API-->>Paddle: 200 OK
```

## Subscription Lifecycle Webhooks

All subscription state changes originate from Paddle. Every event is logged to `billing_events` for idempotency and audit, then the subscription row is updated and the entitlement cache is invalidated.

```mermaid
sequenceDiagram
    participant Paddle as Paddle
    participant API as API Server
    participant DB as Database

    Note over Paddle,DB: Subscription Lifecycle Webhooks

    rect rgb(30, 30, 30)
    Note right of Paddle: Payment succeeds
    Paddle->>API: subscription.created / subscription.updated
    API->>API: Verify signature
    API->>DB: INSERT billing_event (idempotency check)
    API->>DB: UPSERT billing_subscription (status: active)
    API->>API: Invalidate entitlement cache
    API-->>Paddle: 200 OK
    end

    rect rgb(30, 30, 30)
    Note right of Paddle: Payment fails
    Paddle->>API: transaction.payment_failed
    API->>DB: INSERT billing_event
    API->>DB: UPDATE billing_subscription (status: past_due)
    API->>API: Invalidate entitlement cache
    API-->>Paddle: 200 OK
    end

    rect rgb(30, 30, 30)
    Note right of Paddle: User cancels
    Paddle->>API: subscription.canceled
    API->>DB: INSERT billing_event
    API->>DB: UPDATE billing_subscription (status: canceled)
    API->>API: Invalidate entitlement cache
    API-->>Paddle: 200 OK
    end
```

## Entitlement Check Flow

Entitlements are derived at query time via the join chain `account → subscription → plan → plan_entitlements`, cached in-process with a TTL, and invalidated on webhook events.

```mermaid
sequenceDiagram
    participant UI as Workspace App
    participant API as API Server
    participant DB as Database

    Note over UI,DB: Entitlement Check (on any feature-gated request)

    UI->>API: Any API request
    API->>API: Check entitlement cache
    alt Cache hit
        API->>API: Return cached entitlements
    else Cache miss
        API->>DB: SELECT entitlements JOIN plan_entitlements JOIN plans JOIN subscriptions WHERE accountId = ?
        DB-->>API: Plan entitlements for account
        API->>API: Cache result with TTL
    end
    alt Entitled
        API-->>UI: 200 OK (response)
    else Not entitled
        API-->>UI: 403 Forbidden
    end
```
