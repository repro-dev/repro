import compress from '@fastify/compress'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import expect from 'expect'
import fastify, { FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { after, before, describe, it } from 'node:test'
import { createEnv } from '~/config/createEnv'
import { buildRateLimitOptions } from '~/rateLimit'

// Minimal test app factory with rate limiting configured.
// Must be async because `await app.register(rateLimit, ...)` is required for
// global:true to apply to routes added in the same scope — without await, the
// plugin's onRoute hook isn't installed before routes are added.
async function buildApp(options: {
  unauthenticatedRpm?: number
  authenticatedRpm?: number
  uploadRpm?: number
  sessionSubjectId?: string | null
}): Promise<FastifyInstance> {
  const {
    unauthenticatedRpm = 3,
    authenticatedRpm = 6,
    uploadRpm = 2,
    sessionSubjectId = null,
  } = options

  const app = fastify()

  app.addContentTypeParser('*', async () => {})
  app.register(cors)
  app.register(compress)

  // Must await so the plugin's onRoute hook is installed before routes are added.
  // Without await, global:true doesn't apply to routes on this same app instance.
  await app.register(
    rateLimit,
    buildRateLimitOptions({
      unauthenticatedRpm,
      authenticatedRpm,
      uploadRpm,
    })
  )

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Mock session decorator
  app.decorateRequest('session', null)
  app.addHook('onRequest', async function (req) {
    if (sessionSubjectId != null) {
      // @ts-expect-error — mock session
      req.session = { subjectId: sessionSubjectId, id: 'test-session-id' }
    }
  })

  // Health endpoint — should be excluded from rate limiting
  app.get('/health', async (_req, res) => {
    res.status(200).send({ ok: true })
  })

  // Metrics endpoint — should be excluded from rate limiting
  app.get('/metrics', async (_req, res) => {
    res.status(200).send({ ok: true })
  })

  // Normal endpoint
  app.get('/api/data', async (_req, res) => {
    res.status(200).send({ data: 'ok' })
  })

  // Upload endpoint with stricter rate limit
  app.put('/projects/:projectId/recordings/:recordingId/data', {
    config: {
      rateLimit: {
        max: uploadRpm,
        timeWindow: '1 minute',
        keyGenerator: req => {
          const session = (req as any).session
          return session?.subjectId
            ? `upload:workspace:${session.subjectId}`
            : `upload:ip:${req.ip}`
        },
      },
    },
    handler: async (_req, res) => {
      res.status(200).send({ ok: true })
    },
  })

  return app
}

describe('Rate limiting', () => {
  describe('createEnv rate limit env vars', () => {
    it('should have RATE_LIMIT_UNAUTHENTICATED_RPM defaulting to 60', () => {
      const env = createEnv({})
      expect(env.RATE_LIMIT_UNAUTHENTICATED_RPM).toEqual(60)
    })

    it('should have RATE_LIMIT_AUTHENTICATED_RPM defaulting to 600', () => {
      const env = createEnv({})
      expect(env.RATE_LIMIT_AUTHENTICATED_RPM).toEqual(600)
    })

    it('should have RATE_LIMIT_UPLOAD_RPM defaulting to 20', () => {
      const env = createEnv({})
      expect(env.RATE_LIMIT_UPLOAD_RPM).toEqual(20)
    })

    it('should accept RATE_LIMIT_REDIS_URL as optional string', () => {
      const env = createEnv({ RATE_LIMIT_REDIS_URL: 'redis://localhost:6379' })
      expect(env.RATE_LIMIT_REDIS_URL).toEqual('redis://localhost:6379')
    })

    it('should accept missing RATE_LIMIT_REDIS_URL (in-memory fallback)', () => {
      const env = createEnv({})
      expect(env.RATE_LIMIT_REDIS_URL).toBeUndefined()
    })

    it('should parse RATE_LIMIT_UNAUTHENTICATED_RPM from string', () => {
      const env = createEnv({ RATE_LIMIT_UNAUTHENTICATED_RPM: '120' })
      expect(env.RATE_LIMIT_UNAUTHENTICATED_RPM).toEqual(120)
    })
  })

  describe('unauthenticated rate limiting (per-IP)', () => {
    let app: FastifyInstance

    before(async () => {
      app = await buildApp({ unauthenticatedRpm: 3, sessionSubjectId: null })
      await app.ready()
    })

    after(async () => {
      await app.close()
    })

    it('should allow requests under the limit', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: 'GET',
          url: '/api/data',
          remoteAddress: '1.2.3.4',
        })
        expect(res.statusCode).toEqual(200)
      }
    })

    it('should return 429 when limit is exceeded', async () => {
      // Exhaust the limit for a new IP
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'GET',
          url: '/api/data',
          remoteAddress: '5.6.7.8',
        })
      }

      const res = await app.inject({
        method: 'GET',
        url: '/api/data',
        remoteAddress: '5.6.7.8',
      })
      expect(res.statusCode).toEqual(429)
    })

    it('should include Retry-After header on 429 response', async () => {
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'GET',
          url: '/api/data',
          remoteAddress: '9.10.11.12',
        })
      }

      const res = await app.inject({
        method: 'GET',
        url: '/api/data',
        remoteAddress: '9.10.11.12',
      })
      expect(res.statusCode).toEqual(429)
      expect(res.headers['retry-after']).toBeDefined()
    })

    it('should return JSON body with error and retryAfter on 429', async () => {
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'GET',
          url: '/api/data',
          remoteAddress: '20.21.22.23',
        })
      }

      const res = await app.inject({
        method: 'GET',
        url: '/api/data',
        remoteAddress: '20.21.22.23',
      })
      expect(res.statusCode).toEqual(429)
      const body = JSON.parse(res.body)
      expect(body.error).toEqual('rate_limit_exceeded')
      expect(typeof body.retryAfter).toEqual('number')
      // retryAfter must be in seconds (not milliseconds): a 1-minute window
      // yields at most 60 seconds remaining, never thousands.
      expect(body.retryAfter).toBeLessThanOrEqual(60)
    })

    it('should NOT rate limit /health endpoint', async () => {
      // Exhaust limit for a new IP
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'GET',
          url: '/api/data',
          remoteAddress: '30.31.32.33',
        })
      }
      // Verify we're rate limited on /api/data
      const limited = await app.inject({
        method: 'GET',
        url: '/api/data',
        remoteAddress: '30.31.32.33',
      })
      expect(limited.statusCode).toEqual(429)

      // /health should still pass
      const healthRes = await app.inject({
        method: 'GET',
        url: '/health',
        remoteAddress: '30.31.32.33',
      })
      expect(healthRes.statusCode).toEqual(200)
    })

    it('should NOT rate limit /metrics endpoint', async () => {
      // Exhaust limit for a new IP
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'GET',
          url: '/api/data',
          remoteAddress: '40.41.42.43',
        })
      }
      const metricsRes = await app.inject({
        method: 'GET',
        url: '/metrics',
        remoteAddress: '40.41.42.43',
      })
      expect(metricsRes.statusCode).toEqual(200)
    })
  })

  describe('authenticated rate limiting (per-workspace)', () => {
    let app: FastifyInstance

    before(async () => {
      app = await buildApp({
        authenticatedRpm: 6,
        sessionSubjectId: 'user-abc-123',
      })
      await app.ready()
    })

    after(async () => {
      await app.close()
    })

    it('should use workspace-level key (subjectId) for authenticated requests', async () => {
      // Make 6 requests — should all succeed
      for (let i = 0; i < 6; i++) {
        const res = await app.inject({
          method: 'GET',
          url: '/api/data',
          remoteAddress: `1.1.1.${i + 1}`, // different IPs, same workspace
        })
        expect(res.statusCode).toEqual(200)
      }

      // 7th request should be rate limited
      const res = await app.inject({
        method: 'GET',
        url: '/api/data',
        remoteAddress: '1.1.1.99',
      })
      expect(res.statusCode).toEqual(429)
    })
  })

  describe('upload endpoint rate limiting', () => {
    let app: FastifyInstance

    before(async () => {
      app = await buildApp({
        uploadRpm: 2,
        authenticatedRpm: 100, // high enough not to interfere
        sessionSubjectId: 'user-upload-test',
      })
      await app.ready()
    })

    after(async () => {
      await app.close()
    })

    it('should apply upload rate limit to recording data PUT endpoint', async () => {
      // First 2 requests should succeed
      for (let i = 0; i < 2; i++) {
        const res = await app.inject({
          method: 'PUT',
          url: '/projects/proj-1/recordings/rec-1/data',
          remoteAddress: '50.51.52.53',
        })
        expect(res.statusCode).toEqual(200)
      }

      // 3rd should be rate limited
      const res = await app.inject({
        method: 'PUT',
        url: '/projects/proj-1/recordings/rec-1/data',
        remoteAddress: '50.51.52.53',
      })
      expect(res.statusCode).toEqual(429)
    })
  })
})
