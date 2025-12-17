import { defaultEnv as env } from '~/config/env'
import { HttpClient } from '~/modules/http'

interface ChatContextMessage {
  role: 'assistant' | 'system' | 'user'
  content: string
}

export function createAgenticService(httpClient: HttpClient) {
  function getStreamingResponse(messages: Array<ChatContextMessage>) {
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
        messages,
      }),
    })
  }

  return {
    getStreamingResponse,
  }
}

export type AgenticService = ReturnType<typeof createAgenticService>
