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
  ReadableStreamLike,
  scan,
  Subscription,
  switchMap,
  takeWhile,
  withLatestFrom,
} from 'rxjs'
import {
  AgenticState,
  AssistantMessage,
  Context,
  Entry,
  Loading,
} from './types'

interface OrderedEntryMap {
  orderedIds: Array<string>
  entries: Record<string, Entry>
}

interface MessageDeltaLike {
  choices: [
    {
      delta: {
        content?: string
        reasoning?: string
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
    data.choices[0]?.delta != null &&
    (typeof data.choices[0].delta.reasoning === 'string' ||
      typeof data.choices[0].delta.content === 'string')
  )
}

export function createAgenticState(apiClient: ApiClient): AgenticState {
  const [$entryMap, setEntryMap] = createAtom<OrderedEntryMap>({
    orderedIds: [],
    entries: {},
  })

  const [$loading, setLoading] = createAtom<Loading>('none')

  const subscription = new Subscription()

  function destroy() {
    subscription.unsubscribe()
  }

  function query(input: string) {
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

    setLoading('reasoning')
  }

  function fetchResponse(
    context: Context
  ): FutureInstance<unknown, ReadableStream<MessageEvent<any>>> {
    const response = apiClient.fetch<ReadableStream>(
      '/agentic/response',
      {
        method: 'POST',
        body: JSON.stringify({ messages: context }),
      },
      'json',
      'stream'
    )

    return response.pipe(chain(stream => attemptP(() => parse(stream))))
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
    map(entries =>
      entries.map(entry => ({ role: entry.role, content: entry.content }))
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

  const response$ = latestUserEntry$.pipe(
    distinctUntilChanged(),
    withLatestFrom(modelContext$),
    switchMap(([, context]) => {
      const responseEntryId = createEntryId()

      const initialMessage: AssistantMessage = {
        id: responseEntryId,
        timestamp: new Date(),
        role: 'assistant',
        content: '',
        reasoning: '',
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
          const reasoning = message.reasoning + (delta.reasoning ?? '')
          const content = message.content + (delta.content ?? '')
          return { ...initialMessage, content, reasoning }
        }, initialMessage),
        map<AssistantMessage, Chunk>(data => ({
          type: 'message',
          data,
        })),
        endWith<Chunk>({ type: 'completion' })
      )
    })
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
          setLoading('none')
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
