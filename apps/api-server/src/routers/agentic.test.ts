import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { resolve } from 'fluture'
import { Readable } from 'node:stream'
import { after, before, beforeEach, describe, it } from 'node:test'
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
          [harness.env.SESSION_COOKIE]: session.sessionToken,
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
          [harness.env.SESSION_COOKIE]: session.sessionToken,
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
          [harness.env.SESSION_COOKIE]: session.sessionToken,
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
          [harness.env.SESSION_COOKIE]: session.sessionToken,
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
          [harness.env.SESSION_COOKIE]: session.sessionToken,
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
          [harness.env.SESSION_COOKIE]: session.sessionToken,
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
          [harness.env.SESSION_COOKIE]: session.sessionToken,
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
          [harness.env.SESSION_COOKIE]: session.sessionToken,
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
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(400)
    })
  })
})
