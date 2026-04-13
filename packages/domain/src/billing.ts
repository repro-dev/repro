export interface BillingEntitlement {
  feature: string
  enabled: boolean
  limit: number | null
}

export type EntitlementResponse = BillingEntitlement

export interface BillingPlanWithEntitlements {
  id: string
  name: string
  interval: 'month' | 'year'
  entitlements: BillingEntitlement[]
}

export interface CheckoutResponse {
  transactionId: string
}

export interface BillingSubscriptionResponse {
  id: string
  accountId: string
  planId: string
  status: 'active' | 'past_due' | 'paused' | 'canceled' | 'trialing'
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  createdAt: string
  updatedAt: string
  isSelfProvisioned: boolean
}

export interface PortalSessionResponse {
  url: string
}

export interface ChangePlanRequest {
  planId: string
}
