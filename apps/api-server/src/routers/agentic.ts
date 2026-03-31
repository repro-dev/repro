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

    const toolCallSchema = z.object({
      id: z.string(),
      type: z.literal('function'),
      function: z.object({
        name: z.string(),
        arguments: z.string(),
      }),
    })

    const messageSchema = z.discriminatedUnion('role', [
      z.object({
        role: z.literal('system'),
        content: z.string(),
      }),
      z.object({
        role: z.literal('user'),
        content: z.string(),
      }),
      z.object({
        role: z.literal('assistant'),
        content: z.string(),
        tool_calls: z.array(toolCallSchema).optional(),
      }),
      z.object({
        role: z.literal('tool'),
        // Most tool results are plain strings; captureScreenshot sends an
        // array of vision content blocks (text + image_url).
        content: z.union([
          z.string(),
          z.array(
            z.union([
              z.object({ type: z.literal('text'), text: z.string() }),
              z.object({
                type: z.literal('image_url'),
                image_url: z.object({ url: z.string() }),
              }),
            ])
          ),
        ]),
        tool_call_id: z.string(),
      }),
    ])

    const toolSchema = z.object({
      type: z.literal('function'),
      function: z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.any().optional(),
      }),
    })

    const createResponseSchema = {
      body: z.object({
        messages: z.array(messageSchema),
        tools: z.array(toolSchema).optional(),
        tool_choice: z.string().optional(),
      }),
    }

    app.post<{ Body: z.infer<typeof createResponseSchema.body> }>(
      '/response',
      {
        schema: createResponseSchema,
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
        const { messages, tools, tool_choice } = req.body
        res.header('content-type', 'text/event-stream')
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUser()
            yield accountService.ensureUser(user)
            return yield agenticService
              .getStreamingResponse(messages, tools ?? [], tool_choice)
              .pipe(map(data => data.body))
          })
        )
      }
    )

    const feedbackSchema = {
      body: z.object({
        sentiment: z.enum(['positive', 'negative']),
        promptVersion: z.string().max(64).default(''),
        comment: z.string().max(1000).optional(),
        recordingId: z.string().optional(),
      }),
    }

    app.post<{ Body: z.infer<typeof feedbackSchema.body> }>(
      '/feedback',
      { schema: feedbackSchema },
      (req, res) => {
        const { sentiment, promptVersion, comment, recordingId } = req.body
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUser()
            yield accountService.ensureUser(user)
            yield agenticService.recordFeedback(
              user.id,
              sentiment,
              promptVersion,
              comment ?? null,
              recordingId ?? null
            )
            return null
          }),
          201
        )
      }
    )
  }
}
