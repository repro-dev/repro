import { attemptP, chain, FutureInstance, map, resolve } from 'fluture'
import { Readable } from 'stream'
import { defaultEnv as env } from '~/config/env'
import { HttpClient } from '~/modules/http'
import { executeTool, tools } from './agentic-tools'

interface ChatMessage {
  role: 'assistant' | 'system' | 'tool' | 'user'
  content: string | null
  tool_calls?: Array<ToolCallResponse>
  tool_call_id?: string
}

interface ToolCallResponse {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface CompletionResponse {
  choices: Array<{
    message: {
      role: 'assistant'
      content: string | null
      tool_calls?: Array<ToolCallResponse>
    }
    finish_reason: string
  }>
}

function callModel(
  httpClient: HttpClient,
  messages: Array<ChatMessage>,
  stream: boolean
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
      stream,
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

function collectResponseBody(
  body: Readable
): FutureInstance<Error, string> {
  return attemptP(
    () =>
      new Promise<string>((res, rej) => {
        const chunks: Array<Buffer> = []
        body.on('data', (chunk: Buffer) => chunks.push(chunk))
        body.on('end', () => res(Buffer.concat(chunks).toString('utf-8')))
        body.on('error', rej)
      })
  )
}

function parseCompletion(raw: string): CompletionResponse {
  return JSON.parse(raw) as CompletionResponse
}

function executeToolCalls(
  toolCalls: Array<ToolCallResponse>
): Array<ChatMessage> {
  return toolCalls.map(tc => {
    let content: string

    try {
      const args = tc.function.arguments
        ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
        : {}
      content = JSON.stringify(executeTool(tc.function.name, args))
    } catch (err) {
      content = JSON.stringify({
        error: err instanceof Error ? err.message : 'Tool execution failed',
      })
    }

    return {
      role: 'tool' as const,
      content,
      tool_call_id: tc.id,
    }
  })
}

function textToSSEStream(text: string): Readable {
  const chunk = {
    choices: [
      {
        delta: { content: text },
      },
    ],
  }

  const lines = [
    `data: ${JSON.stringify(chunk)}`,
    '',
    'data: [DONE]',
    '',
  ]

  return Readable.from(lines.join('\n'))
}

function toolLoop(
  httpClient: HttpClient,
  messages: Array<ChatMessage>
): FutureInstance<Error, string> {
  return callModel(httpClient, messages, false)
    .pipe(
      chain(response => collectResponseBody(response.body as Readable))
    )
    .pipe(
      chain(raw => {
        const completion = parseCompletion(raw)
        const choice = completion.choices[0]

        if (!choice) {
          return resolve('')
        }

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: choice.message.content,
          ...(choice.message.tool_calls
            ? { tool_calls: choice.message.tool_calls }
            : {}),
        }

        const updatedMessages = [...messages, assistantMessage]

        if (
          choice.message.tool_calls &&
          choice.message.tool_calls.length > 0
        ) {
          const toolMessages = executeToolCalls(choice.message.tool_calls)
          return toolLoop(httpClient, [...updatedMessages, ...toolMessages])
        }

        return resolve(choice.message.content ?? '')
      })
    )
}

export function createAgenticService(httpClient: HttpClient) {
  function getResponse(
    messages: Array<ChatMessage>
  ): FutureInstance<Error, NodeJS.ReadableStream> {
    return toolLoop(httpClient, messages).pipe(
      map(text => textToSSEStream(text) as unknown as NodeJS.ReadableStream)
    )
  }

  return {
    getResponse,
  }
}

export type AgenticService = ReturnType<typeof createAgenticService>
