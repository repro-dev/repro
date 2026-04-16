import { AGENTIC_DEFAULT_MODEL } from '@repro/domain'
import { FutureInstance, map, reject } from 'fluture'
import { PassThrough, Readable } from 'node:stream'
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
  | {
      role: 'assistant'
      content: string
      tool_calls?: Array<ToolCallContext>
    }
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

// Minimal logger interface satisfied by pino (req.log in Fastify).
// Keeps the service decoupled from the HTTP layer.
export interface AgenticLogger {
  info(payload: Record<string, unknown>, message: string): void
  warn(payload: Record<string, unknown>, message: string): void
  error(payload: Record<string, unknown>, message: string): void
}

// Pricing constants for MiniMax M2.7 (the current AGENTIC_DEFAULT_MODEL).
// Source: OpenRouter model catalogue, reviewed 2026-03-28.
// Update these when pricing changes or the default model is swapped.
// Input:  $0.30 per 1,000,000 tokens
// Output: $1.20 per 1,000,000 tokens
const INPUT_PRICE_PER_TOKEN = 0.3 / 1_000_000
const OUTPUT_PRICE_PER_TOKEN = 1.2 / 1_000_000

// Tools that deal with DOM node IDs — we track "node not found" rates for these.
const NODE_ID_TOOLS = new Set([
  'getDOMState',
  'getElementDetails',
  'getDOMDiff',
])

// Sentinel: when a tool result contains this phrase the nodeId was invalid/stale.
// Matches the error string emitted by the DOM tool implementations.
const NODE_NOT_FOUND_SENTINEL = 'node not found'

export function createAgenticService(
  database: Database,
  httpClient: HttpClient
) {
  function getStreamingResponse(
    messages: Array<ChatContextMessage>,
    tools: Array<Tool>,
    toolChoice: string | undefined,
    conversationId: string,
    logger: AgenticLogger
  ): FutureInstance<Error, Readable> {
    const streamStartTime = Date.now()
    let firstTokenTime: number | null = null

    // Per-request observability state
    // Track unique tool call IDs: in OpenRouter streaming a single tool call
    // is spread across multiple delta chunks; only the first chunk carries an
    // `id` field. Counting IDs rather than chunks avoids overcounting.
    const toolCallIds = new Set<string>()
    let toolCallStartTime: number | null = null
    let totalToolExecutionMs = 0
    let promptTokens = 0
    let completionTokens = 0

    // Carries a partial SSE line across chunk boundaries
    let lineBuffer = ''

    return httpClient
      .request({
        method: 'POST',
        origin: 'https://openrouter.ai',
        path: '/api/v1/chat/completions',

        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          model: AGENTIC_DEFAULT_MODEL,
          stream: true,
          tool_choice: toolChoice ?? 'auto',
          tools,
          messages,
          // `reasoning.effort` is only supported by OpenAI models (o1/o3/GPT-5
          // series). When the model is configurable this guard must be preserved.
          reasoning: {
            effort: 'medium',
            exclude: true,
          },
        }),
      })
      .pipe(
        map(response => {
          const pass = new PassThrough()

          response.body.pipe(pass)

          // We observe the stream on the PassThrough's 'data' event.
          // The stream is already flowing to the client via the pipe above;
          // listening here does not consume chunks — PassThrough buffers and
          // re-emits to all consumers.
          pass.on('data', (chunk: Buffer) => {
            const text = chunk.toString()

            if (firstTokenTime === null) {
              firstTokenTime = Date.now()
            }

            // Accumulate partial lines across chunk boundaries
            lineBuffer += text
            const lines = lineBuffer.split('\n')
            // Keep the last (potentially incomplete) segment for next chunk
            lineBuffer = lines.pop() ?? ''

            for (const rawLine of lines) {
              const line = rawLine.trim()
              if (!line.startsWith('data:')) {
                continue
              }

              const data = line.slice(5).trim()
              if (data === '[DONE]') {
                continue
              }

              let parsed: Record<string, unknown>
              try {
                parsed = JSON.parse(data) as Record<string, unknown>
              } catch {
                // Malformed SSE chunk — skip silently
                continue
              }

              // Extract token usage from the final chunk (OpenRouter appends
              // usage to the last data event before [DONE])
              const usage = parsed['usage'] as
                | { prompt_tokens?: number; completion_tokens?: number }
                | undefined
              if (usage) {
                promptTokens = usage.prompt_tokens ?? 0
                completionTokens = usage.completion_tokens ?? 0
              }

              // Inspect delta for tool calls and node-ID validity
              const choices = parsed['choices'] as
                | Array<{
                    delta?: {
                      tool_calls?: Array<{
                        id: string
                        function: { name: string; arguments: string }
                      }>
                    }
                  }>
                | undefined

              if (choices && choices.length > 0) {
                const delta = choices[0]?.delta

                if (delta?.tool_calls && delta.tool_calls.length > 0) {
                  // Track when the first tool call chunk starts for timing
                  if (toolCallStartTime === null) {
                    toolCallStartTime = Date.now()
                  }
                  // Only the first delta chunk for a tool call carries an id.
                  // Collect unique IDs to avoid overcounting streamed chunks.
                  for (const tc of delta.tool_calls) {
                    if (tc.id) {
                      toolCallIds.add(tc.id)
                    }
                  }
                }
              }
            }
          })

          pass.on('end', () => {
            const endTime = Date.now()

            // Emit token usage and cost estimate
            if (promptTokens > 0 || completionTokens > 0) {
              const costEstimateUsd =
                promptTokens * INPUT_PRICE_PER_TOKEN +
                completionTokens * OUTPUT_PRICE_PER_TOKEN

              logger.info(
                {
                  event: 'agentic.token_usage',
                  conversation_id: conversationId,
                  prompt_tokens: promptTokens,
                  completion_tokens: completionTokens,
                  cost_estimate_usd: Number(costEstimateUsd.toFixed(6)),
                  timestamp: new Date().toISOString(),
                },
                'agentic token usage'
              )
            }

            // Emit latency metrics
            const timeToFirstTokenMs =
              firstTokenTime !== null ? firstTokenTime - streamStartTime : null

            if (toolCallStartTime !== null) {
              totalToolExecutionMs = endTime - toolCallStartTime
            }

            logger.info(
              {
                event: 'agentic.latency',
                conversation_id: conversationId,
                time_to_first_token_ms: timeToFirstTokenMs,
                total_round_trip_ms: endTime - streamStartTime,
                tool_execution_ms:
                  totalToolExecutionMs > 0 ? totalToolExecutionMs : null,
              },
              'agentic latency'
            )

            // Emit tool depth per request (user message is the trigger for
            // this round-trip; user_message_index is always 0 in v1 since each
            // HTTP request carries exactly one user turn)
            if (toolCallIds.size > 0) {
              logger.info(
                {
                  event: 'agentic.tool_depth',
                  conversation_id: conversationId,
                  user_message_index: 0,
                  tool_call_count: toolCallIds.size,
                },
                'agentic tool depth'
              )
            }
          })

          return pass as unknown as Readable
        })
      )
  }

  // Log tool result outcomes — called by the router after dispatching a tool.
  // Separated from getStreamingResponse so it can be called independently for
  // tools that are executed outside the SSE stream (future use).
  function logToolResult(
    logger: AgenticLogger,
    conversationId: string,
    toolName: string,
    success: boolean,
    durationMs: number,
    errorType?: string
  ): void {
    logger.info(
      {
        event: 'agentic.tool_result',
        conversation_id: conversationId,
        tool_name: toolName,
        success,
        duration_ms: durationMs,
        ...(errorType !== undefined ? { error_type: errorType } : {}),
      },
      'agentic tool result'
    )
  }

  // Log nodeId validity for DOM tools — called whenever a DOM tool returns.
  // tool_name must be one of: getDOMState, getElementDetails, getDOMDiff.
  function logNodeIdValidity(
    logger: AgenticLogger,
    conversationId: string,
    toolName: string,
    nodeId: string,
    resultText: string
  ): void {
    // Only instrument the three DOM tools that deal with node IDs
    if (!NODE_ID_TOOLS.has(toolName)) {
      return
    }

    const valid = !resultText.toLowerCase().includes(NODE_NOT_FOUND_SENTINEL)

    logger.info(
      {
        event: 'agentic.nodeid_validity',
        conversation_id: conversationId,
        tool_name: toolName,
        node_id: nodeId,
        valid,
        timestamp: new Date().toISOString(),
      },
      'agentic nodeid validity'
    )
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
    logToolResult,
    logNodeIdValidity,
    recordFeedback,
  }
}

export type AgenticService = ReturnType<typeof createAgenticService>
