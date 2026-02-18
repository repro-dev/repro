import { GeneratedAlways } from 'kysely'

export interface BillingEventTable {
  id: GeneratedAlways<number>
  providerEventId: string
  eventType: string
  payload: string
  status: 'pending' | 'success' | 'failed'
  error: string | null
  createdAt: GeneratedAlways<Date>
  processedAt: Date | null
}
