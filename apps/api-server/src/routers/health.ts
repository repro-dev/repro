import { FastifyPluginAsync } from 'fastify'
import { promise } from 'fluture'
import type { HealthService } from '~/services/health'

export function createHealthRouter(
  healthService: HealthService
): FastifyPluginAsync {
  return async function (fastify) {
    fastify.get('/', async (_, res) => {
      const result = await promise(healthService.checkDetailed())
      if (result.status === 'unhealthy') {
        return res.status(503).send(result)
      }
      return res.send(result)
    })
  }
}
