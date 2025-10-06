import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { go, map } from 'fluture'
import z from 'zod'
import { defaultSystemConfig } from '~/config/system'
import { AccountService } from '~/services/account'
import { FeatureGateService } from '~/services/featureGate'
import { createResponseUtils } from '~/utils/response'

const createFeatureGateSchema = {
  body: z.object({
    name: z.string(),
    description: z.string(),
  }),
} as const

const updateFeatureGateSchema = {
  body: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
  }),
  params: z.object({
    id: z.string(),
  }),
} as const

const deleteFeatureGateSchema = {
  params: z.object({
    id: z.string(),
  }),
} as const

export function createFeatureGateRouter(
  featureGateService: FeatureGateService,
  accountService: AccountService,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    app.get('/enabled', (_, res) => {
      respondWith(
        res,
        featureGateService
          .listEnabledFeatureGates()
          .pipe(map(gates => gates.map(gate => gate.name)))
      )
    })

    app.get('/', (_, res) => {
      respondWith(res, featureGateService.listFeatureGates())
    })

    app.post<{
      Body: z.infer<typeof createFeatureGateSchema.body>
    }>(
      '/',
      {
        schema: {
          body: createFeatureGateSchema.body,
        },
      },
      (req, res) => {
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUser()
            yield accountService.ensureStaffUser(user)
            return yield featureGateService.createFeatureGate(
              req.body.name,
              req.body.description
            )
          }),
          201
        )
      }
    )

    app.patch<{
      Body: z.infer<typeof updateFeatureGateSchema.body>
      Params: z.infer<typeof updateFeatureGateSchema.params>
    }>(
      '/:id',
      {
        schema: {
          body: updateFeatureGateSchema.body,
          params: updateFeatureGateSchema.params,
        },
      },
      (req, res) => {
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUser()
            yield accountService.ensureStaffUser(user)
            return yield featureGateService.updateFeatureGate(
              req.params.id,
              req.body
            )
          })
        )
      }
    )

    app.delete<{
      Params: z.infer<typeof deleteFeatureGateSchema.params>
    }>(
      '/:id',
      {
        schema: {
          params: deleteFeatureGateSchema.params,
        },
      },
      (req, res) => {
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUser()
            yield accountService.ensureStaffUser(user)
            yield featureGateService.removeFeatureGate(req.params.id)
          }),
          204
        )
      }
    )
  }
}
