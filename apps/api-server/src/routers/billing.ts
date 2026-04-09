import {
  BillingSubscriptionResponse,
  EntitlementResponse,
  PortalSessionResponse,
} from '@repro/domain'
import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { go, map } from 'fluture'
import z from 'zod'
import { defaultSystemConfig } from '~/config/system'
import { AccountService } from '~/services/account'
import {
  BillingEntitlement,
  BillingService,
  BillingSubscription,
  PortalSession,
} from '~/services/billing'
import { toListResponse } from '~/utils/listResponse'
import { createResponseUtils } from '~/utils/response'

const checkoutSchema = {
  body: z.object({
    planId: z.string(),
  }),
} as const

const changePlanSchema = {
  body: z.object({
    planId: z.string(),
  }),
} as const

function toSubscriptionResponse(
  sub: BillingSubscription
): BillingSubscriptionResponse {
  return {
    id: sub.id,
    accountId: sub.accountId,
    planId: sub.planId,
    status: sub.status,
    currentPeriodStart: sub.currentPeriodStart.toISOString(),
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    canceledAt: sub.canceledAt ? sub.canceledAt.toISOString() : null,
    createdAt: sub.createdAt.toISOString(),
    updatedAt: sub.updatedAt.toISOString(),
  }
}

function toEntitlementResponse(e: BillingEntitlement): EntitlementResponse {
  return {
    feature: e.feature,
    enabled: e.enabled,
    limit: e.limit,
  }
}

function toPortalSessionResponse(p: PortalSession): PortalSessionResponse {
  return {
    url: p.url,
  }
}

export function createBillingRouter(
  billingService: BillingService,
  accountService: AccountService,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    app.get('/plans', {}, (_, res) => {
      respondWith(
        res,
        billingService.listPlansWithEntitlements().pipe(map(toListResponse))
      )
    })

    app.post(
      '/checkout',
      {
        schema: checkoutSchema,
      },
      (req, res) => {
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUser()
            yield accountService.ensureUser(user)
            const account = yield accountService.getAccountForUser(user.id)
            const email: string = yield accountService.getUserEmailById(user.id)
            return yield billingService.createCheckoutSession(
              account.id,
              email,
              req.body.planId,
              user.name
            )
          }),
          201
        )
      }
    )

    app.get('/subscription', {}, (req, res) => {
      respondWith(
        res,
        go(function* () {
          const user = yield req.getCurrentUser()
          yield accountService.ensureUser(user)
          const account = yield accountService.getAccountForUser(user.id)
          const sub = yield billingService.getSubscriptionByAccountId(
            account.id
          )
          return toSubscriptionResponse(sub)
        })
      )
    })

    app.get('/entitlements', {}, (req, res) => {
      respondWith(
        res,
        go(function* () {
          const user = yield req.getCurrentUser()
          yield accountService.ensureUser(user)
          const account = yield accountService.getAccountForUser(user.id)
          const entitlements = yield billingService.getEntitlements(account.id)
          return toListResponse(entitlements.map(toEntitlementResponse))
        })
      )
    })

    app.post(
      '/change-plan',
      {
        schema: changePlanSchema,
      },
      (req, res) => {
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUser()
            yield accountService.ensureUser(user)
            const account = yield accountService.getAccountForUser(user.id)
            const sub = yield billingService.changePlan(
              account.id,
              req.body.planId
            )
            return toSubscriptionResponse(sub)
          })
        )
      }
    )

    app.post('/cancel', {}, (req, res) => {
      respondWith(
        res,
        go(function* () {
          const user = yield req.getCurrentUser()
          yield accountService.ensureUser(user)
          const account = yield accountService.getAccountForUser(user.id)
          const sub = yield billingService.cancelSubscription(account.id)
          return toSubscriptionResponse(sub)
        })
      )
    })

    app.post('/portal', {}, (req, res) => {
      respondWith(
        res,
        go(function* () {
          const user = yield req.getCurrentUser()
          yield accountService.ensureUser(user)
          const account = yield accountService.getAccountForUser(user.id)
          const portal = yield billingService.getPortalLink(account.id)
          return toPortalSessionResponse(portal)
        })
      )
    })
  }
}
