import { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { go, map } from 'fluture'
import z from 'zod'
import { defaultSystemConfig } from '~/config/system'
import { AccountService } from '~/services/account'
import { AgenticService } from '~/services/agentic'
import { createResponseUtils } from '~/utils/response'

export function createAgenticRouter(
  agenticService: AgenticService,
  accountService: AccountService,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    const createResponseSchema = {
      body: z.object({
        messages: z.array(
          z.object({
            role: z.enum(['system', 'user', 'assistant']),
            content: z.string(),
          })
        ),
        tools: z
          .array(
            z.object({
              type: z.literal('function'),
              name: z.string(),
              description: z.string(),
              parameters: z.any(),
            })
          )
          .optional(),
      }),
    }

    app.post<{ Body: z.infer<typeof createResponseSchema.body> }>(
      '/response',
      {
        config: {
          rateLimit: {
            max: 30,
            timeWindow: '1 minute',
            keyGenerator: (req: FastifyRequest) =>
              req.session?.subjectId ?? req.ip,
          },
        },
      },
      (req, res) => {
        const { messages, tools } = req.body
        res.header('content-type', 'text/event-stream')
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUser()
            yield accountService.ensureUser(user)
            return yield agenticService
              .getStreamingResponse(messages, tools ?? [])
              .pipe(map(data => data.body))
          })
        )
      }
    )
  }
}
