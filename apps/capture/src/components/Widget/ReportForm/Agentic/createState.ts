import { ApiClient } from '@repro/api-client'
import { atom, createAtom } from '@repro/atom'
import { observeFuture } from '@repro/future-utils'
import { randomString } from '@repro/random-string'
import { parse } from 'event-stream-parser'
import { attemptP, chain, FutureInstance } from 'fluture'
import {
  distinctUntilChanged,
  endWith,
  filter,
  from,
  map,
  merge,
  ReadableStreamLike,
  scan,
  Subject,
  Subscription,
  switchMap,
  takeWhile,
  withLatestFrom,
} from 'rxjs'
import { SYSTEM_CARD_MESSAGE } from './model/system'
import { executeTool, tools } from './model/tools'
import {
  AgenticState,
  AssistantMessage,
  Context,
  Entry,
  Loading,
  ToolCall,
  ToolMessage,
} from './types'

interface OrderedEntryMap {
  orderedIds: Array<string>
  entries: Record<string, Entry>
}

interface ToolCallDelta {
  index: number
  id?: string
  function?: {
    name?: string
    arguments?: string
  }
}

interface MessageDeltaLike {
  choices: [
    {
      delta: {
        content?: string
        reasoning?: string
        tool_calls?: Array<ToolCallDelta>
      }
    },
  ]
}

interface MessageChunk {
  type: 'message'
  data: AssistantMessage
}

interface CompletionChunk {
  type: 'completion'
}

type Chunk = MessageChunk | CompletionChunk

function createEntryId() {
  return randomString(5)
}

function safeParse(data: unknown) {
  try {
    return JSON.parse(data as string)
  } catch {
    return data
  }
}

function isValidMessageDelta(data: any): data is MessageDeltaLike {
  return (
    data != null &&
    'choices' in data &&
    Array.isArray(data.choices) &&
    data.choices[0]?.delta != null
  )
}

function accumulateToolCalls(
  existing: Array<ToolCall>,
  deltas: Array<ToolCallDelta>
): Array<ToolCall> {
  const toolCalls = [...existing]

  for (const delta of deltas) {
    const idx = delta.index
    const current = toolCalls[idx]

    if (current === undefined) {
      toolCalls[idx] = {
        id: delta.id ?? '',
        index: idx,
        function: {
          name: delta.function?.name ?? '',
          arguments: delta.function?.arguments ?? '',
        },
      }
    } else {
      toolCalls[idx] = {
        ...current,
        id: current.id || (delta.id ?? ''),
        function: {
          name: delta.function?.name || current.function.name,
          arguments:
            current.function.arguments + (delta.function?.arguments ?? ''),
        },
      }
    }
  }

  return toolCalls
}

export function createAgenticState(apiClient: ApiClient): AgenticState {
  const [$entryMap, setEntryMap] = createAtom<OrderedEntryMap>({
    orderedIds: [],
    entries: {},
  })

  const [$loading, setLoading] = createAtom<Loading>('none')

  const subscription = new Subscription()
  const toolCallTrigger$ = new Subject<void>()

  function destroy() {
    toolCallTrigger$.complete()
    subscription.unsubscribe()
  }

  function query(input: string) {
    setLoading('reasoning')

    const id = createEntryId()

    setEntryMap(entryMap => ({
      orderedIds: [...entryMap.orderedIds, id],
      entries: {
        ...entryMap.entries,
        [id]: {
          id,
          timestamp: new Date(),
          role: 'user',
          content: input,
        },
      },
    }))
  }

  function fetchResponse(
    context: Context
  ): FutureInstance<unknown, ReadableStream<MessageEvent<any>>> {
    const response = apiClient.fetch<ReadableStream>(
      '/agentic/response',
      {
        method: 'POST',
        body: JSON.stringify({
          messages: [
            { role: 'system', content: SYSTEM_CARD_MESSAGE },
            ...context,
          ],
          tools,
          tool_choice: 'auto',
        }),
      },
      'json',
      'stream'
    )

    return response.pipe(chain(stream => attemptP(() => parse(stream))))
  }

  function appendToolMessage(toolMessage: ToolMessage) {
    setEntryMap(entryMap => ({
      orderedIds: [...entryMap.orderedIds, toolMessage.id],
      entries: {
        ...entryMap.entries,
        [toolMessage.id]: toolMessage,
      },
    }))
  }

  async function executeToolCalls(
    toolCalls: Array<ToolCall>
  ): Promise<Array<ToolMessage>> {
    const results: Array<ToolMessage> = []
    const denseToolCalls = toolCalls.filter(Boolean)

    for (const toolCall of denseToolCalls) {
      let content: string

      try {
        const args = toolCall.function.arguments
          ? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>)
          : {}
        content = JSON.stringify(executeTool(toolCall.function.name, args))
      } catch (err) {
        content = JSON.stringify({
          error: err instanceof Error ? err.message : 'Tool execution failed',
        })
      }

      const toolMessage: ToolMessage = {
        id: createEntryId(),
        timestamp: new Date(),
        role: 'tool',
        content,
        tool_call_id: toolCall.id,
      }

      results.push(toolMessage)
    }

    return results
  }

  const entries$ = $entryMap
    .asObservable()
    .pipe(
      map(entryMap =>
        entryMap.orderedIds
          .map(id => entryMap.entries[id] ?? null)
          .filter(maybeEntry => maybeEntry !== null)
      )
    )

  const modelContext$ = entries$.pipe(
    map<Array<Entry>, Context>(entries =>
      entries.map<Context[number]>(entry => {
        switch (entry.role) {
          case 'assistant': {
            const ctx: Context[number] = {
              role: entry.role,
              content: entry.content,
            }

            if (entry.toolCalls.length > 0) {
              return {
                ...ctx,
                tool_calls: entry.toolCalls.map(tc => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: tc.function,
                })),
              }
            }

            return ctx
          }

          case 'system':
          case 'user':
            return {
              role: entry.role,
              content: entry.content,
            }

          case 'tool':
            return {
              role: entry.role,
              tool_call_id: entry.tool_call_id,
              content: entry.content,
            }
        }
      })
    )
  )

  const latestEntry$ = $entryMap.asObservable().pipe(
    map(entryMap => {
      const entryId = entryMap.orderedIds.at(-1) ?? null

      if (entryId === null) {
        return null
      }

      return entryMap.entries[entryId] ?? null
    }),
    distinctUntilChanged()
  )

  const latestUserEntry$ = latestEntry$.pipe(
    filter(entry => entry !== null && entry.role === 'user')
  )

  function createResponseStream(context: Context) {
    const responseEntryId = createEntryId()

    const initialMessage: AssistantMessage = {
      id: responseEntryId,
      timestamp: new Date(),
      role: 'assistant',
      content: '',
      toolCalls: [],
    }

    const chunks$ = observeFuture(fetchResponse(context)).pipe(
      switchMap(stream =>
        from(stream as ReadableStreamLike<MessageEvent<any>>)
      ),
      takeWhile(event => event.data !== '[DONE]'),
      map(event => safeParse(event.data)),
      filter(data => isValidMessageDelta(data))
    )

    return chunks$.pipe(
      scan((message, chunk) => {
        const delta = chunk.choices[0].delta
        const content = message.content + (delta.content ?? '')
        const toolCalls = delta.tool_calls
          ? accumulateToolCalls(message.toolCalls, delta.tool_calls)
          : message.toolCalls
        return { ...initialMessage, content, toolCalls }
      }, initialMessage),
      map<AssistantMessage, Chunk>(data => ({
        type: 'message',
        data,
      })),
      endWith<Chunk>({ type: 'completion' })
    )
  }

  const userTriggered$ = latestUserEntry$.pipe(
    distinctUntilChanged(),
    withLatestFrom(modelContext$),
    map(([, context]) => context)
  )

  const toolCallTriggered$ = toolCallTrigger$.pipe(
    withLatestFrom(modelContext$),
    map(([, context]) => context)
  )

  const response$ = merge(userTriggered$, toolCallTriggered$).pipe(
    switchMap(context => createResponseStream(context))
  )

  subscription.add(
    response$.subscribe(chunk => {
      switch (chunk.type) {
        case 'message': {
          const message = chunk.data

          if (message.content !== '') {
            setLoading('responding')
          }

          setEntryMap(entryMap => {
            return {
              orderedIds: entryMap.entries[message.id]
                ? entryMap.orderedIds
                : [...entryMap.orderedIds, message.id],
              entries: {
                ...entryMap.entries,
                [message.id]: message,
              },
            }
          })

          break
        }

        case 'completion': {
          const entryMap = $entryMap.getValue()
          const lastId = entryMap.orderedIds.at(-1)
          const lastEntry = lastId ? (entryMap.entries[lastId] ?? null) : null

          if (
            lastEntry !== null &&
            lastEntry.role === 'assistant' &&
            lastEntry.toolCalls.length > 0
          ) {
            setLoading('tool-executing')

            executeToolCalls(lastEntry.toolCalls).then(toolMessages => {
              for (const toolMessage of toolMessages) {
                appendToolMessage(toolMessage)
              }

              setLoading('reasoning')
              toolCallTrigger$.next()
            })
          } else {
            setLoading('none')
          }

          break
        }
      }
    })
  )

  return {
    $entries: atom.from(entries$, []),
    $loading,

    destroy,
    query,
  }
}
