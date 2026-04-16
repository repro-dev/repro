import { FastifyPluginAsync } from 'fastify'
import { promise } from 'fluture'
import type { HealthService } from '~/services/health'

export function createHealthRouter(
  healthService: HealthService
): FastifyPluginAsync {
  return async function (fastify) {
    fastify.get('/', async (_, res) => {
      // Always return 200 so the response body (which includes per-subsystem
      // status) reaches the caller. The 'status' field in the body indicates
      // whether the system is healthy, degraded, or unhealthy.
      const result = await promise(healthService.checkDetailed())
      return res.send(result)
    })
  }
}
