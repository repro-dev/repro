import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { go } from 'fluture'
import z from 'zod'
import { defaultSystemConfig } from '~/config/system'
import { AccountService } from '~/services/account'
import { BillingService } from '~/services/billing'
import { createResponseUtils } from '~/utils/response'

const checkoutSchema = {
  body: z.object({
    planId: z.string(),
  }),
} as const

export function createBillingRouter(
  billingService: BillingService,
  accountService: AccountService,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    app.get('/plans', {}, (_, res) => {
      respondWith(res, billingService.listPlansWithEntitlements())
    })

    app.post<{
      Body: z.infer<typeof checkoutSchema.body>
    }>(
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
  }
}
