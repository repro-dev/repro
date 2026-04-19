import { FastifyPluginAsync } from 'fastify'
import { promise } from 'fluture'
import type { HealthService } from '~/services/health'
import { sanitizeHealthResult } from '~/services/health'

export function createHealthRouter(
  healthService: HealthService
): FastifyPluginAsync {
  return async function (fastify) {
    fastify.get('/', async (_, res) => {
      const result = sanitizeHealthResult(
        await promise(healthService.checkDetailed())
      )

      if (result.status === 'unhealthy') {
        res.status(503)
      }

      return res.send(result)
    })
  }
}
