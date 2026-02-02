import { defaultEnv as env } from '~/config/env'
import { HttpClient } from '~/modules/http'

interface ChatContextMessage {
  role: 'assistant' | 'system' | 'user'
  content: string
}

interface Tool {
  type: 'function'
  name: string
  description: string
  parameters?: object
}

export function createAgenticService(httpClient: HttpClient) {
  function getStreamingResponse(
    messages: Array<ChatContextMessage>,
    tools: Array<Tool>
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
        tool_choice: 'auto',
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
