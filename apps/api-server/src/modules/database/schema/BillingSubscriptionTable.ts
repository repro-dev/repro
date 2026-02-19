import { GeneratedAlways } from 'kysely'

export interface BillingSubscriptionTable {
  id: GeneratedAlways<number>
  accountId: number
  providerSubscriptionId: string
  planId: number
  status: 'active' | 'past_due' | 'paused' | 'canceled' | 'trialing'
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: number
  canceledAt: Date | null
  createdAt: GeneratedAlways<Date>
  updatedAt: GeneratedAlways<Date>
}
