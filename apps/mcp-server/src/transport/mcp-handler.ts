import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { FastifyPluginAsync } from 'fastify'
import { fork } from 'fluture'
import { AuthContext, createTokenValidator } from '~/auth/validateToken'

interface McpHandlerOptions {
  mcpServer: McpServer
  validateToken: ReturnType<typeof createTokenValidator>
}

async function authenticate(
  validateToken: ReturnType<typeof createTokenValidator>,
  authHeader: string | undefined
): Promise<AuthContext> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header')
  }
  const token = authHeader.slice(7)
  return new Promise<AuthContext>((resolveP, rejectP) => {
    fork((err: Error) => rejectP(err))((ctx: AuthContext) => resolveP(ctx))(
      validateToken(token)
    )
  })
}

const mcpHandler: FastifyPluginAsync<McpHandlerOptions> = async (
  fastify,
  opts
) => {
  fastify.get('/health', async () => ({ status: 'ok' }))

  fastify.post('/mcp', async (req, res) => {
    try {
      await authenticate(opts.validateToken, req.headers.authorization)
    } catch {
      res.status(401).send({ error: 'Unauthorized' })
      return
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    await opts.mcpServer.connect(transport)
    await transport.handleRequest(req.raw, res.raw, req.body)
  })

  fastify.get('/mcp', async (req, res) => {
    try {
      await authenticate(opts.validateToken, req.headers.authorization)
    } catch {
      res.status(401).send({ error: 'Unauthorized' })
      return
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    await opts.mcpServer.connect(transport)
    await transport.handleRequest(req.raw, res.raw)
  })

  fastify.delete('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    await opts.mcpServer.connect(transport)
    await transport.handleRequest(req.raw, res.raw)
  })
}

export default mcpHandler
