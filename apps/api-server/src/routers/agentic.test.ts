import compress from '@fastify/compress'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import expect from 'expect'
import fastify, { FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { reject, resolve } from 'fluture'
import { Readable } from 'node:stream'
import { after, before, beforeEach, describe, it } from 'node:test'
import { buildRateLimitOptions } from '~/rateLimit'
import { AgenticService } from '~/services/agentic'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { permissionDenied } from '~/utils/errors'
import { createAgenticRouter } from './agentic'

const stubAgenticService: AgenticService = {
  getStreamingResponse: () => resolve(Readable.from(['data: [DONE]\n\n'])),
  logToolResult: () => undefined,
  logNodeIdValidity: () => undefined,
  recordFeedback: () => resolve(undefined),
}

describe('Routers > Agentic', () => {
  let harness: Harness
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    app = harness.bootstrap(
      createAgenticRouter(stubAgenticService, harness.services.accountService)
    )
    await app.ready()
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('POST /response', () => {
    it('should return not-authenticated when no session is active', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/response',
        body: {
          messages: [{ role: 'user', content: 'hello' }],
        },
      })

      expect(res.statusCode).toEqual(401)
    })

    it('should return 200 for an authenticated request', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/response',
        body: {
          messages: [{ role: 'user', content: 'hello' }],
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
        },
      })

      expect(res.statusCode).toEqual(200)
    })

    it('accepts tool role messages with tool_call_id', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/response',
        body: {
          messages: [
            { role: 'user', content: 'hello' },
            {
              role: 'tool',
              content: '{"result": 42}',
              tool_call_id: 'call-123',
            },
          ],
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
        },
      })

      expect(res.statusCode).toEqual(200)
    })

    it('accepts assistant messages with tool_calls', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/response',
        body: {
          messages: [
            {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call-abc',
                  type: 'function',
                  function: { name: 'myTool', arguments: '{}' },
                },
              ],
            },
          ],
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
        },
      })

      expect(res.statusCode).toEqual(200)
    })

    it('accepts assistant messages without tool_calls', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/response',
        body: {
          messages: [{ role: 'assistant', content: 'I can help with that.' }],
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
        },
      })

      expect(res.statusCode).toEqual(200)
    })

    it('accepts system messages', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/response',
        body: {
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'hello' },
          ],
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
        },
      })

      expect(res.statusCode).toEqual(200)
    })

    it('accepts tools array with function definitions', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/response',
        body: {
          messages: [{ role: 'user', content: 'hello' }],
          tools: [
            {
              type: 'function',
              function: {
                name: 'myTool',
                description: 'Does something useful',
                parameters: {
                  type: 'object',
                  properties: {},
                },
              },
            },
          ],
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
        },
      })

      expect(res.statusCode).toEqual(200)
    })

    it('rejects request with missing messages field', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/response',
        body: {},
        cookies: {
          [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
        },
      })

      expect(res.statusCode).toEqual(400)
    })

    it('rejects message with unknown role', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/response',
        body: {
          messages: [{ role: 'unknown', content: 'hello' }],
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
        },
      })

      expect(res.statusCode).toEqual(400)
    })

    it('rejects tool message without tool_call_id', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/response',
        body: {
          messages: [{ role: 'tool', content: '{"result": 1}' }],
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
        },
      })

      expect(res.statusCode).toEqual(400)
    })
  })
})

// ---------------------------------------------------------------------------
// Rate-limit tests for the agentic router.
//
// These tests build a standalone Fastify app (like rateLimit.test.ts) because
// the shared test harness's fromRouter() does not register @fastify/rate-limit.
// ---------------------------------------------------------------------------

async function buildAgenticRateLimitApp(options: {
  agenticRateLimitPerHour?: number
  agenticMaxMessagesPerRecording?: number
  sessionSubjectId?: string | null
  allowUser?: boolean
}) {
  const {
    agenticRateLimitPerHour = 60,
    agenticMaxMessagesPerRecording = 200,
    sessionSubjectId = 'test-user-id',
    allowUser = true,
  } = options

  const app = fastify()
  app.addContentTypeParser('*', async () => {})
  app.register(cors)
  app.register(compress)

  // Must await so the plugin's onRoute hook is installed before routes are added.
  await app.register(
    rateLimit,
    buildRateLimitOptions({
      unauthenticatedRpm: 1000,
      authenticatedRpm: 1000,
      uploadRpm: 1000,
    })
  )

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Mock session decorator so rate-limit keyGenerator can read session.subjectId.
  app.decorateRequest('session', null)
  app.addHook('onRequest', async function (req) {
    if (sessionSubjectId != null) {
      // @ts-expect-error — mock session
      req.session = { subjectId: sessionSubjectId, id: 'test-session-id' }
    }
  })

  // Mock getCurrentUser so the route handler can reach ensureUser.
  app.decorateRequest('getCurrentUser', function () {
    return resolve({ id: 'user-1' }) as never
  })

  await app.register(
    createAgenticRouter(
      stubAgenticService,
      {
        ensureUser: () =>
          allowUser ? resolve(undefined) : reject(permissionDenied()),
      } as never,
      undefined,
      {
        agenticRateLimitPerHour,
        agenticMaxMessagesPerRecording,
      }
    )
  )

  return app
}

describe('Agentic rate limiting', () => {
  describe('per-user hourly rate limit', () => {
    async function buildReadyHourlyLimitApp(sessionSubjectId: string) {
      const app = await buildAgenticRateLimitApp({
        agenticRateLimitPerHour: 2,
        sessionSubjectId,
      })
      await app.ready()

      return app
    }

    it('returns 429 when hourly limit is exceeded', async () => {
      const app = await buildReadyHourlyLimitApp('hourly-limit-exceeded-user')

      try {
        const body = { messages: [{ role: 'user', content: 'hello' }] }

        for (let i = 0; i < 2; i++) {
          const res = await app.inject({
            method: 'POST',
            url: '/response',
            body,
          })
          expect(res.statusCode).toEqual(200)
        }

        const res = await app.inject({ method: 'POST', url: '/response', body })
        expect(res.statusCode).toEqual(429)
      } finally {
        await app.close()
      }
    })

    it('returns error body with rate_limit_exceeded and retryAfter', async () => {
      const app = await buildReadyHourlyLimitApp('rate-limit-error-body-user')

      try {
        const body = { messages: [{ role: 'user', content: 'hello' }] }

        for (let i = 0; i < 2; i++) {
          const res = await app.inject({
            method: 'POST',
            url: '/response',
            body,
          })
          expect(res.statusCode).toEqual(200)
        }

        const res = await app.inject({ method: 'POST', url: '/response', body })
        expect(res.statusCode).toEqual(429)
        const parsed = JSON.parse(res.body)
        expect(parsed.error).toEqual('rate_limit_exceeded')
        expect(typeof parsed.retryAfter).toEqual('number')
      } finally {
        await app.close()
      }
    })

    it('includes x-ratelimit-limit and x-ratelimit-remaining headers', async () => {
      const app = await buildAgenticRateLimitApp({
        agenticRateLimitPerHour: 10,
        sessionSubjectId: 'rate-limit-headers-user',
      })
      await app.ready()

      try {
        const res = await app.inject({
          method: 'POST',
          url: '/response',
          body: { messages: [{ role: 'user', content: 'hello' }] },
        })

        expect(res.statusCode).toEqual(200)
        expect(res.headers['x-ratelimit-limit']).toBeDefined()
        expect(res.headers['x-ratelimit-remaining']).toBeDefined()
        expect(res.headers['x-ratelimit-reset']).toBeDefined()
      } finally {
        await app.close()
      }
    })
  })

  describe('per-recording message cap', () => {
    let app: FastifyInstance

    before(async () => {
      // Use a low cap (2) so we can trigger it with 3 requests.
      app = await buildAgenticRateLimitApp({
        agenticMaxMessagesPerRecording: 2,
        agenticRateLimitPerHour: 1000,
      })
      await app.ready()
    })

    after(async () => {
      await app.close()
    })

    it('returns 429 when per-recording message cap is exceeded', async () => {
      const recordingId = 'test-recording-cap'
      const body = {
        messages: [{ role: 'user', content: 'hello' }],
        recordingId,
      }

      // Use up the cap (2 messages).
      for (let i = 0; i < 2; i++) {
        const res = await app.inject({ method: 'POST', url: '/response', body })
        expect(res.statusCode).toEqual(200)
      }

      // 3rd message should be blocked.
      const res = await app.inject({ method: 'POST', url: '/response', body })
      expect(res.statusCode).toEqual(429)
    })

    it('returns error body with rate_limit_exceeded and retryAfter 0', async () => {
      const recordingId = 'test-recording-cap-body'
      const body = {
        messages: [{ role: 'user', content: 'hello' }],
        recordingId,
      }

      // Exhaust the cap.
      for (let i = 0; i < 2; i++) {
        await app.inject({ method: 'POST', url: '/response', body })
      }

      const res = await app.inject({ method: 'POST', url: '/response', body })
      expect(res.statusCode).toEqual(429)
      const parsed = JSON.parse(res.body)
      expect(parsed.error).toEqual('rate_limit_exceeded')
      expect(parsed.retryAfter).toEqual(0)
    })

    it('does not count requests that fail auth toward the recording cap', async () => {
      const deniedApp = await buildAgenticRateLimitApp({
        agenticMaxMessagesPerRecording: 2,
        agenticRateLimitPerHour: 1000,
        allowUser: false,
      })
      await deniedApp.ready()

      try {
        const body = {
          messages: [{ role: 'user', content: 'hello' }],
          recordingId: 'test-recording-auth-failure',
        }

        for (let i = 0; i < 3; i++) {
          const res = await deniedApp.inject({
            method: 'POST',
            url: '/response',
            body,
          })

          expect(res.statusCode).toEqual(403)
        }
      } finally {
        await deniedApp.close()
      }
    })

    it('does not enforce cap when no recordingId is provided', async () => {
      const body = { messages: [{ role: 'user', content: 'hello' }] }

      for (let i = 0; i < 5; i++) {
        const res = await app.inject({ method: 'POST', url: '/response', body })
        expect(res.statusCode).toEqual(200)
      }
    })
  })
})
