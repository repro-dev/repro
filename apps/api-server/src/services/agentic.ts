import { AGENTIC_DEFAULT_MODEL } from '@repro/domain'
import { FutureInstance, map, reject } from 'fluture'
import { defaultEnv as env } from '~/config/env'
import { Database, attemptQuery, decodeId } from '~/modules/database'
import { HttpClient } from '~/modules/http'
import { badRequest } from '~/utils/errors'

interface ToolCallContext {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

// Vision content block types for OpenAI-compatible APIs (e.g. image_url)
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type ChatContextMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: Array<ToolCallContext> }
  // Tool results may carry an image content block (e.g. captureScreenshot)
  | {
      role: 'tool'
      content: string | Array<ContentBlock>
      tool_call_id: string
    }

interface Tool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters?: object
  }
}

interface AgenticServiceOptions {
  modelId?: string
}

function getReasoningOptionsForModel(modelId: string) {
  if (!modelId.startsWith('openai/')) {
    return {}
  }

  return {
    reasoning: {
      effort: 'medium' as const,
      exclude: true as const,
    },
  }
}

export function createAgenticService(
  database: Database,
  httpClient: HttpClient,
  options: AgenticServiceOptions = {}
) {
  function getStreamingResponse(
    messages: Array<ChatContextMessage>,
    tools: Array<Tool>,
    toolChoice?: string
  ) {
    const modelId = options.modelId ?? AGENTIC_DEFAULT_MODEL

    return httpClient.request({
      method: 'POST',
      origin: 'https://openrouter.ai',
      path: '/api/v1/chat/completions',

      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        model: modelId,
        stream: true,
        tool_choice: toolChoice ?? 'auto',
        tools,
        messages,
        ...getReasoningOptionsForModel(modelId),
      }),
    })
  }

  function recordFeedback(
    userId: string,
    sentiment: 'positive' | 'negative',
    promptVersion: string,
    comment: string | null,
    recordingId: string | null
  ): FutureInstance<Error, void> {
    const numericUserId = decodeId(userId)
    if (numericUserId === null) {
      return reject(badRequest('Invalid user ID'))
    }
    return attemptQuery(() =>
      database
        .insertInto('agentic_feedback')
        .values({
          userId: numericUserId,
          sentiment,
          promptVersion,
          comment,
          recordingId,
        })
        .execute()
    ).pipe(map(() => undefined))
  }

  return {
    getStreamingResponse,
    recordFeedback,
  }
}

export type AgenticService = ReturnType<typeof createAgenticService>
