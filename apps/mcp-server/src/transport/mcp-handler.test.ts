import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import Fastify from 'fastify'
import { reject, resolve } from 'fluture'
import { createTokenValidator } from '~/auth/validateToken'

mock.module('@modelcontextprotocol/sdk/server/streamableHttp.js', {
  namedExports: {
    StreamableHTTPServerTransport: class {
      async handleRequest(_req: unknown, res: unknown) {
        const r = res as { end: (s: string) => void }
        r.end('mocked')
      }
    },
  },
})

function makeValidateToken(
  result: 'ok' | 'fail'
): ReturnType<typeof createTokenValidator> {
  return (_token: string) => {
    if (result === 'ok') {
      return resolve({ userId: 1, token: 'valid' })
    }
    return reject(new Error('Invalid or revoked API key'))
  }
}

async function buildApp(validateToken: ReturnType<typeof createTokenValidator>) {
  const { default: mcpHandler } = await import('~/transport/mcp-handler')
  const mcpServer = { connect: mock.fn(async () => {}) }
  const app = Fastify({ logger: false })
  await app.register(mcpHandler, {
    mcpServer: mcpServer as never,
    validateToken,
  })
  await app.ready()
  return app
}

describe('mcp-handler', () => {
  describe('GET /health', () => {
    it('returns 200 with { status: ok }', async () => {
      const app = await buildApp(makeValidateToken('ok'))
      const res = await app.inject({ method: 'GET', url: '/health' })
      assert.equal(res.statusCode, 200)
      assert.deepEqual(res.json(), { status: 'ok' })
      await app.close()
    })
  })

  describe('POST /mcp', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const app = await buildApp(makeValidateToken('fail'))
      const res = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { 'content-type': 'application/json' },
        payload: '{}',
      })
      assert.equal(res.statusCode, 401)
      assert.deepEqual(res.json(), { error: 'Unauthorized' })
      await app.close()
    })

    it('returns 401 when Authorization header has wrong scheme', async () => {
      const app = await buildApp(makeValidateToken('ok'))
      const res = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          authorization: 'Basic dXNlcjpwYXNz',
        },
        payload: '{}',
      })
      assert.equal(res.statusCode, 401)
      assert.deepEqual(res.json(), { error: 'Unauthorized' })
      await app.close()
    })

    it('returns 401 when token validation fails', async () => {
      const app = await buildApp(makeValidateToken('fail'))
      const res = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer bad-token',
        },
        payload: '{}',
      })
      assert.equal(res.statusCode, 401)
      assert.deepEqual(res.json(), { error: 'Unauthorized' })
      await app.close()
    })
  })

  describe('GET /mcp', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const app = await buildApp(makeValidateToken('ok'))
      const res = await app.inject({
        method: 'GET',
        url: '/mcp',
        headers: {},
      })
      assert.equal(res.statusCode, 401)
      await app.close()
    })

    it('returns 401 when token validation fails', async () => {
      const app = await buildApp(makeValidateToken('fail'))
      const res = await app.inject({
        method: 'GET',
        url: '/mcp',
        headers: { authorization: 'Bearer bad-token' },
      })
      assert.equal(res.statusCode, 401)
      await app.close()
    })
  })
})
