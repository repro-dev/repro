import { FastifyPluginAsync } from 'fastify'
import { SystemConfig, defaultSystemConfig } from '~/config/system'
import type { HealthService } from '~/services/health'
import { createResponseUtils } from '~/utils/response'

export function createHealthRouter(
  healthService: HealthService,
  config: SystemConfig = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    fastify.get('/', (_, res) => {
      respondWith(res, healthService.check())
    })
  }
}
