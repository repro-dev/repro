import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { FeatureGateService } from '~/services/featureGate'

export function createFeatureGateRouter(
  featureGateService: FeatureGateService
): FastifyPluginAsync {
  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    // TODO: Add routes for feature gate operations
    // e.g., GET /feature-gates, POST /feature-gates, etc.

    // Placeholder to use the variables and avoid TypeScript errors
    void featureGateService
    void app
  }
}