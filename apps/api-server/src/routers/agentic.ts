import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { map } from 'fluture'
import z from 'zod'
import { defaultSystemConfig } from '~/config/system'
import { AccountService } from '~/services/account'
import { AgenticService } from '~/services/agentic'
import { createResponseUtils } from '~/utils/response'

export function createAgenticRouter(
  agenticService: AgenticService,
  _accountService: AccountService,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    const createResponseSchema = {
      body: z.object({
        messages: z.array(
          z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string(),
          })
        ),
      }),
    }

    app.post<{ Body: z.infer<typeof createResponseSchema.body> }>(
      '/response',
      (req, res) => {
        const { messages } = req.body
        respondWith(
          res,
          agenticService
            .getStreamingResponse(messages)
            .pipe(map(data => data.body))
        )
      }
    )
  }
}
