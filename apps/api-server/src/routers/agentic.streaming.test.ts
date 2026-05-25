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
      body: Readable.from(['data: {"ok":true}\n\n', 'data: [DONE]\n\n']),
    } as never),
  recordFeedback: () => resolve(undefined),
}

describe('Routers > Agentic streaming', () => {
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

  it('forwards authenticated SSE response bodies unchanged', async () => {
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
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.body).toEqual('data: {"ok":true}\n\ndata: [DONE]\n\n')
  })
})
