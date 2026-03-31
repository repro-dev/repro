import { FutureInstance, map } from 'fluture'
import { defaultEnv as env } from '~/config/env'
import { Database, attemptQuery } from '~/modules/database'
import { HttpClient } from '~/modules/http'

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
  | { role: 'tool'; content: string | Array<ContentBlock>; tool_call_id: string }

interface Tool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters?: object
  }
}

export function createAgenticService(database: Database, httpClient: HttpClient) {
  function getStreamingResponse(
    messages: Array<ChatContextMessage>,
    tools: Array<Tool>,
    toolChoice?: string
  ) {
    return httpClient.request({
      method: 'POST',
      origin: 'https://openrouter.ai',
      path: '/api/v1/chat/completions',

      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        stream: true,
        tool_choice: toolChoice ?? 'auto',
        tools,
        messages,
        reasoning: {
          effort: 'medium',
          exclude: true,
        },
      }),
    })
  }

  function recordFeedback(
    userId: number,
    sentiment: 'positive' | 'negative',
    promptVersion: string,
    comment: string | null,
    recordingId: string | null
  ): FutureInstance<Error, void> {
    return attemptQuery(() =>
      database
        .insertInto('agentic_feedback')
        .values({ userId, sentiment, promptVersion, comment, recordingId })
        .execute()
    ).pipe(map(() => undefined))
  }

  return {
    getStreamingResponse,
    recordFeedback,
  }
}

export type AgenticService = ReturnType<typeof createAgenticService>
