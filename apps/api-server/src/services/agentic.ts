import { defaultEnv as env } from '~/config/env'
import { HttpClient } from '~/modules/http'

interface ToolCallContext {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

type ChatContextMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: Array<ToolCallContext> }
  | { role: 'tool'; content: string; tool_call_id: string }

interface Tool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters?: object
  }
}

export function createAgenticService(httpClient: HttpClient) {
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

  return {
    getStreamingResponse,
  }
}

export type AgenticService = ReturnType<typeof createAgenticService>
