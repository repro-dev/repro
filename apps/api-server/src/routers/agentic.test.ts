import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { resolve } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Readable } from 'node:stream'
import { AgenticService } from '~/services/agentic'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { createAgenticRouter } from './agentic'

const stubAgenticService: AgenticService = {
  getStreamingResponse: () =>
    resolve({
      statusCode: 200,
      headers: {},
      trailers: {},
      opaque: null,
      context: null,
      body: Readable.from(['data: [DONE]\n\n']),
    } as never),
}

describe('Routers > Agentic', () => {
  let harness: Harness
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    app = harness.bootstrap(
      createAgenticRouter(stubAgenticService, harness.services.accountService)
    )
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('POST /response', () => {
    it('should return not-found when no session is active', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/response',
        body: {
          messages: [{ role: 'user', content: 'hello' }],
        },
      })

      expect(res.statusCode).toEqual(404)
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
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(200)
    })
  })
})
