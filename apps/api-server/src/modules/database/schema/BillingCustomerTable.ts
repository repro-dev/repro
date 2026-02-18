import { GeneratedAlways } from 'kysely'

export interface BillingCustomerTable {
  id: GeneratedAlways<number>
  accountId: number
  providerCustomerId: string
  createdAt: GeneratedAlways<Date>
}
