import { atom, createAtom } from '@repro/atom'
import { AGENTIC_DEFAULT_MODEL } from '@repro/domain'
import { observeFuture } from '@repro/future-utils'
import { randomString } from '@repro/random-string'
import { FutureInstance, map as mapFuture, parallel, resolve } from 'fluture'
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
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
import {
  computeContextBudget,
  purgeErroredToolCallInputs,
  truncateToContextBudget,
} from './model/context-window'
import { SYSTEM_CARD_MESSAGE } from './model/system'
import { estimateTokens } from './model/token-optimization'
import { executeTool, tools } from './model/tools/index'
import {
  AgenticError,
  AgenticState,
  AssistantMessage,
  ContentBlock,
  Context,
  Entry,
  Loading,
  RecordingDataAccessor,
  StreamProvider,
  ToolCall,
  ToolDefinition,
  ToolMessage,
} from './types'

interface OrderedEntryMap {
  orderedIds: Array<string>
  entries: Record<string, Entry>
}

export interface ToolCallDelta {
  index: number
  id?: string
  function?: {
    name?: string
    arguments?: string
  }
}

export interface MessageDeltaLike {
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

// Use the canonical default from @repro/domain so the model choice is
// maintained in one place alongside all other MODEL_CONFIGS entries.
const AGENTIC_MODEL = AGENTIC_DEFAULT_MODEL

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

// Builds the content for a ToolMessage. For captureScreenshot results that
// include a dataUrl, returns an array of vision content blocks so the LLM
// can actually see the image. Falls back to plain JSON string for all other
// tools and for screenshot results where the dataUrl is missing/invalid.
export function buildToolMessageContent(
  toolName: string,
  output: unknown
): string | Array<ContentBlock> {
  if (
    toolName === 'captureScreenshot' &&
    output !== null &&
    typeof output === 'object' &&
    'dataUrl' in output &&
    typeof (output as Record<string, unknown>).dataUrl === 'string'
  ) {
    const { timestampMs, dataUrl } = output as {
      timestampMs?: number
      dataUrl: string
    }
    const timestampLabel =
      timestampMs !== undefined ? ` at ${timestampMs}ms` : ''
    return [
      { type: 'text', text: `Screenshot captured${timestampLabel}.` },
      { type: 'image_url', image_url: { url: dataUrl } },
    ]
  }

  return JSON.stringify(output)
}

export function isValidMessageDelta(data: any): data is MessageDeltaLike {
  return (
    data != null &&
    typeof data === 'object' &&
    'choices' in data &&
    Array.isArray(data.choices) &&
    data.choices[0]?.delta != null
  )
}

export function accumulateToolCalls(
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

export function executeToolCalls(
  recording: RecordingDataAccessor,
  toolCalls: Array<ToolCall>,
  createId: () => string = createEntryId,
  executeFn: (
    recording: RecordingDataAccessor,
    name: string,
    args: Record<string, unknown>
  ) => FutureInstance<unknown, unknown> = executeTool
): FutureInstance<unknown, Array<ToolMessage>> {
  const denseToolCalls = toolCalls.filter(Boolean)

  if (denseToolCalls.length === 0) {
    return resolve([])
  }

  // Build one Future per tool call, all starting concurrently via parallel(Infinity).
  // Results arrive in the original call order because fluture's parallel preserves
  // index ordering — the fastest call does not shift its result to index 0.
  const futures = denseToolCalls.map(toolCall => {
    let toolFut: FutureInstance<unknown, unknown>
    try {
      const args = toolCall.function.arguments
        ? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>)
        : {}
      toolFut = executeFn(recording, toolCall.function.name, args)
    } catch (err) {
      toolFut = resolve({
        error: err instanceof Error ? err.message : 'Tool execution failed',
      })
    }

    return toolFut.pipe(
      mapFuture(output => {
        const toolMessage: ToolMessage = {
          id: createId(),
          timestamp: new Date(),
          role: 'tool',
          content: buildToolMessageContent(toolCall.function.name, output),
          tool_call_id: toolCall.id,
        }
        return toolMessage
      })
    )
  })

  // parallel(Infinity) runs all futures at once and resolves with results in
  // the same order as the input array, regardless of completion order.
  return parallel(Infinity)(futures)
}

// Identifies the tool_call_ids of the first findErrors and getEvents calls in
// the context. These are the Orient phase tool results that must be preserved
// during context-window truncation.
export function getOrientPhaseToolCallIds(context: Context): Set<string> {
  const ids = new Set<string>()
  let foundFindErrors = false
  let foundGetEvents = false

  for (const msg of context) {
    if (msg.role !== 'assistant') continue

    const toolCalls = 'tool_calls' in msg ? msg.tool_calls : undefined
    if (!toolCalls) continue

    for (const tc of toolCalls) {
      if (!foundFindErrors && tc.function.name === 'findErrors') {
        ids.add(tc.id)
        foundFindErrors = true
      }
      if (!foundGetEvents && tc.function.name === 'getEvents') {
        ids.add(tc.id)
        foundGetEvents = true
      }
    }

    // Stop scanning once both orient calls have been found
    if (foundFindErrors && foundGetEvents) break
  }

  return ids
}

// Sorts the keys of a plain object recursively so that two semantically
// identical argument objects with different key insertion order produce the
// same JSON string.
function sortedArgs(args: unknown): unknown {
  if (args === null || typeof args !== 'object') return args
  if (Array.isArray(args)) return args.map(sortedArgs)
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(args as Record<string, unknown>).sort()) {
    sorted[key] = sortedArgs((args as Record<string, unknown>)[key])
  }
  return sorted
}

// Removes older duplicate tool call pairs (assistant tool-use block + matching
// tool result) from the context, keeping only the most recent result for each
// unique (toolName, normalisedArgs) signature.
//
// Protected IDs (Orient phase calls) are never removed, even if an identical
// call appears later in the context — the protected copy is kept unconditionally
// and the later duplicate is the one that gets dropped.
export function deduplicateToolCalls(
  context: Context,
  protectedIds: Set<string>
): Context {
  // Build a signature for each tool call id that appears in the context so we
  // can identify duplicates.
  const sigById = new Map<string, string>()
  for (const msg of context) {
    if (msg.role !== 'assistant') continue
    const toolCalls = 'tool_calls' in msg ? msg.tool_calls : undefined
    if (!toolCalls) continue
    for (const tc of toolCalls) {
      let parsed: unknown
      try {
        parsed = JSON.parse(tc.function.arguments)
      } catch {
        // Unparseable arguments — use the raw string verbatim
        parsed = tc.function.arguments
      }
      const sig = `${tc.function.name}::${JSON.stringify(sortedArgs(parsed))}`
      sigById.set(tc.id, sig)
    }
  }

  // Walk forward to find the most recent occurrence of each signature,
  // respecting protected IDs: a protected call is always "most recent" for its
  // signature so that a later unprotected duplicate gets dropped rather than
  // the protected one.
  const lastIdBySig = new Map<string, string>() // sig → last id (protected or not)
  for (const [id, sig] of sigById) {
    lastIdBySig.set(sig, id)
  }

  // Precompute the set of signatures that have at least one protected id so
  // the drop loop below is O(n) instead of O(n²).
  const protectedSigs = new Set<string>()
  for (const [id, sig] of sigById) {
    if (protectedIds.has(id)) protectedSigs.add(sig)
  }

  const dropIds = new Set<string>()
  for (const [id, sig] of sigById) {
    if (protectedIds.has(id)) continue // protected calls are never dropped
    const lastForSig = lastIdBySig.get(sig)
    if (lastForSig !== id) {
      // There is a newer occurrence — drop this one
      dropIds.add(id)
    } else if (protectedSigs.has(sig)) {
      // This is the last unprotected occurrence but a protected call shares
      // the same signature — the protected copy wins, so drop this one too.
      dropIds.add(id)
    }
  }

  if (dropIds.size === 0) return context

  // Use flatMap so that an assistant message can be either kept as-is,
  // replaced with a pruned version (some tool_calls removed), or dropped
  // entirely (all tool_calls removed) — all in a single pass.
  return context.flatMap((msg): Array<Context[number]> => {
    if (msg.role === 'tool') {
      // Drop tool result messages whose call was deduplicated away.
      return dropIds.has(msg.tool_call_id) ? [] : [msg]
    }

    if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
      // Remove individual dropped tool_call entries from this message.
      const survivingCalls = msg.tool_calls.filter(tc => !dropIds.has(tc.id))

      if (survivingCalls.length === 0) {
        // All tool_calls were dropped — remove the entire assistant message.
        return []
      }

      if (survivingCalls.length === msg.tool_calls.length) {
        // Nothing changed — pass through unchanged.
        return [msg]
      }

      // Some calls were dropped — return the message with the pruned list.
      return [{ ...msg, tool_calls: survivingCalls }]
    }

    return [msg]
  })
}

export const MAX_TOOL_ITERATIONS = 25

export function buildIterationLimitMessage(id: string): AssistantMessage {
  return {
    id,
    timestamp: new Date(),
    role: 'assistant',
    content: `Analysis reached the iteration limit (${MAX_TOOL_ITERATIONS} tool calls). The investigation was cut short — please try a more specific question or review the findings above.`,
    toolCalls: [],
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false
  }
  if (error != null && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status
    return status === 408 || status === 429 || status === 503
  }
  return true
}

function friendlyMessage(error: unknown, isFinal = false): string {
  if (error != null && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status
    if (status === 401)
      return 'Authentication failed. Please refresh and try again.'
    if (status === 403) return 'Access denied.'
    if (status === 429)
      return isFinal
        ? 'Rate limit reached. Please try again.'
        : 'Rate limit reached. Retrying...'
    if (status === 503)
      return isFinal
        ? 'Connection lost. Please try again.'
        : 'Connection lost. Retrying...'
    if (status === 500) return 'Server error. Please try again.'
  }
  return 'Something went wrong. Please try again.'
}

export function createAgenticState(
  streamProvider: StreamProvider,
  recording: RecordingDataAccessor,
  options?: { tools?: ToolDefinition[] }
): AgenticState {
  const [$entryMap, setEntryMap] = createAtom<OrderedEntryMap>({
    orderedIds: [],
    entries: {},
  })

  const [$loading, setLoading] = createAtom<Loading>('none')
  const [$error, setError] = createAtom<AgenticError | null>(null)
  const [$wasCancelled, setWasCancelled] = createAtom<boolean>(false)
  const [$truncatedBefore, setTruncatedBefore] = createAtom<string | null>(null)

  let currentAbortController: AbortController | null = null
  let currentToolSubscription: Subscription | null = null
  let cancelled = false
  let retryAttempt = 0
  let pendingRetryTimer: ReturnType<typeof setTimeout> | null = null

  const subscription = new Subscription()
  const toolCallTrigger$ = new Subject<void>()
  let iterationCount = 0
  // Maps tool_call_id → iteration count at which the error was recorded.
  // Used by purgeErroredToolCallInputs to strip stale errored inputs from context.
  const erroredToolCalls = new Map<string, number>()
  // Maps entry id → pre-computed token estimate. Populated when an entry is
  // first appended so fetchResponse does not re-tokenise the same text on every call.
  const tokenCache = new Map<string, number>()

  function clearPendingRetry() {
    if (pendingRetryTimer !== null) {
      clearTimeout(pendingRetryTimer)
      pendingRetryTimer = null
    }
  }

  function destroy() {
    clearPendingRetry()
    cancelled = true
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = null
    }
    if (currentToolSubscription) {
      currentToolSubscription.unsubscribe()
      currentToolSubscription = null
    }
    toolCallTrigger$.complete()
    subscription.unsubscribe()
  }

  function cancel() {
    clearPendingRetry()
    cancelled = true
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = null
    }
    if (currentToolSubscription) {
      currentToolSubscription.unsubscribe()
      currentToolSubscription = null
    }
    setWasCancelled(true)
    setLoading('cancelled')
    // Briefly show cancelled state, then reset to idle so the UI unlocks
    setTimeout(() => {
      setLoading('none')
    }, 1500)
  }

  function reset() {
    clearPendingRetry()
    cancelled = false
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = null
    }
    if (currentToolSubscription) {
      currentToolSubscription.unsubscribe()
      currentToolSubscription = null
    }
    iterationCount = 0
    retryAttempt = 0
    erroredToolCalls.clear()
    tokenCache.clear()
    setEntryMap({ orderedIds: [], entries: {} })
    setWasCancelled(false)
    setLoading('none')
    setError(null)
    setTruncatedBefore(null)
  }

  function query(input: string) {
    iterationCount = 0
    cancelled = false
    setWasCancelled(false)
    setError(null)
    retryAttempt = 0
    erroredToolCalls.clear()
    setLoading('reasoning')

    const id = createEntryId()

    // Pre-compute token estimate BEFORE updating the atom. setEntryMap fires
    // RxJS subscribers synchronously, which triggers fetchResponse via the
    // latestUserEntry$ → userTriggered$ → response$ chain. The cache entry
    // must exist before that chain runs so the first fetchResponse call gets a
    // hit rather than re-tokenising the user message.
    tokenCache.set(id, estimateTokens({ role: 'user', content: input }))

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
  ): FutureInstance<unknown, ReadableStream<{ data: string }>> {
    currentAbortController = new AbortController()
    const systemTokens = estimateTokens(SYSTEM_CARD_MESSAGE)
    const budget = computeContextBudget(AGENTIC_MODEL, systemTokens)

    // Identify the first findErrors and getEvents tool results (Orient phase)
    // and protect them from truncation so the model retains its initial grounding.
    const orientIds = getOrientPhaseToolCallIds(context)

    // Remove older duplicate (toolName + args) pairs before computing the
    // budget. Protected orient-phase IDs always survive; later duplicates of
    // those calls are dropped instead.
    const deduplicatedContext = deduplicateToolCalls(context, orientIds)

    // Strip assistant tool-call blocks for errored calls that are older than
    // PURGE_ERROR_TURNS iterations. The ToolMessage result is always kept.
    const purgedContext = purgeErroredToolCallInputs(
      deduplicatedContext,
      erroredToolCalls,
      iterationCount
    )

    // Prune stale entries from erroredToolCalls: once a tool_call_id no longer
    // appears anywhere in the current context (neither as an assistant tool_call
    // nor as a tool result), its entry serves no purpose and would grow the Map
    // unbounded in long sessions.
    const activeToolCallIds = new Set<string>()
    for (const msg of purgedContext) {
      if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          activeToolCallIds.add(tc.id)
        }
      } else if (msg.role === 'tool') {
        activeToolCallIds.add(msg.tool_call_id)
      }
    }
    for (const id of erroredToolCalls.keys()) {
      if (!activeToolCallIds.has(id)) {
        erroredToolCalls.delete(id)
      }
    }

    const isProtected = (msg: Context[number]) => {
      // Protect tool result messages whose tool_call_id is an orient call
      if (msg.role === 'tool' && orientIds.has(msg.tool_call_id)) {
        return true
      }
      // Also protect the assistant message that introduced the orient tool calls.
      // Chat Completions APIs require that any role:"tool" message is preceded by
      // the role:"assistant" message that introduced its tool_call_id. Dropping
      // the assistant message while retaining the tool result would cause an API error.
      if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
        return msg.tool_calls.some(tc => orientIds.has(tc.id))
      }
      return false
    }

    // Build two reference maps keyed by message object identity:
    //
    //   cachedByRef: msg → cached token count
    //     Used by truncateToContextBudget to skip re-tokenising messages whose
    //     count was already computed. Messages that survive dedup/purge with
    //     their original reference get a cache hit; modified/new objects fall
    //     back to estimateTokens.
    //
    //   contextToId: msg → entry ID
    //     Used below to find the ID of the first surviving message after
    //     truncation. Using object references is correct here because
    //     deduplicateToolCalls can shorten the context array, making a positional
    //     index (droppedCount) into purgedContext diverge from the orderedIds
    //     index. User messages and unmodified tool/assistant messages always pass
    //     through as original references, so the lookup succeeds for all common
    //     cases. The rare partially-deduped assistant messages are new objects
    //     and miss the map (fallback: null).
    const contextEntryMap = $entryMap.getValue()
    const cachedByRef = new Map<Context[number], number>()
    const contextToId = new Map<Context[number], string>()
    context.forEach((msg, i) => {
      const id = contextEntryMap.orderedIds[i]
      if (id !== undefined) {
        contextToId.set(msg, id)
        const cached = tokenCache.get(id)
        if (cached !== undefined) {
          cachedByRef.set(msg, cached)
        }
      }
    })

    const { messages: truncatedContext, anyDropped } = truncateToContextBudget(
      purgedContext,
      budget,
      msg => cachedByRef.get(msg) ?? estimateTokens(msg),
      isProtected
    )

    // Update the truncation indicator atom. When messages were dropped, find
    // the entry ID of the first surviving message so the UI can place the
    // separator precisely. Clear the atom when nothing was dropped.
    // Use anyDropped (not droppedCount > 0) so the separator is shown even
    // when a protected message sits at the start of the context (droppedCount=0
    // but gaps exist between retained messages).
    //
    // Look up the first surviving message by object reference rather than by
    // positional index: deduplicateToolCalls can remove entire messages, making
    // purgedContext shorter than context, so droppedCount (an index into
    // purgedContext) no longer maps 1:1 to orderedIds.
    if (anyDropped) {
      const firstMsg = truncatedContext[0]
      const firstSurvivingId =
        (firstMsg !== undefined ? contextToId.get(firstMsg) : undefined) ?? null
      setTruncatedBefore(firstSurvivingId)
    } else {
      setTruncatedBefore(null)
    }

    return streamProvider(
      truncatedContext,
      options?.tools ?? tools,
      currentAbortController.signal
    )
  }

  function appendToolMessage(toolMessage: ToolMessage) {
    // Detect whether the tool result is an error so we can track when it
    // occurred. The same `{ error: string }` shape is used by ToolCallRow
    // for UI error detection.
    const parsed = safeParse(toolMessage.content)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof (parsed as Record<string, unknown>)['error'] === 'string'
    ) {
      erroredToolCalls.set(toolMessage.tool_call_id, iterationCount)
    }

    setEntryMap(entryMap => ({
      orderedIds: [...entryMap.orderedIds, toolMessage.id],
      entries: {
        ...entryMap.entries,
        [toolMessage.id]: toolMessage,
      },
    }))

    // Pre-compute token estimate for this tool entry.
    tokenCache.set(
      toolMessage.id,
      estimateTokens({
        role: 'tool',
        tool_call_id: toolMessage.tool_call_id,
        content: toolMessage.content,
      })
    )
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
      switchMap(stream => from(stream as ReadableStreamLike<{ data: string }>)),
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
      endWith<Chunk>({ type: 'completion' }),
      catchError((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return EMPTY
        }

        const retryable = isRetryable(err)
        const attempt = retryAttempt

        if (retryable && retryAttempt < 2) {
          retryAttempt++
          const delay = Math.pow(2, retryAttempt - 1) * 1000
          pendingRetryTimer = setTimeout(() => {
            pendingRetryTimer = null
            toolCallTrigger$.next()
          }, delay)
          return EMPTY
        }

        setLoading('none')
        setError({
          message: friendlyMessage(err, true),
          retryable,
          attempt,
        })
        return EMPTY
      })
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

          if (!cancelled && message.content !== '') {
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

          // Cache the finalized assistant entry's token estimate. Only done at
          // "completion" (not during "message" chunks) so we tokenise the full
          // content rather than partial in-progress text.
          if (lastId && lastEntry !== null && lastEntry.role === 'assistant') {
            const assistantCtx: Context[number] = {
              role: 'assistant',
              content: lastEntry.content,
              ...(lastEntry.toolCalls.length > 0
                ? {
                    tool_calls: lastEntry.toolCalls.map(tc => ({
                      id: tc.id,
                      type: 'function' as const,
                      function: tc.function,
                    })),
                  }
                : {}),
            }
            tokenCache.set(lastId, estimateTokens(assistantCtx))
          }

          if (
            lastEntry !== null &&
            lastEntry.role === 'assistant' &&
            lastEntry.toolCalls.length > 0
          ) {
            iterationCount += 1

            if (iterationCount >= MAX_TOOL_ITERATIONS) {
              const limitMessage = buildIterationLimitMessage(createEntryId())

              setEntryMap(prev => ({
                orderedIds: [...prev.orderedIds, limitMessage.id],
                entries: {
                  ...prev.entries,
                  [limitMessage.id]: limitMessage,
                },
              }))

              if (!cancelled) {
                setLoading('none')
              }
              break
            }

            if (!cancelled) {
              setLoading('tool-executing')
            }

            currentToolSubscription = observeFuture(
              executeToolCalls(recording, lastEntry.toolCalls)
            ).subscribe(toolMessages => {
              currentToolSubscription = null
              if (!cancelled) {
                for (const toolMessage of toolMessages) {
                  appendToolMessage(toolMessage)
                }
                setLoading('reasoning')
                toolCallTrigger$.next()
              }
            })
          } else {
            retryAttempt = 0
            if (!cancelled) {
              setLoading('none')
            }
          }

          break
        }
      }
    })
  )

  return {
    $entries: atom.from(entries$, []),
    $loading,
    $error,
    $wasCancelled,
    $truncatedBefore,
    cancel,
    destroy,
    query,
    reset,
  }
}
