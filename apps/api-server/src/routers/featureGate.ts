import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { map } from 'fluture'
import z from 'zod'
import { defaultSystemConfig } from '~/config/system'
import { FeatureGateService } from '~/services/featureGate'
import { createResponseUtils } from '~/utils/response'

const listEnabledFeatureGatesResponseSchema = z.array(z.string())

export function createFeatureGateRouter(
  featureGateService: FeatureGateService,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    app.get<{
      Reply: z.infer<typeof listEnabledFeatureGatesResponseSchema>
    }>(
      '/enabled',
      {
        schema: {
          response: {
            200: listEnabledFeatureGatesResponseSchema,
          },
        },
      },
      (_, res) => {
        respondWith(
          res,
          featureGateService
            .listEnabledFeatureGates()
            .pipe(map(gates => gates.map(gate => gate.name)))
        )
      }
    )
  }
}
