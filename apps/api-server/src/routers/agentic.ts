import { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { go, map } from 'fluture'
import z from 'zod'
import { defaultSystemConfig } from '~/config/system'
import { agenticMessageRateLimitOptions } from '~/rateLimit'
import { AccountService } from '~/services/account'
import { AgenticService } from '~/services/agentic'
import { createResponseUtils } from '~/utils/response'

export function createAgenticRouter(
  agenticService: AgenticService,
  accountService: AccountService,
  config = defaultSystemConfig,
  {
    agenticRateLimitPerHour = 60,
    agenticMaxMessagesPerRecording = 200,
  }: {
    agenticRateLimitPerHour?: number
    agenticMaxMessagesPerRecording?: number
  } = {}
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  // In-memory per-recording message counter. Resets on server restart.
  // Intentional: acceptable for MVP with a single API server instance.
  const recordingMessageCounts = new Map<string, number>()

  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    // SSE concurrent connection limit (max 10 per user) is deferred pending
    // the SSE endpoint being built. See REP-752 for the requirement.

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
        recordingId: z.string().optional(),
      }),
    }

    app.post(
      '/response',
      {
        schema: createResponseSchema,
        config: {
          rateLimit: agenticMessageRateLimitOptions(agenticRateLimitPerHour),
        },
      },
      (req, res) => {
        const { messages, tools, tool_choice, recordingId } = req.body

        // Per-recording message cap check — must happen synchronously before
        // the Future pipeline to ensure the counter is updated atomically.
        if (recordingId) {
          const session = (
            req as FastifyRequest & {
              session: { subjectId: string; id: string } | null
            }
          ).session
          const count = recordingMessageCounts.get(recordingId) ?? 0
          if (count >= agenticMaxMessagesPerRecording) {
            req.log.warn(
              {
                user_id: session?.subjectId ?? null,
                recording_id: recordingId,
                limit_type: 'agentic_recording_cap',
              },
              'rate_limit_exceeded'
            )
            res
              .status(429)
              .send({ error: 'rate_limit_exceeded', retryAfter: 0 })
            return
          }
          recordingMessageCounts.set(recordingId, count + 1)
        }

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

    app.post('/feedback', { schema: feedbackSchema }, (req, res) => {
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
    })
  }
}
