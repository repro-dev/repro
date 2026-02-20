import { Account } from '@repro/domain'
import { tapF } from '@repro/future-utils'
import { parallel } from 'fluture'
import {
  BillingCustomer,
  BillingPlan,
  BillingSubscription,
  CheckoutResult,
} from '~/services/billing'
import { Fixture } from '../types'
import { AccountA, AccountB } from './account'

export const FreePlan: Fixture<BillingPlan> = {
  dependencies: [],
  load: ({ billingService }) =>
    billingService
      .createPlan({
        name: 'free',
        providerPriceId: 'pri_free_001',
        providerProductId: 'prod_free',
        interval: 'month',
      })
      .pipe(
        tapF(plan =>
          parallel(1)([
            billingService.createEntitlement(plan.id, 'recordings', true, 10),
            billingService.createEntitlement(plan.id, 'projects', true, 1),
          ])
        )
      ),
}

export const ProPlan: Fixture<BillingPlan> = {
  dependencies: [],
  load: ({ billingService }) =>
    billingService
      .createPlan({
        name: 'pro',
        providerPriceId: 'pri_pro_001',
        providerProductId: 'prod_pro',
        interval: 'month',
      })
      .pipe(
        tapF(plan =>
          parallel(1)([
            billingService.createEntitlement(plan.id, 'recordings', true, null),
            billingService.createEntitlement(plan.id, 'projects', true, null),
          ])
        )
      ),
}

export const CustomerA: Fixture<BillingCustomer> = {
  dependencies: [AccountA],
  load: ({ billingService }, account: Account) =>
    billingService.getOrCreateCustomer(
      account.id,
      'billing-a@repro.test'
    ),
}

export const CustomerB: Fixture<BillingCustomer> = {
  dependencies: [AccountB],
  load: ({ billingService }, account: Account) =>
    billingService.getOrCreateCustomer(
      account.id,
      'billing-b@repro.test'
    ),
}

export const AccountA_FreePlan_Checkout: Fixture<CheckoutResult> = {
  dependencies: [AccountA, FreePlan],
  load: ({ billingService }, account: Account, plan: BillingPlan) =>
    billingService.createCheckoutSession(
      account.id,
      'billing-a@repro.test',
      plan.id
    ),
}

export const AccountA_ProPlan_Checkout: Fixture<CheckoutResult> = {
  dependencies: [AccountA, ProPlan],
  load: ({ billingService }, account: Account, plan: BillingPlan) =>
    billingService.createCheckoutSession(
      account.id,
      'billing-a@repro.test',
      plan.id
    ),
}

export const AccountA_FreePlan_Subscription: Fixture<BillingSubscription> = {
  dependencies: [AccountA_FreePlan_Checkout, AccountA],
  load: ({ billingService }, _checkout: CheckoutResult, account: Account) =>
    billingService.getSubscriptionByAccountId(account.id),
}

export const AccountA_ProPlan_Subscription: Fixture<BillingSubscription> = {
  dependencies: [AccountA_ProPlan_Checkout, AccountA],
  load: ({ billingService }, _checkout: CheckoutResult, account: Account) =>
    billingService.getSubscriptionByAccountId(account.id),
}
