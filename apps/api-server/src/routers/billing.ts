import {
  BillingSubscriptionResponse,
  EntitlementResponse,
  PortalSessionResponse,
} from '@repro/domain'
import { FastifyPluginAsync } from 'fastify'
import { go, map } from 'fluture'
import z from 'zod'
import { Env } from '~/config/createEnv'
import { defaultEnv } from '~/config/env'
import { defaultSystemConfig } from '~/config/system'
import { AccountService } from '~/services/account'
import {
  BillingEntitlement,
  BillingService,
  BillingSubscription,
  PortalSession,
} from '~/services/billing'
import { createFeatureGateMiddleware } from '~/services/featureGate'
import { toListResponse } from '~/utils/listResponse'
import { getCurrentUserAccount } from '~/utils/request'
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

type PlanIdBody = {
  planId: string
}

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
    isSelfProvisioned: sub.isSelfProvisioned,
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
  env: Env = defaultEnv,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)
  const requireFeature = createFeatureGateMiddleware(
    billingService,
    accountService,
    env,
    config
  )

  return async function (fastify) {
    const app = fastify

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
            const body = req.body as PlanIdBody
            const { user, account } = yield getCurrentUserAccount(
              req,
              accountService
            )
            const email: string = yield accountService.getUserEmailById(user.id)
            return yield billingService.createCheckoutSession(
              account.id,
              email,
              body.planId,
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
          const { account } = yield getCurrentUserAccount(req, accountService)
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
          const { account } = yield getCurrentUserAccount(req, accountService)
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
            const body = req.body as PlanIdBody
            const { account } = yield getCurrentUserAccount(req, accountService)
            const sub = yield billingService.changePlan(account.id, body.planId)
            return toSubscriptionResponse(sub)
          })
        )
      }
    )

    app.post('/cancel', {}, (req, res) => {
      respondWith(
        res,
        go(function* () {
          const { account } = yield getCurrentUserAccount(req, accountService)
          const sub = yield billingService.cancelSubscription(account.id)
          return toSubscriptionResponse(sub)
        })
      )
    })

    app.post('/portal', {}, (req, res) => {
      respondWith(
        res,
        go(function* () {
          const { account } = yield getCurrentUserAccount(req, accountService)
          const portal = yield billingService.getPortalLink(account.id)
          return toPortalSessionResponse(portal)
        })
      )
    })

    // Reference gated endpoint: demonstrates feature gate middleware usage.
    // Gated on 'ai_credits' — enabled on ProPlan, disabled on FreePlan, so
    // this endpoint produces a 403 for FreePlan subscribers when billing is
    // not stubbed. Use as the canonical test case for entitlement enforcement.
    app.get(
      '/plan-summary',
      { preHandler: requireFeature('ai_credits') },
      (req, res) => {
        respondWith(
          res,
          go(function* () {
            const { account } = yield getCurrentUserAccount(req, accountService)
            const entitlements = yield billingService.getEntitlements(
              account.id
            )
            return toListResponse(entitlements.map(toEntitlementResponse))
          })
        )
      }
    )
  }
}
