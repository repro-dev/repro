import { Account } from '@repro/domain'
import { tapF } from '@repro/future-utils'
import { chain, parallel } from 'fluture'
import { decodeId } from '~/modules/database'
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
        name: 'Free',
        providerPriceId: 'pri_free_001',
        providerProductId: 'prod_free',
        interval: 'month',
      })
      .pipe(
        tapF(plan =>
          parallel(1)([
            billingService.createEntitlement(plan.id, 'recordings', true, 10),
            billingService.createEntitlement(plan.id, 'seats', true, 1),
            billingService.createEntitlement(plan.id, 'ai_credits', false, null),
          ])
        )
      ),
}

export const ProPlan: Fixture<BillingPlan> = {
  dependencies: [],
  load: ({ billingService }) =>
    billingService
      .createPlan({
        name: 'Repro+',
        providerPriceId: 'pri_plus_001',
        providerProductId: 'prod_plus',
        interval: 'month',
      })
      .pipe(
        tapF(plan =>
          parallel(1)([
            billingService.createEntitlement(plan.id, 'recordings', true, null),
            billingService.createEntitlement(plan.id, 'seats', true, 5),
            billingService.createEntitlement(plan.id, 'ai_credits', true, 100),
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

export const AccountA_ProPlan_CanceledSubscription: Fixture<BillingSubscription> = {
  dependencies: [AccountA_ProPlan_Checkout, AccountA],
  load: ({ billingService }, _checkout: CheckoutResult, account: Account) =>
    billingService.getSubscriptionByAccountId(account.id).pipe(
      chain(subscription =>
        billingService
          .upsertSubscription({
            accountId: decodeId(subscription.accountId)!,
            providerSubscriptionId: subscription.providerSubscriptionId,
            planId: decodeId(subscription.planId)!,
            status: 'canceled',
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: false,
            canceledAt: new Date(),
          })
          .pipe(
            chain(() =>
              billingService.getSubscriptionByAccountId(account.id)
            )
          )
      )
    ),
}

export const AccountA_ProPlan_PastDueSubscription: Fixture<BillingSubscription> = {
  dependencies: [AccountA_ProPlan_Checkout, AccountA],
  load: ({ billingService }, _checkout: CheckoutResult, account: Account) =>
    billingService.getSubscriptionByAccountId(account.id).pipe(
      chain(subscription =>
        billingService
          .upsertSubscription({
            accountId: decodeId(subscription.accountId)!,
            providerSubscriptionId: subscription.providerSubscriptionId,
            planId: decodeId(subscription.planId)!,
            status: 'past_due',
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: false,
            canceledAt: null,
          })
          .pipe(
            chain(() =>
              billingService.getSubscriptionByAccountId(account.id)
            )
          )
      )
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
