export interface BillingEntitlement {
  feature: string
  enabled: boolean
  limit: number | null
}

export interface BillingPlanWithEntitlements {
  id: string
  name: string
  interval: 'month' | 'year'
  entitlements: Array<BillingEntitlement>
}

export interface ListPlansResponse {
  plans: Array<BillingPlanWithEntitlements>
}

export interface CheckoutResponse {
  transactionId: string
}
